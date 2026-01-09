/**
 * useFirestoreListener Hook
 *
 * A robust wrapper for Firestore onSnapshot listeners that handles:
 * - Page visibility changes (pause/resume)
 * - Network connection state
 * - Session expiration
 * - Exponential backoff retries
 * - Proper cleanup
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { Unsubscribe } from 'firebase/firestore'

interface UseFirestoreListenerOptions {
  /**
   * Whether the listener is currently enabled
   */
  enabled?: boolean
  /**
   * Maximum number of retry attempts (default: 5)
   */
  maxRetries?: number
  /**
   * Initial retry delay in milliseconds (default: 1000)
   */
  initialRetryDelay?: number
  /**
   * Maximum retry delay in milliseconds (default: 30000)
   */
  maxRetryDelay?: number
  /**
   * Whether to pause listener when page is hidden (default: true)
   */
  pauseOnHidden?: boolean
  /**
   * Callback for connection errors
   */
  onError?: (error: Error) => void
}

interface ListenerState {
  isActive: boolean
  isPaused: boolean
  retryCount: number
  lastError: Error | null
}

/**
 * Hook for managing Firestore listeners with robust error handling
 */
export function useFirestoreListener(
  setupListener: () => Promise<Unsubscribe> | Unsubscribe,
  options: UseFirestoreListenerOptions = {}
) {
  const {
    enabled = true,
    maxRetries = 5,
    initialRetryDelay = 1000,
    maxRetryDelay = 30000,
    pauseOnHidden = true,
    onError,
  } = options

  const unsubscribeRef = useRef<Unsubscribe | null>(null)
  const stateRef = useRef<ListenerState>({
    isActive: true,
    isPaused: false,
    retryCount: 0,
    lastError: null,
  })
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [isConnected, setIsConnected] = useState(navigator.onLine)
  const [isPaused, setIsPaused] = useState(false)
  const [lastError, setLastError] = useState<Error | null>(null)
  const [retryCount, setRetryCount] = useState(0)

  // Calculate exponential backoff delay
  const getRetryDelay = useCallback(
    (retryCount: number): number => {
      const delay = Math.min(initialRetryDelay * Math.pow(2, retryCount), maxRetryDelay)
      // Add jitter to prevent thundering herd
      return delay + Math.random() * 1000
    },
    [initialRetryDelay, maxRetryDelay]
  )

  // Use ref to store the latest setupListenerWithRetry function to avoid circular dependency
  const setupListenerWithRetryRef = useRef<() => Promise<void>>()

  // Setup listener with error handling
  const setupListenerWithRetry = useCallback(async (): Promise<void> => {
    if (!enabled || !stateRef.current.isActive) {
      return
    }

    // Clean up existing listener
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
      unsubscribeRef.current = null
    }

    // Clear any pending retry
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }

    try {
      const unsubscribe = await setupListener()
      unsubscribeRef.current = unsubscribe
      stateRef.current.retryCount = 0
      stateRef.current.lastError = null
      setRetryCount(0)
      setLastError(null)
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown listener error')
      stateRef.current.lastError = err
      setLastError(err)

      // Check if error is recoverable
      const isRecoverable =
        err.message.includes('network') ||
        err.message.includes('connection') ||
        err.message.includes('timeout') ||
        err.message.includes('unavailable') ||
        err.message.includes('quota') ||
        err.code === 'unavailable' ||
        err.code === 'deadline-exceeded' ||
        err.code === 'resource-exhausted'

      if (isRecoverable && stateRef.current.retryCount < maxRetries) {
        const delay = getRetryDelay(stateRef.current.retryCount)
        console.warn(
          `Firestore listener error (retry ${stateRef.current.retryCount + 1}/${maxRetries}):`,
          err.message
        )

        stateRef.current.retryCount++
        setRetryCount(stateRef.current.retryCount)
        retryTimeoutRef.current = setTimeout(() => {
          if (
            stateRef.current.isActive &&
            !stateRef.current.isPaused &&
            setupListenerWithRetryRef.current
          ) {
            void setupListenerWithRetryRef.current()
          }
        }, delay)
      } else {
        console.error('Firestore listener error (non-recoverable or max retries):', err)
        if (onError) {
          onError(err)
        }
      }
    }
  }, [enabled, maxRetries, setupListener, onError, getRetryDelay])

  // Update ref with latest function using useEffect to avoid accessing during render
  useEffect(() => {
    setupListenerWithRetryRef.current = setupListenerWithRetry
  }, [setupListenerWithRetry])

  // Handle page visibility changes
  useEffect(() => {
    if (!pauseOnHidden) return

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Page is hidden - pause listener
        if (unsubscribeRef.current && !stateRef.current.isPaused) {
          console.log('Page hidden - pausing Firestore listener')
          stateRef.current.isPaused = true
          setIsPaused(true)
          unsubscribeRef.current()
          unsubscribeRef.current = null
        }
      } else {
        // Page is visible - resume listener
        if (stateRef.current.isPaused && enabled && stateRef.current.isActive) {
          console.log('Page visible - resuming Firestore listener')
          stateRef.current.isPaused = false
          stateRef.current.retryCount = 0 // Reset retry count on resume
          setIsPaused(false)
          setRetryCount(0)
          void setupListenerWithRetry()
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [pauseOnHidden, enabled, setupListenerWithRetry])

  // Handle network connection changes
  useEffect(() => {
    const handleOnline = () => {
      console.log('Network connection restored')
      setIsConnected(true)
      if (enabled && stateRef.current.isActive && !stateRef.current.isPaused) {
        stateRef.current.retryCount = 0 // Reset retry count on reconnect
        setRetryCount(0)
        void setupListenerWithRetry()
      }
    }

    const handleOffline = () => {
      console.log('Network connection lost')
      setIsConnected(false)
      // Don't retry while offline
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [enabled, setupListenerWithRetry])

  // Setup listener when enabled
  useEffect(() => {
    const stateSnapshot = stateRef.current
    if (!enabled || stateSnapshot.isPaused) {
      return
    }

    // Capture all ref values at the start of the effect for use in cleanup
    stateSnapshot.isActive = true

    // Schedule listener setup for next tick to avoid calling setState synchronously in effect
    const timeoutId = setTimeout(() => {
      if (stateSnapshot.isActive) {
        void setupListenerWithRetry()
      }
    }, 0)

    // Capture ref values for cleanup BEFORE defining cleanup function
    // This ensures we're not accessing refs during cleanup execution
    const cleanupUnsubscribe = unsubscribeRef.current
    const cleanupRetryTimeout = retryTimeoutRef.current

    return () => {
      clearTimeout(timeoutId)
      // We always set isActive to true in this effect, so we should always cleanup
      // Don't read stateRef.current.isActive here - we know it's true since we set it
      const shouldCleanup = true // We always set isActive to true, so always cleanup

      if (shouldCleanup) {
        // Set isActive to false
        stateSnapshot.isActive = false

        // Use captured ref values (captured before cleanup function)
        if (cleanupUnsubscribe) {
          cleanupUnsubscribe()
          unsubscribeRef.current = null
        }
        if (cleanupRetryTimeout) {
          clearTimeout(cleanupRetryTimeout)
          retryTimeoutRef.current = null
        }
      }
    }
  }, [enabled, setupListenerWithRetry])

  return {
    isConnected,
    isPaused,
    lastError,
    retryCount,
  }
}
