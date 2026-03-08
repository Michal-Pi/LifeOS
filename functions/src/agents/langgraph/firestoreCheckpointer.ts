/**
 * Firestore Checkpointer for LangGraph
 *
 * Provides state persistence for LangGraph workflows using Firestore.
 * This enables resumable workflows and human-in-the-loop interactions.
 */

import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint'
import type {
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
  CheckpointListOptions,
  ChannelVersions,
  PendingWrite,
} from '@langchain/langgraph-checkpoint'
import type { RunnableConfig } from '@langchain/core/runnables'
import { getFirestore, type Firestore, type DocumentReference } from 'firebase-admin/firestore'
import { createLogger } from '../../lib/logger.js'
import { CheckpointDocumentSchema } from '@lifeos/agents'
import { validateOrNull, type ValidationContext } from '../shared/firestoreValidation.js'
import { sanitizeForFirestore } from './firestoreSanitizer.js'

const log = createLogger('FirestoreCheckpointer')

/**
 * Configuration for Firestore checkpointer
 */
export interface FirestoreCheckpointerConfig {
  userId: string
  workflowId: string
  runId: string
  db?: Firestore
}

/**
 * Firestore-based checkpoint saver for LangGraph
 *
 * Stores checkpoints in:
 * users/{userId}/workflows/{workflowId}/runs/{runId}/checkpoints/{threadId}
 */
export class FirestoreCheckpointer extends BaseCheckpointSaver {
  private db: Firestore
  private userId: string
  private workflowId: string
  private runId: string

  constructor(config: FirestoreCheckpointerConfig) {
    super()
    this.db = config.db ?? getFirestore()
    this.userId = config.userId
    this.workflowId = config.workflowId
    this.runId = config.runId
  }

  /**
   * Get the Firestore document reference for a checkpoint
   */
  private getCheckpointRef(threadId: string, checkpointId?: string): DocumentReference {
    const basePath = `users/${this.userId}/workflows/${this.workflowId}/runs/${this.runId}/checkpoints/${threadId}`
    if (checkpointId) {
      return this.db.doc(`${basePath}/versions/${checkpointId}`)
    }
    return this.db.doc(basePath)
  }

  /**
   * Get a checkpoint tuple by config
   */
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string | undefined
    if (!threadId) {
      return undefined
    }

    const checkpointId = config.configurable?.checkpoint_id as string | undefined
    const validationContext: ValidationContext = {
      collection: `checkpoints/${threadId}`,
      docId: checkpointId ?? 'latest',
      operation: 'getTuple',
    }

