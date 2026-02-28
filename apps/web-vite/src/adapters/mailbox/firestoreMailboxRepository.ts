/**
 * Firestore Mailbox Repository
 *
 * Implements all mailbox repository ports for Firebase/Firestore storage.
 * Handles Slack connections, prioritized messages, sync history, and settings.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  writeBatch,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  SlackConnectionRepository,
  PrioritizedMessageRepository,
  MailboxSyncRepository,
  MailboxSettingsRepository,
  SlackAppSettingsRepository,
  SlackConnection,
  SlackConnectionId,
  CreateSlackConnectionInput,
  UpdateSlackConnectionInput,
  PrioritizedMessage,
  PrioritizedMessageId,
  CreatePrioritizedMessageInput,
  MailboxSync,
  MailboxSyncId,
  MailboxSettings,
  UpdateMailboxSettingsInput,
  SlackAppSettings,
  UpdateSlackAppSettingsInput,
  MessagePriority,
  getPriorityOrder,
} from '@lifeos/agents'

// ----- Slack Connection Repository -----

export function createFirestoreSlackConnectionRepository(): SlackConnectionRepository {
  return {
    async createConnection(input: CreateSlackConnectionInput): Promise<SlackConnection> {
      const db = await getDb()
      const connectionId = newId('slack_connection') as SlackConnectionId

      const connection: SlackConnection = {
        ...input,
        connectionId,
        createdAtMs: Date.now(),
      }

      const connectionDoc = doc(db, `users/${input.userId}/slackConnections/${connectionId}`)
      await setDoc(connectionDoc, connection)

      return connection
    },

    async getConnection(_connectionId: SlackConnectionId): Promise<SlackConnection | null> {
      // We need to search across all users - this is inefficient
      // In production, we should store connectionId -> userId mapping
      // For now, we'll need the userId from the caller
      // This method is better used with getConnectionsForUser
      console.warn('getConnection without userId requires a collection group query')
      return null
    },

    async getConnectionsForUser(userId: string): Promise<SlackConnection[]> {
      const db = await getDb()
      const connectionsCol = collection(db, `users/${userId}/slackConnections`)
      const snapshot = await getDocs(connectionsCol)

      return snapshot.docs.map((doc) => doc.data() as SlackConnection)
    },

    async updateConnection(
      _connectionId: SlackConnectionId,
      _updates: UpdateSlackConnectionInput
    ): Promise<SlackConnection> {
      // Find connection by searching user collections
      // This is a limitation - in practice, we'd have the userId
      // For now, return an error suggesting to use a method with userId
      throw new Error('updateConnection requires userId. Use updateConnectionForUser instead.')
    },

    async deleteConnection(_connectionId: SlackConnectionId): Promise<void> {
      // Same limitation as updateConnection
      throw new Error('deleteConnection requires userId. Use deleteConnectionForUser instead.')
    },
  }
}

// Extended repository with userId-aware methods
export interface SlackConnectionRepositoryExtended extends SlackConnectionRepository {
  getConnectionByWorkspace(userId: string, workspaceId: string): Promise<SlackConnection | null>
  updateConnectionForUser(
    userId: string,
    connectionId: SlackConnectionId,
    updates: UpdateSlackConnectionInput
  ): Promise<SlackConnection>
  deleteConnectionForUser(userId: string, connectionId: SlackConnectionId): Promise<void>
}

export function createFirestoreSlackConnectionRepositoryExtended(): SlackConnectionRepositoryExtended {
  const baseRepo = createFirestoreSlackConnectionRepository()

  return {
    ...baseRepo,

    async getConnectionByWorkspace(
      userId: string,
      workspaceId: string
    ): Promise<SlackConnection | null> {
      const db = await getDb()
      const connectionsCol = collection(db, `users/${userId}/slackConnections`)
      const q = query(connectionsCol, where('workspaceId', '==', workspaceId))
      const snapshot = await getDocs(q)

      if (snapshot.empty) return null
      return snapshot.docs[0].data() as SlackConnection
    },

    async updateConnectionForUser(
      userId: string,
      connectionId: SlackConnectionId,
      updates: UpdateSlackConnectionInput
    ): Promise<SlackConnection> {
      const db = await getDb()
      const connectionDoc = doc(db, `users/${userId}/slackConnections/${connectionId}`)
      const existing = await getDoc(connectionDoc)

      if (!existing.exists()) {
        throw new Error(`Slack connection ${connectionId} not found`)
      }

      const updated: SlackConnection = {
        ...(existing.data() as SlackConnection),
        ...updates,
      }

      await setDoc(connectionDoc, updated)
      return updated
    },

    async deleteConnectionForUser(userId: string, connectionId: SlackConnectionId): Promise<void> {
      const db = await getDb()
      const connectionDoc = doc(db, `users/${userId}/slackConnections/${connectionId}`)
      await deleteDoc(connectionDoc)
    },
  }
}

// ----- Prioritized Message Repository -----

export function createFirestorePrioritizedMessageRepository(): PrioritizedMessageRepository {
  return {
    async upsertMessage(input: CreatePrioritizedMessageInput): Promise<PrioritizedMessage> {
      const db = await getDb()

      // Check if message already exists by originalMessageId
      const messagesCol = collection(db, `users/${input.userId}/mailbox/messages`)
      const existingQuery = query(
        messagesCol,
        where('originalMessageId', '==', input.originalMessageId),
        where('source', '==', input.source)
      )
      const existing = await getDocs(existingQuery)

      const now = Date.now()

      if (!existing.empty) {
        // Update existing message
        const existingDoc = existing.docs[0]
        const existingData = existingDoc.data() as PrioritizedMessage

        const updated: PrioritizedMessage = {
          ...existingData,
          ...input,
          messageId: existingData.messageId,
          isRead: existingData.isRead,
          isDismissed: existingData.isDismissed,
          createdAtMs: existingData.createdAtMs,
          updatedAtMs: now,
        }

        await setDoc(existingDoc.ref, updated)
        return updated
      }

      // Create new message
      const messageId = newId('prioritized_message') as PrioritizedMessageId

      const message: PrioritizedMessage = {
        ...input,
        messageId,
        isRead: false,
        isDismissed: false,
        createdAtMs: now,
        updatedAtMs: now,
      }

      const messageDoc = doc(db, `users/${input.userId}/mailboxMessages/${messageId}`)
      await setDoc(messageDoc, message)

      return message
    },

    async getMessage(_messageId: PrioritizedMessageId): Promise<PrioritizedMessage | null> {
      // This requires knowing the userId - same limitation as SlackConnection
      console.warn('getMessage without userId requires a collection group query')
      return null
    },

    async getMessagesForUser(
      userId: string,
      options?: {
        requiresFollowUp?: boolean
        minPriority?: MessagePriority
        includeDismissed?: boolean
        limit?: number
      }
    ): Promise<PrioritizedMessage[]> {
      const db = await getDb()
      const messagesCol = collection(db, `users/${userId}/mailbox/messages`)

      // Build query constraints
      const constraints: Parameters<typeof query>[1][] = []

      if (options?.requiresFollowUp) {
        constraints.push(where('requiresFollowUp', '==', true))
      }

      if (!options?.includeDismissed) {
        constraints.push(where('isDismissed', '==', false))
      }

      constraints.push(orderBy('receivedAtMs', 'desc'))

      if (options?.limit) {
        constraints.push(firestoreLimit(options.limit * 2)) // Fetch extra for filtering
      }

      const q = query(messagesCol, ...constraints)
      const snapshot = await getDocs(q)

      let messages = snapshot.docs.map((doc) => doc.data() as PrioritizedMessage)

      // Filter by min priority if specified
      if (options?.minPriority) {
        const minOrder = getPriorityOrder(options.minPriority)
        messages = messages.filter((m) => getPriorityOrder(m.priority) >= minOrder)
      }

      // Sort by priority then receivedAt
      messages.sort((a, b) => {
        const priorityDiff = getPriorityOrder(b.priority) - getPriorityOrder(a.priority)
        if (priorityDiff !== 0) return priorityDiff
        return b.receivedAtMs - a.receivedAtMs
      })

      // Apply limit
      if (options?.limit) {
        messages = messages.slice(0, options.limit)
      }

      return messages
    },

    async markAsRead(_messageId: PrioritizedMessageId): Promise<void> {
      // This requires knowing the userId
      throw new Error('markAsRead requires userId. Use markAsReadForUser instead.')
    },

    async dismissMessage(_messageId: PrioritizedMessageId): Promise<void> {
      // This requires knowing the userId
      throw new Error('dismissMessage requires userId. Use dismissMessageForUser instead.')
    },

    async deleteOldMessages(userId: string, olderThanMs: number): Promise<number> {
      const db = await getDb()
      const messagesCol = collection(db, `users/${userId}/mailbox/messages`)
      const q = query(messagesCol, where('createdAtMs', '<', olderThanMs))
      const snapshot = await getDocs(q)

      const batch = writeBatch(db)
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })

      await batch.commit()
      return snapshot.size
    },
  }
}

// Extended repository with userId-aware methods
export interface PrioritizedMessageRepositoryExtended extends PrioritizedMessageRepository {
  getMessageForUser(
    userId: string,
    messageId: PrioritizedMessageId
  ): Promise<PrioritizedMessage | null>
  markAsReadForUser(userId: string, messageId: PrioritizedMessageId): Promise<void>
  dismissMessageForUser(userId: string, messageId: PrioritizedMessageId): Promise<void>
}

export function createFirestorePrioritizedMessageRepositoryExtended(): PrioritizedMessageRepositoryExtended {
  const baseRepo = createFirestorePrioritizedMessageRepository()

  return {
    ...baseRepo,

    async getMessageForUser(
      userId: string,
      messageId: PrioritizedMessageId
    ): Promise<PrioritizedMessage | null> {
      const db = await getDb()
      const messageDoc = doc(db, `users/${userId}/mailboxMessages/${messageId}`)
      const snapshot = await getDoc(messageDoc)

      if (!snapshot.exists()) return null
      return snapshot.data() as PrioritizedMessage
    },

    async markAsReadForUser(userId: string, messageId: PrioritizedMessageId): Promise<void> {
      const db = await getDb()
      const messageDoc = doc(db, `users/${userId}/mailboxMessages/${messageId}`)
      await updateDoc(messageDoc, {
        isRead: true,
        updatedAtMs: Date.now(),
      })
    },

    async dismissMessageForUser(userId: string, messageId: PrioritizedMessageId): Promise<void> {
      const db = await getDb()
      const messageDoc = doc(db, `users/${userId}/mailboxMessages/${messageId}`)
      await updateDoc(messageDoc, {
        isDismissed: true,
        updatedAtMs: Date.now(),
      })
    },
  }
}

// ----- Mailbox Sync Repository -----

export function createFirestoreMailboxSyncRepository(): MailboxSyncRepository {
  return {
    async createSync(
      userId: string,
      triggerType: 'manual' | 'scheduled' | 'page_load'
    ): Promise<MailboxSync> {
      const db = await getDb()
      const syncId = newId('mailbox_sync') as MailboxSyncId

      const sync: MailboxSync = {
        syncId,
        userId,
        triggerType,
        startedAtMs: Date.now(),
        status: 'running',
        stats: {
          gmailAccountsProcessed: 0,
          slackWorkspacesProcessed: 0,
          totalMessagesScanned: 0,
          newMessagesFound: 0,
          messagesRequiringFollowUp: 0,
          highPriorityCount: 0,
          mediumPriorityCount: 0,
          lowPriorityCount: 0,
        },
      }

      const syncDoc = doc(db, `users/${userId}/mailboxSyncs/${syncId}`)
      await setDoc(syncDoc, sync)

      return sync
    },

    async getSync(_syncId: MailboxSyncId): Promise<MailboxSync | null> {
      // Requires userId - same limitation
      console.warn('getSync without userId requires a collection group query')
      return null
    },

    async updateSync(
      _syncId: MailboxSyncId,
      _updates: Partial<Pick<MailboxSync, 'status' | 'completedAtMs' | 'error' | 'stats'>>
    ): Promise<MailboxSync> {
      // Requires userId
      throw new Error('updateSync requires userId. Use updateSyncForUser instead.')
    },

    async getLatestSync(userId: string): Promise<MailboxSync | null> {
      const db = await getDb()
      const syncsCol = collection(db, `users/${userId}/mailbox/syncs`)
      const q = query(syncsCol, orderBy('startedAtMs', 'desc'), firestoreLimit(1))
      const snapshot = await getDocs(q)

      if (snapshot.empty) return null
      return snapshot.docs[0].data() as MailboxSync
    },

    async getSyncHistory(userId: string, limit: number = 10): Promise<MailboxSync[]> {
      const db = await getDb()
      const syncsCol = collection(db, `users/${userId}/mailbox/syncs`)
      const q = query(syncsCol, orderBy('startedAtMs', 'desc'), firestoreLimit(limit))
      const snapshot = await getDocs(q)

      return snapshot.docs.map((doc) => doc.data() as MailboxSync)
    },
  }
}

// Extended repository with userId-aware methods
export interface MailboxSyncRepositoryExtended extends MailboxSyncRepository {
  getSyncForUser(userId: string, syncId: MailboxSyncId): Promise<MailboxSync | null>
  updateSyncForUser(
    userId: string,
    syncId: MailboxSyncId,
    updates: Partial<Pick<MailboxSync, 'status' | 'completedAtMs' | 'error' | 'stats'>>
  ): Promise<MailboxSync>
}

export function createFirestoreMailboxSyncRepositoryExtended(): MailboxSyncRepositoryExtended {
  const baseRepo = createFirestoreMailboxSyncRepository()

  return {
    ...baseRepo,

    async getSyncForUser(userId: string, syncId: MailboxSyncId): Promise<MailboxSync | null> {
      const db = await getDb()
      const syncDoc = doc(db, `users/${userId}/mailboxSyncs/${syncId}`)
      const snapshot = await getDoc(syncDoc)

      if (!snapshot.exists()) return null
      return snapshot.data() as MailboxSync
    },

    async updateSyncForUser(
      userId: string,
      syncId: MailboxSyncId,
      updates: Partial<Pick<MailboxSync, 'status' | 'completedAtMs' | 'error' | 'stats'>>
    ): Promise<MailboxSync> {
      const db = await getDb()
      const syncDoc = doc(db, `users/${userId}/mailboxSyncs/${syncId}`)
      const existing = await getDoc(syncDoc)

      if (!existing.exists()) {
        throw new Error(`Sync ${syncId} not found`)
      }

      const updated: MailboxSync = {
        ...(existing.data() as MailboxSync),
        ...updates,
      }

      await setDoc(syncDoc, updated)
      return updated
    },
  }
}

// ----- Mailbox Settings Repository -----

const DEFAULT_MAILBOX_SETTINGS: Omit<MailboxSettings, 'userId' | 'updatedAtMs'> = {
  gmailAccounts: [],
  slackConnections: [],
  maxMessagesToShow: 10,
  autoSyncOnPageLoad: true,
  priorityThreshold: 'low',
}

export function createFirestoreMailboxSettingsRepository(): MailboxSettingsRepository {
  return {
    async getSettings(userId: string): Promise<MailboxSettings> {
      const db = await getDb()
      const settingsDoc = doc(db, `users/${userId}/mailbox/settings`)
      const snapshot = await getDoc(settingsDoc)

      if (!snapshot.exists()) {
        // Create default settings
        const settings: MailboxSettings = {
          ...DEFAULT_MAILBOX_SETTINGS,
          userId,
          updatedAtMs: Date.now(),
        }

        await setDoc(settingsDoc, settings)
        return settings
      }

      return snapshot.data() as MailboxSettings
    },

    async updateSettings(
      userId: string,
      updates: UpdateMailboxSettingsInput
    ): Promise<MailboxSettings> {
      const db = await getDb()
      const settingsDoc = doc(db, `users/${userId}/mailbox/settings`)
      const existing = await getDoc(settingsDoc)

      let settings: MailboxSettings

      if (!existing.exists()) {
        settings = {
          ...DEFAULT_MAILBOX_SETTINGS,
          ...updates,
          userId,
          updatedAtMs: Date.now(),
        }
      } else {
        settings = {
          ...(existing.data() as MailboxSettings),
          ...updates,
          updatedAtMs: Date.now(),
        }
      }

      await setDoc(settingsDoc, settings)
      return settings
    },
  }
}

// ----- Slack App Settings Repository -----

export function createFirestoreSlackAppSettingsRepository(): SlackAppSettingsRepository {
  return {
    async getSettings(userId: string): Promise<SlackAppSettings | null> {
      const db = await getDb()
      const settingsDoc = doc(db, `users/${userId}/integrations/slack`)
      const snapshot = await getDoc(settingsDoc)

      if (!snapshot.exists()) {
        return null
      }

      return snapshot.data() as SlackAppSettings
    },

    async saveSettings(
      userId: string,
      updates: UpdateSlackAppSettingsInput
    ): Promise<SlackAppSettings> {
      const db = await getDb()
      const settingsDoc = doc(db, `users/${userId}/integrations/slack`)
      const existing = await getDoc(settingsDoc)

      const now = Date.now()
      let settings: SlackAppSettings

      if (!existing.exists()) {
        settings = {
          userId,
          clientId: updates.clientId ?? '',
          redirectUri: updates.redirectUri,
          isConfigured: Boolean(updates.clientId),
          updatedAtMs: now,
        }
      } else {
        const existingData = existing.data() as SlackAppSettings
        settings = {
          ...existingData,
          ...updates,
          isConfigured: Boolean(updates.clientId ?? existingData.clientId),
          updatedAtMs: now,
        }
      }

      await setDoc(settingsDoc, settings)
      return settings
    },

    async deleteSettings(userId: string): Promise<void> {
      const db = await getDb()
      const settingsDoc = doc(db, `users/${userId}/integrations/slack`)
      await deleteDoc(settingsDoc)
    },
  }
}

// ----- Combined Mailbox Repository Factory -----

export interface MailboxRepositories {
  slackConnections: SlackConnectionRepositoryExtended
  messages: PrioritizedMessageRepositoryExtended
  syncs: MailboxSyncRepositoryExtended
  settings: MailboxSettingsRepository
  slackAppSettings: SlackAppSettingsRepository
}

export function createFirestoreMailboxRepositories(): MailboxRepositories {
  return {
    slackConnections: createFirestoreSlackConnectionRepositoryExtended(),
    messages: createFirestorePrioritizedMessageRepositoryExtended(),
    syncs: createFirestoreMailboxSyncRepositoryExtended(),
    settings: createFirestoreMailboxSettingsRepository(),
    slackAppSettings: createFirestoreSlackAppSettingsRepository(),
  }
}
