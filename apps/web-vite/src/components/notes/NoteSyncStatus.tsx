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

export function NoteSyncStatus({
  syncState,
  className = '',
  showLabel = false,
}: NoteSyncStatusProps) {
  const getStatusConfig = () => {
    switch (syncState) {
      case 'synced':
        return {
          icon: '✓',
          label: 'Synced',
          className: 'note-sync-badge--synced',
        }
      case 'pending':
        return {
          icon: '⏱',
          label: 'Pending',
          className: 'note-sync-badge--pending',
        }
      case 'syncing':
        return {
          icon: '⟳',
          label: 'Syncing',
          className: 'note-sync-badge--syncing',
          animate: true,
        }
      case 'failed':
        return {
          icon: '⚠',
          label: 'Failed',
          className: 'note-sync-badge--failed',
        }
      case 'conflict':
        return {
          icon: '⚔',
          label: 'Conflict',
          className: 'note-sync-badge--conflict',
        }
      default:
        return {
          icon: '?',
          label: 'Unknown',
          className: 'note-sync-badge--unknown',
        }
    }
  }

  const config = getStatusConfig()

  return (
    <div className={`note-sync-badge ${config.className} ${className}`} title={config.label}>
      <span className={`note-sync-badge__icon ${config.animate ? 'is-animated' : ''}`}>
        {config.icon}
      </span>
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

  const bannerState = !isOnline ? 'offline' : failedCount > 0 ? 'failed' : 'pending'

  return (
    <div className={`note-sync-banner note-sync-banner--${bannerState} ${className}`}>
      <div className="note-sync-banner__content">
        <div className="note-sync-banner__title">
          {!isOnline
            ? 'Offline mode - Changes will sync when connection is restored'
            : failedCount > 0
              ? `${failedCount} ${failedCount === 1 ? 'operation' : 'operations'} failed to sync`
              : `${pendingCount} ${pendingCount === 1 ? 'change' : 'changes'} pending sync`}
        </div>
        {failedCount > 0 && onRetryAll && (
          <button onClick={onRetryAll} className="note-sync-banner__retry">
            Retry all
          </button>
        )}
        <div className="note-sync-banner__meta">Last sync: {formatLastSync}</div>
      </div>

      {!isOnline && (
        <div className="note-sync-banner__status">
          <span className="note-sync-banner__dot" />
          Offline
        </div>
      )}
    </div>
  )
}
