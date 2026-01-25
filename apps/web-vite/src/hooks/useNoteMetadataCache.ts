/**
 * Note Metadata Cache Hook
 *
 * React hook to manage note metadata cache lifecycle.
 * Refreshes cache when user changes and provides cache instance.
 */

import { useEffect, useRef, useState } from 'react'
import { useAuth } from './useAuth'
import { getNoteMetadataCache } from '@/adapters/notes/noteMetadataCache'

/**
 * Hook to manage note metadata cache
 *
 * @returns Cache instance and refresh function
 */
export function useNoteMetadataCache() {
  const { user } = useAuth()
  const [cache] = useState(() => getNoteMetadataCache())
  const lastUserIdRef = useRef<string | null>(null)

  // Refresh cache when user changes
  useEffect(() => {
    const userId = user?.uid || null

    // If user changed, invalidate old cache and refresh new one
    if (userId && userId !== lastUserIdRef.current) {
      // Invalidate old user's cache if exists
      if (lastUserIdRef.current) {
        cache.invalidateAll(lastUserIdRef.current)
      }

      // Refresh cache for new user
      cache.refresh(userId).catch((error) => {
        console.error('Failed to refresh note metadata cache:', error)
      })

      lastUserIdRef.current = userId
    } else if (!userId && lastUserIdRef.current) {
      // User logged out, clear cache
      cache.invalidateAll(lastUserIdRef.current)
      lastUserIdRef.current = null
    }
  }, [cache, user?.uid])

  // Refresh cache on mount if user is authenticated
  useEffect(() => {
    const userId = user?.uid
    if (userId && !cache.isValid(userId)) {
      cache.refresh(userId).catch((error) => {
        console.error('Failed to refresh note metadata cache on mount:', error)
      })
    }
  }, [cache, user?.uid]) // Refresh when user changes

  return {
    cache,
    refresh: (userId: string) => cache.refresh(userId),
    invalidate: (userId: string, noteId: string) => cache.invalidate(userId, noteId),
    invalidateAll: (userId: string) => cache.invalidateAll(userId),
  }
}
