/**
 * useChannelConnections Hook
 *
 * Manages channel connections (LinkedIn, Telegram, WhatsApp) for the mailbox feature.
 * Provides real-time Firestore subscription and CRUD operations via backend endpoints.
 */

import { useState, useEffect, useCallback } from 'react'
import { collection, onSnapshot, query, where, type Unsubscribe } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { useAuth } from '@/hooks/useAuth'
import type { MessageSource, ChannelConnectionStatus, ChannelAuthMethod } from '@lifeos/agents'

export interface ChannelConnectionDisplay {
  connectionId: string
  source: MessageSource
  authMethod: ChannelAuthMethod
  status: ChannelConnectionStatus
  displayName: string
  lastSyncMs?: number
  errorMessage?: string
  createdAtMs: number
}

export interface CreateChannelConnectionInput {
  source: MessageSource
  displayName?: string
  credentials: Record<string, string>
  config?: Record<string, unknown>
}

interface UseChannelConnectionsResult {
  connections: ChannelConnectionDisplay[]
  loading: boolean
  error: string | null

  createConnection: (input: CreateChannelConnectionInput) => Promise<string>
  deleteConnection: (connectionId: string) => Promise<void>
  testConnection: (
    connectionId: string
  ) => Promise<{ status: ChannelConnectionStatus; errorMessage?: string }>
}

export function useChannelConnections(source?: MessageSource): UseChannelConnectionsResult {
  const { user } = useAuth()
  const [connections, setConnections] = useState<ChannelConnectionDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Subscribe to connections
  useEffect(() => {
    if (!user?.uid) {
      setConnections([])
      setLoading(false)
      return
    }

    let unsubscribe: Unsubscribe | undefined

    const setupSubscription = async () => {
      try {
        const db = await getDb()
        const connectionsCol = collection(db, `users/${user.uid}/channelConnections`)

        const q = source ? query(connectionsCol, where('source', '==', source)) : connectionsCol

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            const conns: ChannelConnectionDisplay[] = snapshot.docs.map((doc) => {
              const data = doc.data()
              return {
                connectionId: doc.id,
                source: data.source as MessageSource,
                authMethod: data.authMethod as ChannelAuthMethod,
                status: data.status as ChannelConnectionStatus,
                displayName: data.displayName ?? '',
                lastSyncMs: data.lastSyncMs ?? undefined,
                errorMessage: data.errorMessage ?? undefined,
                createdAtMs: data.createdAtMs ?? Date.now(),
              }
            })
            setConnections(conns)
            setLoading(false)
          },
          (err) => {
            console.error('Error subscribing to channel connections:', err)
            setError(err.message)
            setLoading(false)
          }
        )
      } catch (err) {
        console.error('Error setting up channel connections subscription:', err)
        setError((err as Error).message)
        setLoading(false)
      }
    }

    void setupSubscription()

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [user?.uid, source])

  // Create connection
  const createConnection = useCallback(
    async (input: CreateChannelConnectionInput): Promise<string> => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      setError(null)

      // #region agent log
      if (input.source === 'linkedin' && input.credentials) {
        const liAt = input.credentials.liAtCookie
        fetch('http://127.0.0.1:7403/ingest/eb9b440f-45bd-4a2b-83e2-dbda3c3b5e69', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1518cc' },
          body: JSON.stringify({
            sessionId: '1518cc',
            location: 'useChannelConnections.ts:createConnection',
            message: 'LinkedIn createConnection request',
            data: {
              cookieLength: typeof liAt === 'string' ? liAt.length : 0,
              hasCsrf: Boolean(input.credentials.csrfToken),
            },
            timestamp: Date.now(),
            hypothesisId: 'H1-H5',
          }),
        }).catch(() => {})
      }
      // #endregion

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(
          `${import.meta.env.VITE_FUNCTIONS_URL}/channelConnectionCreate`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              uid: user.uid,
              ...input,
            }),
          }
        )

        const errPayload = await response.json().catch(() => ({}))
        const errMessage = errPayload.error || 'Failed to create connection'

        if (!response.ok) {
          // #region agent log
          if (input.source === 'linkedin') {
            const liAt = input.credentials?.liAtCookie
            fetch('http://127.0.0.1:7403/ingest/eb9b440f-45bd-4a2b-83e2-dbda3c3b5e69', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '1518cc' },
              body: JSON.stringify({
                sessionId: '1518cc',
                location: 'useChannelConnections.ts:createConnection',
                message: 'LinkedIn createConnection failed',
                data: {
                  httpStatus: response.status,
                  error: errMessage,
                  linkedInStatus: errPayload.linkedInStatus,
                  linkedInBodySnippet: errPayload.linkedInBody ? String(errPayload.linkedInBody).slice(0, 100) : undefined,
                  cookieLength: typeof liAt === 'string' ? liAt.length : 0,
                  hasCsrf: Boolean(input.credentials?.csrfToken),
                },
                timestamp: Date.now(),
                hypothesisId: 'H1-H5',
              }),
            }).catch(() => {})
          }
          // #endregion
          throw new Error(errMessage)
        }

        const connectionId = errPayload.connectionId
        return connectionId
      } catch (err) {
        console.error('Error creating channel connection:', err)
        setError((err as Error).message)
        throw err
      }
    },
    [user]
  )

  // Delete connection
  const deleteConnection = useCallback(
    async (connectionId: string) => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      setError(null)

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(
          `${import.meta.env.VITE_FUNCTIONS_URL}/channelConnectionDelete`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              uid: user.uid,
              connectionId,
            }),
          }
        )

        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || 'Failed to delete connection')
        }
      } catch (err) {
        console.error('Error deleting channel connection:', err)
        setError((err as Error).message)
        throw err
      }
    },
    [user]
  )

  // Test connection
  const testConnection = useCallback(
    async (
      connectionId: string
    ): Promise<{ status: ChannelConnectionStatus; errorMessage?: string }> => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      setError(null)

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(
          `${import.meta.env.VITE_FUNCTIONS_URL}/channelConnectionTest`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              uid: user.uid,
              connectionId,
            }),
          }
        )

        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.error || 'Failed to test connection')
        }

        const result = await response.json()
        return {
          status: result.status as ChannelConnectionStatus,
          errorMessage: result.errorMessage ?? undefined,
        }
      } catch (err) {
        console.error('Error testing channel connection:', err)
        setError((err as Error).message)
        throw err
      }
    },
    [user]
  )

  return {
    connections,
    loading,
    error,
    createConnection,
    deleteConnection,
    testConnection,
  }
}
