import { useEffect } from 'react'
import { collection, getDocs, doc, getDoc } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import { functionUrl } from '@/lib/functionsUrl'
import { authenticatedFetch } from '@/lib/authenticatedFetch'
import { toast } from 'sonner'

const AUTO_SYNC_AGE_MS = 15 * 60 * 1000

function parseTimestamp(value?: string): number {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

async function getLatestSyncTimestamp(userId: string): Promise<number> {
  const snapshot = await getDocs(
    collection(getFirestoreClient(), 'users', userId, 'calendarSyncState')
  )
  let latest = 0
  snapshot.forEach((doc) => {
    const data = doc.data() as { lastSuccessAt?: string; lastSyncAt?: string }
    const candidate = Math.max(parseTimestamp(data.lastSuccessAt), parseTimestamp(data.lastSyncAt))
    if (candidate > latest) {
      latest = candidate
    }
  })
  return latest
}

async function accountIsConnected(userId: string, accountId: string): Promise<boolean> {
  try {
    const db = getFirestoreClient()
    const accountRef = doc(db, 'users', userId, 'calendarAccounts', accountId)
    const snapshot = await getDoc(accountRef)
    return snapshot.exists() && snapshot.data()?.status === 'connected'
  } catch {
    return false
  }
}

export function useAutoSync(userId: string, accountId: string): void {
  useEffect(() => {
    if (!userId) return
    let cancelled = false

    const maybeSync = async () => {
      try {
        // Check if account is connected before attempting sync
        const connected = await accountIsConnected(userId, accountId)
        if (cancelled || !connected) return

        const latest = await getLatestSyncTimestamp(userId)
        if (cancelled) return
        const needsSync = !latest || Date.now() - latest > AUTO_SYNC_AGE_MS
        if (!needsSync) return

        const response = await authenticatedFetch(
          functionUrl(`syncNow?uid=${userId}&accountId=${accountId}`),
          { showErrorToast: false }
        )

        if (response.ok) {
          const result = await response.json()
          if (result.ok && result.calendars) {
            toast.success(`Calendar sync complete - ${result.calendars.length} calendars updated`)
          }
        } else if (response.status === 401) {
          const body = await response.json().catch(() => ({}))
          if (body.error === 'auth_token_expired') {
            toast.warning('Google connection expired', {
              description: 'Your Google account needs to be reconnected to sync your calendar.',
              action: {
                label: 'Reconnect',
                onClick: () => {
                  window.location.assign('/calendar')
                },
              },
              duration: Infinity,
            })
          }
        }
      } catch {
        // Ignore auto-sync errors; manual sync remains available
      }
    }

    void maybeSync()

    return () => {
      cancelled = true
    }
  }, [userId, accountId])
}
