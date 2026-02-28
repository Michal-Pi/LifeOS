/**
 * useSlackConnections Hook
 *
 * Manages Slack workspace connections for the mailbox feature.
 * Provides CRUD operations and OAuth flow initiation.
 */

import { useState, useEffect, useCallback } from 'react'
import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { useAuth } from '@/hooks/useAuth'
import type { SlackChannelConfig } from '@lifeos/agents'

interface SlackConnectionDisplay {
  connectionId: string
  workspaceName: string
  workspaceId: string
  monitoredChannels: SlackChannelConfig[]
  pullDirectMessages: boolean
  createdAtMs: number
  lastSyncMs?: number
}

interface UseSlackConnectionsResult {
  connections: SlackConnectionDisplay[]
  loading: boolean
  error: string | null

  // Actions
  startOAuth: () => Promise<void>
  disconnect: (workspaceId: string) => Promise<void>
  addChannel: (workspaceId: string, channelId: string, channelName: string) => Promise<void>
  removeChannel: (workspaceId: string, channelId: string) => Promise<void>
  listAvailableChannels: (workspaceId: string) => Promise<SlackChannelConfig[]>
}

export function useSlackConnections(): UseSlackConnectionsResult {
  const { user } = useAuth()
  const [connections, setConnections] = useState<SlackConnectionDisplay[]>([])
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
        // Note: Backend stores in slackAccounts, not slackConnections
        const connectionsCol = collection(db, `users/${user.uid}/slackAccounts`)

        unsubscribe = onSnapshot(
          connectionsCol,
          (snapshot) => {
            const conns: SlackConnectionDisplay[] = snapshot.docs
              .filter((doc) => doc.data().status === 'connected')
              .map((doc) => {
                const data = doc.data()
                // Map backend slackAccounts fields to display type
                return {
                  connectionId: doc.id,
                  workspaceName: data.teamName ?? data.workspaceName ?? 'Unknown Workspace',
                  workspaceId: data.teamId ?? doc.id,
                  monitoredChannels: data.monitoredChannels ?? [],
                  pullDirectMessages: data.pullDirectMessages ?? true,
                  createdAtMs: data.createdAt ? new Date(data.createdAt).getTime() : Date.now(),
                  lastSyncMs: data.lastSyncMs,
                }
              })
            setConnections(conns)
            setLoading(false)
          },
          (err) => {
            console.error('Error subscribing to Slack connections:', err)
            setError(err.message)
            setLoading(false)
          }
        )
      } catch (err) {
        console.error('Error setting up Slack connections subscription:', err)
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
  }, [user?.uid])

  // Start OAuth flow
  const startOAuth = useCallback(async () => {
    if (!user?.uid) {
      throw new Error('User not authenticated')
    }

    setError(null)

    try {
      const idToken = await user.getIdToken()
      const response = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/slackAuthStart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ uid: user.uid }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to start OAuth')
      }

      const { url } = await response.json()
      window.location.href = url
    } catch (err) {
      console.error('Error starting Slack OAuth:', err)
      setError((err as Error).message)
      throw err
    }
  }, [user])

  // Disconnect workspace
  const disconnect = useCallback(
    async (workspaceId: string) => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      setError(null)

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/slackDisconnect`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ uid: user.uid, workspaceId }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to disconnect')
        }
      } catch (err) {
        console.error('Error disconnecting Slack workspace:', err)
        setError((err as Error).message)
        throw err
      }
    },
    [user]
  )

  // Add channel to monitor
  const addChannel = useCallback(
    async (workspaceId: string, channelId: string, channelName: string) => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      setError(null)

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/slackAddChannel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ uid: user.uid, workspaceId, channelId, channelName }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to add channel')
        }
      } catch (err) {
        console.error('Error adding Slack channel:', err)
        setError((err as Error).message)
        throw err
      }
    },
    [user]
  )

  // Remove channel from monitoring
  const removeChannel = useCallback(
    async (workspaceId: string, channelId: string) => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      setError(null)

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/slackRemoveChannel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ uid: user.uid, workspaceId, channelId }),
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to remove channel')
        }
      } catch (err) {
        console.error('Error removing Slack channel:', err)
        setError((err as Error).message)
        throw err
      }
    },
    [user]
  )

  // List available channels
  const listAvailableChannels = useCallback(
    async (workspaceId: string): Promise<SlackChannelConfig[]> => {
      if (!user?.uid) {
        throw new Error('User not authenticated')
      }

      try {
        const idToken = await user.getIdToken()
        const response = await fetch(
          `${import.meta.env.VITE_FUNCTIONS_URL}/slackListChannels?uid=${user.uid}&workspaceId=${workspaceId}`,
          {
            headers: {
              Authorization: `Bearer ${idToken}`,
            },
          }
        )

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Failed to list channels')
        }

        const { channels } = await response.json()
        return channels
      } catch (err) {
        console.error('Error listing Slack channels:', err)
        throw err
      }
    },
    [user]
  )

  return {
    connections,
    loading,
    error,
    startOAuth,
    disconnect,
    addChannel,
    removeChannel,
    listAvailableChannels,
  }
}
