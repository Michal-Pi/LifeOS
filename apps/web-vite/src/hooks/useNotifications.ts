/**
 * useNotifications Hook
 *
 * Listens for Firestore notifications and displays them via toast.
 * Currently handles quota alerts from agent runs.
 */

import { useEffect } from 'react'
import { toast } from 'sonner'
import { useAuth } from './useAuth'
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  updateDoc,
  doc,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { cleanupOldNotifications } from '@/utils/notificationCleanup'

interface Notification {
  id: string
  type: 'quota_alert' | string
  title: string
  message: string
  data?: {
    alertType?: 'runs' | 'tokens' | 'cost'
    threshold?: number
    used?: number
    limit?: number
  }
  read: boolean
  createdAtMs: number
  createdAt: string
}

/**
 * Hook to listen for and display notifications
 */
export function useNotifications(): void {
  const { user } = useAuth()

  useEffect(() => {
    if (!user?.uid) return

    let unsubscribe: (() => void) | null = null

    // Initialize Firestore and set up listener
    const setupListener = async () => {
      try {
        const db = await getDb()
        const notificationsRef = collection(db, `users/${user.uid}/notifications`)

        // Query for unread notifications, ordered by creation time (newest first), limit to 10
        const q = query(
          notificationsRef,
          where('read', '==', false),
          orderBy('createdAtMs', 'desc'),
          limit(10)
        )

        unsubscribe = onSnapshot(
          q,
          async (snapshot) => {
            // Only process new notifications (those added in this snapshot)
            for (const change of snapshot.docChanges()) {
              if (change.type === 'added') {
                const notification = { id: change.doc.id, ...change.doc.data() } as Notification

                // Display notification based on type
                if (notification.type === 'quota_alert') {
                  const { alertType, threshold, used, limit: limitValue } = notification.data || {}

                  // Determine severity based on threshold
                  const isWarning = threshold === 50 || threshold === 80
                  const isError = threshold === 100

                  // Format the message
                  const formatValue = (value: number, type: string) => {
                    if (type === 'cost') {
                      return `$${value.toFixed(2)}`
                    }
                    return value.toLocaleString()
                  }

                  const formattedUsed = formatValue(used || 0, alertType || '')
                  const formattedLimit = formatValue(limitValue || 0, alertType || '')

                  if (isError) {
                    toast.error(notification.title, {
                      description:
                        notification.message ||
                        `${formattedUsed} of ${formattedLimit} used (${threshold}%)`,
                      duration: 10000, // Show for 10 seconds
                    })
                  } else if (isWarning) {
                    toast.warning(notification.title, {
                      description:
                        notification.message ||
                        `${formattedUsed} of ${formattedLimit} used (${threshold}%)`,
                      duration: 8000, // Show for 8 seconds
                    })
                  } else {
                    toast.info(notification.title, {
                      description: notification.message,
                      duration: 6000, // Show for 6 seconds
                    })
                  }
                } else {
                  // Generic notification
                  toast.info(notification.title, {
                    description: notification.message,
                    duration: 6000,
                  })
                }

                // Mark notification as read after displaying
                try {
                  await updateDoc(doc(db, `users/${user.uid}/notifications/${notification.id}`), {
                    read: true,
                    readAtMs: Date.now(),
                  })
                } catch (error) {
                  console.error('Failed to mark notification as read:', error)
                  // Don't block notification display on read failure
                }
              }
            }
          },
          (error) => {
            console.error('Error listening to notifications:', error)
          }
        )
      } catch (error) {
        console.error('Failed to set up notification listener:', error)
      }
    }

    void setupListener()

    return () => {
      if (unsubscribe) {
        unsubscribe()
      }
    }
  }, [user?.uid])

  // Cleanup old notifications periodically (once per day)
  useEffect(() => {
    if (!user?.uid) return

    // Run cleanup once per day
    const cleanupInterval = setInterval(
      () => {
        void cleanupOldNotifications(user.uid)
      },
      24 * 60 * 60 * 1000
    ) // 24 hours

    // Also run cleanup on mount (in case it hasn't run in a while)
    void cleanupOldNotifications(user.uid)

    return () => {
      clearInterval(cleanupInterval)
    }
  }, [user?.uid])
}
