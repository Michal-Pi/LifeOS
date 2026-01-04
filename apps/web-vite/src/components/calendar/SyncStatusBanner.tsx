/**
 * SyncStatusBanner Component
 *
 * Displays sync status information including:
 * - Online/offline indicator
 * - Pending operations count
 * - Failed operations with retry button
 * - Last sync timestamp
 * - Google account connection status
 * - Connection errors
 * - Action buttons (New Event, Sync Now, Connect/Disconnect Google)
 */

import type { CalendarAccountStatus } from '@lifeos/calendar'
import type { OutboxOp } from '@/outbox/types'
import { minutesAgo } from '@/utils/timeFormatters'

interface SyncStatusBannerProps {
  // Connection state
  isOnline: boolean
  accountStatus: CalendarAccountStatus | null
  connectionError: string | null
  isConnecting: boolean
  isDisconnecting: boolean

  // Sync state
  syncing: boolean
  status: { lastSyncAt?: string; lastSuccessAt?: string; lastError?: string } | null

  // Outbox state
  pendingOps: OutboxOp[]
  failedOps: OutboxOp[]

  // Date navigation
  selectedMonthDate: Date | null

  // Permissions
  canCreateEvents: boolean

  // Event handlers
  onRetryAll: () => void
  onBackToToday: () => void
  onCreateEvent: () => void
  onSyncNow: () => void
  onConnectGoogle: () => void
  onDisconnectGoogle: () => void
  onManageAccounts: () => void
}

export function SyncStatusBanner({
  isOnline,
  accountStatus,
  connectionError,
  isConnecting,
  syncing,
  status,
  pendingOps,
  failedOps,
  selectedMonthDate,
  canCreateEvents,
  onRetryAll,
  onBackToToday,
  onCreateEvent,
  onSyncNow,
  onConnectGoogle,
  onManageAccounts,
}: SyncStatusBannerProps) {
  const hasConnection = accountStatus?.status === 'connected'

  return (
    <div className="calendar-sync">
      {/* Online/offline indicator */}
      <span className={`status-badge ${isOnline ? 'online' : 'offline'}`}>
        {isOnline ? '● Online' : '○ Offline'}
      </span>

      {/* Pending operations */}
      {pendingOps.length > 0 && <span className="pending-badge">{pendingOps.length} syncing…</span>}

      {/* Failed operations with retry */}
      {failedOps.length > 0 && (
        <span className="failed-badge">
          {failedOps.length} failed
          <button className="retry-link" onClick={onRetryAll} disabled={!isOnline}>
            Retry all
          </button>
        </span>
      )}

      {/* Last sync timestamp */}
      <span className="sync-pill">
        {status ? `Last synced ${minutesAgo(status.lastSuccessAt)}` : 'Awaiting sync'}
      </span>

      {/* Account connection status */}
      <p className="calendar-meta">
        {hasConnection
          ? `Google Calendar connected${accountStatus?.accountId ? ` (${accountStatus.accountId})` : ''}`
          : 'No calendar accounts connected'}
      </p>

      {/* Connection error message */}
      {connectionError && <p className="connection-error">{connectionError}</p>}

      {/* Action buttons */}
      <div className="header-actions">
        {selectedMonthDate && (
          <button className="ghost-button" onClick={onBackToToday} title="Return to today's events">
            Back to Today
          </button>
        )}

        <button
          className="primary-button"
          onClick={onCreateEvent}
          disabled={!canCreateEvents}
          title={canCreateEvents ? undefined : 'Calendar is read-only'}
        >
          + New Event
        </button>

        <button
          className="ghost-button"
          onClick={onSyncNow}
          disabled={syncing || !isOnline || !hasConnection}
          title={!hasConnection ? 'Connect Google Calendar first' : undefined}
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>

        {hasConnection ? (
          <button className="ghost-button" onClick={onManageAccounts}>
            Manage Accounts
          </button>
        ) : (
          <button
            className="ghost-button"
            onClick={onConnectGoogle}
            disabled={isConnecting}
            aria-busy={isConnecting}
          >
            {isConnecting ? 'Connecting…' : 'Connect Google'}
          </button>
        )}
      </div>
    </div>
  )
}
