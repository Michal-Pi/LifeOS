import { collection, doc, getDocs, getDoc, setDoc, query, where, orderBy } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  AgentRepository,
  AgentConfig,
  AgentId,
  CreateAgentInput,
  UpdateAgentInput,
  AgentRole,
  ModelProvider,
} from '@lifeos/agents'

export const createFirestoreAgentRepository = (): AgentRepository => {
  return {
    async create(userId: string, input: CreateAgentInput): Promise<AgentConfig> {
      const db = await getDb()
      const agentId = newId('agent')

      const agent: AgentConfig = {
        ...input,
        agentId,
        userId,
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const agentDoc = doc(db, `users/${userId}/agents/${agentId}`)
      await setDoc(agentDoc, agent)

      return agent
    },

    async update(
      userId: string,
      agentId: AgentId,
      updates: UpdateAgentInput
    ): Promise<AgentConfig> {
      const db = await getDb()
      const agentDoc = doc(db, `users/${userId}/agents/${agentId}`)

      const existing = await getDoc(agentDoc)
      if (!existing.exists()) {
        throw new Error(`Agent ${agentId} not found`)
      }

      const updated: AgentConfig = {
        ...(existing.data() as AgentConfig),
        ...updates,
        updatedAtMs: Date.now(),
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced',
      }

      await setDoc(agentDoc, updated)
      return updated
    },

    async delete(userId: string, agentId: AgentId): Promise<void> {
      const db = await getDb()
      const agentDoc = doc(db, `users/${userId}/agents/${agentId}`)

      const existing = await getDoc(agentDoc)
      if (!existing.exists()) {
        throw new Error(`Agent ${agentId} not found`)
      }

      // Soft delete by marking as archived
      const updated: AgentConfig = {
        ...(existing.data() as AgentConfig),
        archived: true,
        updatedAtMs: Date.now(),
        version: (existing.data()?.version ?? 0) + 1,
        syncState: 'synced',
      }

      await setDoc(agentDoc, updated)
    },

    async get(userId: string, agentId: AgentId): Promise<AgentConfig | null> {
      const db = await getDb()
      const agentDoc = doc(db, `users/${userId}/agents/${agentId}`)
      const snapshot = await getDoc(agentDoc)

      if (!snapshot.exists()) return null
      return snapshot.data() as AgentConfig
    },

    async list(
      userId: string,
      options?: {
        role?: AgentRole
        provider?: ModelProvider
        activeOnly?: boolean
      }
    ): Promise<AgentConfig[]> {
      const db = await getDb()
      const agentsCol = collection(db, `users/${userId}/agents`)

      let q = query(agentsCol, orderBy('name', 'asc'))

      // Filter by role if specified
      if (options?.role) {
        q = query(agentsCol, where('role', '==', options.role), orderBy('name', 'asc'))
      }

      // Filter by provider if specified
      if (options?.provider) {
        q = query(agentsCol, where('modelProvider', '==', options.provider), orderBy('name', 'asc'))
      }

      const snapshot = await getDocs(q)
      let agents = snapshot.docs.map((doc) => doc.data() as AgentConfig)

      // Filter out archived agents by default
      if (options?.activeOnly !== false) {
        agents = agents.filter((agent) => !agent.archived)
      }

      return agents
    },
  }
}
