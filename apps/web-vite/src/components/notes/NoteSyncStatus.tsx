/**
 * Note Sync Status Component
 *
 * Displays sync status indicator for notes with visual feedback:
 * - Synced: Green checkmark
 * - Pending: Yellow clock
 * - Failed: Red warning
 * - Syncing: Blue spinner
 */

import React from 'react'
import type { SyncState } from '@lifeos/notes'

export interface NoteSyncStatusProps {
  syncState: SyncState
  className?: string
  showLabel?: boolean
}

export function NoteSyncStatus({ syncState, className = '', showLabel = false }: NoteSyncStatusProps) {
  const getStatusConfig = () => {
    switch (syncState) {
      case 'synced':
        return {
          icon: '✓',
          label: 'Synced',
          color: 'text-green-600 dark:text-green-400',
          bgColor: 'bg-green-50 dark:bg-green-900/20',
        }
      case 'pending':
        return {
          icon: '⏱',
          label: 'Pending',
          color: 'text-yellow-600 dark:text-yellow-400',
          bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
        }
      case 'syncing':
        return {
          icon: '⟳',
          label: 'Syncing',
          color: 'text-blue-600 dark:text-blue-400',
          bgColor: 'bg-blue-50 dark:bg-blue-900/20',
          animate: true,
        }
      case 'failed':
        return {
          icon: '⚠',
          label: 'Failed',
          color: 'text-red-600 dark:text-red-400',
          bgColor: 'bg-red-50 dark:bg-red-900/20',
        }
      default:
        return {
          icon: '?',
          label: 'Unknown',
          color: 'text-gray-600 dark:text-gray-400',
          bgColor: 'bg-gray-50 dark:bg-gray-900/20',
        }
    }
  }

  const config = getStatusConfig()

  return (
    <div
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color} ${config.bgColor} ${className}`}
      title={config.label}
    >
      <span className={config.animate ? 'animate-spin' : ''}>{config.icon}</span>
      {showLabel && <span>{config.label}</span>}
    </div>
  )
}

/**
 * Sync Status Banner
 *
 * Shows overall sync status at the top of the notes page
 */
export interface SyncStatusBannerProps {
  isOnline: boolean
  pendingCount: number
  failedCount: number
  lastSyncMs: number | null
  onRetryAll?: () => void
  className?: string
}

export function SyncStatusBanner({
  isOnline,
  pendingCount,
  failedCount,
  lastSyncMs,
  onRetryAll,
  className = '',
}: SyncStatusBannerProps) {
  const [currentTime, setCurrentTime] = React.useState(() => Date.now())

  // Update current time every minute to refresh "time ago" display
  React.useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 60000)
    return () => clearInterval(interval)
  }, [])

  const formatLastSync = React.useMemo(() => {
    if (!lastSyncMs) return 'Never'

    const seconds = Math.floor((currentTime - lastSyncMs) / 1000)

    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }, [lastSyncMs, currentTime])

  // Don't show banner if everything is synced and online
  if (isOnline && pendingCount === 0 && failedCount === 0) {
    return null
  }

  return (
    <div
      className={`flex items-center justify-between px-4 py-2 rounded-lg ${
        !isOnline
          ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
          : failedCount > 0
            ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
      } ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">
          {!isOnline ? '📡' : failedCount > 0 ? '⚠️' : '⏱️'}
        </span>
        <div className="text-sm">
          {!isOnline ? (
            <p className="font-medium text-yellow-900 dark:text-yellow-100">
              Offline mode - Changes will sync when connection is restored
            </p>
          ) : failedCount > 0 ? (
            <>
              <p className="font-medium text-red-900 dark:text-red-100">
                {failedCount} {failedCount === 1 ? 'operation' : 'operations'} failed to sync
              </p>
              {onRetryAll && (
                <button
                  onClick={onRetryAll}
                  className="text-xs text-red-700 dark:text-red-300 hover:underline"
                >
                  Retry all
                </button>
              )}
            </>
          ) : (
            <p className="font-medium text-blue-900 dark:text-blue-100">
              {pendingCount} {pendingCount === 1 ? 'change' : 'changes'} pending sync
            </p>
          )}
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Last sync: {formatLastSync}
          </p>
        </div>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2 px-3 py-1 bg-yellow-100 dark:bg-yellow-900/30 rounded text-xs font-medium text-yellow-900 dark:text-yellow-100">
          <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
          Offline
        </div>
      )}
    </div>
  )
}