    try {
      if (checkpointId) {
        // Get specific checkpoint version
        const doc = await this.getCheckpointRef(threadId, checkpointId).get()
        if (!doc.exists) {
          return undefined
        }
        const rawData = doc.data()

        // Validate the checkpoint document structure
        const data = validateOrNull(rawData, CheckpointDocumentSchema, validationContext)
        if (!data) {
          return undefined
        }

        return {
          config,
          checkpoint: data.checkpoint as Checkpoint,
          metadata: data.metadata as CheckpointMetadata | undefined,
          parentConfig: data.parentConfig as RunnableConfig | undefined,
        }
      } else {
        // Get latest checkpoint
        const doc = await this.getCheckpointRef(threadId).get()
        if (!doc.exists) {
          return undefined
        }
        const rawData = doc.data()

        // Validate the checkpoint document structure
        const data = validateOrNull(rawData, CheckpointDocumentSchema, validationContext)
        if (!data) {
          return undefined
        }

        return {
          config: {
            ...config,
            configurable: {
              ...config.configurable,
              checkpoint_id: data.checkpointId,
            },
          },
          checkpoint: data.checkpoint as Checkpoint,
          metadata: data.metadata as CheckpointMetadata | undefined,
          parentConfig: data.parentConfig as RunnableConfig | undefined,
        }
      }
    } catch (error) {
      log.error('Error getting checkpoint', error)
      return undefined
    }
  }

  /**
   * List checkpoint tuples for a thread
   */
  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    const threadId = config.configurable?.thread_id as string | undefined
    if (!threadId) {
      return
    }

    try {
      let query = this.db
        .collection(
          `users/${this.userId}/workflows/${this.workflowId}/runs/${this.runId}/checkpoints/${threadId}/versions`
        )
        .orderBy('timestamp', 'desc')

      if (options?.limit) {
        query = query.limit(options.limit)
      }

      if (options?.before?.configurable?.checkpoint_id) {
        const beforeDoc = await this.getCheckpointRef(
          threadId,
          options.before.configurable.checkpoint_id as string
        ).get()
        if (beforeDoc.exists) {
          const beforeData = beforeDoc.data()
          query = query.where('timestamp', '<', beforeData?.timestamp)
        }
      }

      const snapshot = await query.get()

      for (const doc of snapshot.docs) {
        const rawData = doc.data()

        // Validate each checkpoint document
        const itemValidationContext: ValidationContext = {
          collection: `checkpoints/${threadId}/versions`,
          docId: doc.id,
          operation: 'list',
        }
        const data = validateOrNull(rawData, CheckpointDocumentSchema, itemValidationContext)
        if (!data) {
          log.warn('Skipping invalid checkpoint', { checkpointId: doc.id })
          continue
        }

        yield {
          config: {
            ...config,
            configurable: {
              ...config.configurable,
              checkpoint_id: doc.id,
            },
          },
          checkpoint: data.checkpoint as Checkpoint,
          metadata: data.metadata as CheckpointMetadata | undefined,
          parentConfig: data.parentConfig as RunnableConfig | undefined,
        }
      }
    } catch (error) {
      log.error('Error listing checkpoints', error)
    }
  }

  /**
   * Put a checkpoint
   */
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: ChannelVersions
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id as string | undefined
    if (!threadId) {
      throw new Error('thread_id is required in config.configurable')
    }

    const checkpointId = checkpoint.id ?? `cp_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const timestamp = Date.now()

    const checkpointData = sanitizeForFirestore({
      checkpointId,
      checkpoint,
      metadata,
      parentConfig: config.configurable?.checkpoint_id
        ? { configurable: { checkpoint_id: config.configurable.checkpoint_id } }
        : null,
      timestamp,
    }) as Record<string, unknown>

    // Store in versions subcollection
    try {
      await this.getCheckpointRef(threadId, checkpointId).set(checkpointData)
    } catch (error) {
      log.error('Failed to save checkpoint version', error, { checkpointId, threadId })
      throw error
    }

    // Update latest checkpoint pointer
    try {
      await this.getCheckpointRef(threadId).set({
        ...checkpointData,
        latestCheckpointId: checkpointId,
      })
    } catch (error) {
      log.error('Failed to update latest checkpoint pointer', error, { checkpointId, threadId })
      throw error
    }

    return {
      ...config,
      configurable: {
        ...config.configurable,
        checkpoint_id: checkpointId,
      },
    }
  }

  /**
   * Put writes (for pending writes before checkpoint)
   */
  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const threadId = config.configurable?.thread_id as string | undefined
    if (!threadId) {
      throw new Error('thread_id is required in config.configurable')
    }

    const checkpointId = config.configurable?.checkpoint_id as string | undefined
    if (!checkpointId) {
      // Store as pending writes for the thread
      await this.db
        .doc(
          `users/${this.userId}/workflows/${this.workflowId}/runs/${this.runId}/checkpoints/${threadId}/pendingWrites/${taskId}`
        )
        .set({
          writes,
          timestamp: Date.now(),
        })
      return
    }

    // Store writes associated with checkpoint
    await this.db
      .doc(
        `users/${this.userId}/workflows/${this.workflowId}/runs/${this.runId}/checkpoints/${threadId}/versions/${checkpointId}/writes/${taskId}`
      )
      .set({
        writes,
        timestamp: Date.now(),
      })
  }

  /**
   * Delete a thread's checkpoints
   */
  async delete(threadId: string): Promise<void> {
    try {
      const basePath = `users/${this.userId}/workflows/${this.workflowId}/runs/${this.runId}/checkpoints/${threadId}`

      // Delete versions
      const versionsSnapshot = await this.db.collection(`${basePath}/versions`).get()
      const batch = this.db.batch()

      for (const doc of versionsSnapshot.docs) {
        batch.delete(doc.ref)
      }

      // Delete main document
      batch.delete(this.db.doc(basePath))

      await batch.commit()
    } catch (error) {
      log.error('Error deleting checkpoint', error, { threadId })
    }
  }
}

/**
 * Create a Firestore checkpointer for a specific run
 */
export function createFirestoreCheckpointer(
  userId: string,
  workflowId: string,
  runId: string,
  db?: Firestore
): FirestoreCheckpointer {
  return new FirestoreCheckpointer({ userId, workflowId, runId, db })
}
