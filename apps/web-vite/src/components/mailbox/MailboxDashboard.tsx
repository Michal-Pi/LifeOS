/**
 * MailboxDashboard Component
 *
 * Smart dashboard shown in the detail pane when no message is selected.
 * Displays unread counts per channel, quick stats, suggested actions, and sync status.
 */

import { useMemo } from 'react'
import { formatDistanceToNow } from 'date-fns'
import type { PrioritizedMessage, MessageSource } from '@lifeos/agents'
import '@/styles/components/MailboxDashboard.css'

interface MailboxDashboardProps {
  messages: PrioritizedMessage[]
  syncStatus: { lastSyncMs?: number; isSyncing?: boolean }
  onFilterChannel: (channel: MessageSource) => void
  onFilterFollowUp: () => void
  onSync: () => void
}

const SOURCE_LABELS: Record<MessageSource, string> = {
  gmail: 'Gmail',
  slack: 'Slack',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
}

const IMPORTANCE_THRESHOLD = 70

export function MailboxDashboard({
  messages,
  syncStatus,
  onFilterChannel,
  onFilterFollowUp,
  onSync,
}: MailboxDashboardProps) {
  const channelCounts = useMemo(() => {
    const counts = new Map<MessageSource, { total: number; unread: number }>()
    for (const msg of messages) {
      const existing = counts.get(msg.source) ?? { total: 0, unread: 0 }
      existing.total++
      if (!msg.isRead) existing.unread++
      counts.set(msg.source, existing)
    }
    return counts
  }, [messages])

  const todayCount = useMemo(() => {
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const startMs = startOfDay.getTime()
    return messages.filter((m) => m.receivedAtMs >= startMs).length
  }, [messages])

  const followUpCount = useMemo(
    () => messages.filter((m) => m.requiresFollowUp && !m.isDismissed).length,
    [messages]
  )

  const aiTop10Count = useMemo(
    () =>
      messages.filter((m) => m.importanceScore != null && m.importanceScore >= IMPORTANCE_THRESHOLD)
        .length,
    [messages]
  )

  const lastSyncLabel = syncStatus.lastSyncMs
    ? formatDistanceToNow(new Date(syncStatus.lastSyncMs), { addSuffix: true })
    : 'Never'

  return (
    <div className="mailbox-dashboard">
      {/* Unread Summary */}
      {channelCounts.size > 0 && (
        <div className="mailbox-dashboard__section">
          <div className="mailbox-dashboard__section-title">Unread by Channel</div>
          {Array.from(channelCounts.entries()).map(([source, counts]) => (
            <button
              key={source}
              type="button"
              className="mailbox-dashboard__channel-row"
              onClick={() => onFilterChannel(source)}
            >
              <span className="mailbox-dashboard__channel-name">{SOURCE_LABELS[source]}</span>
              <span className="mailbox-dashboard__channel-count">{counts.unread} unread</span>
            </button>
          ))}
        </div>
      )}

      {/* Quick Stats */}
      <div className="mailbox-dashboard__section">
        <div className="mailbox-dashboard__section-title">Quick Stats</div>
        <div className="mailbox-dashboard__stats-row">
          <div className="mailbox-dashboard__stat">
            <span className="mailbox-dashboard__stat-value">{todayCount}</span>
            <span className="mailbox-dashboard__stat-label">Today</span>
          </div>
          <div className="mailbox-dashboard__stat">
            <span className="mailbox-dashboard__stat-value">{followUpCount}</span>
            <span className="mailbox-dashboard__stat-label">Needs reply</span>
          </div>
          <div className="mailbox-dashboard__stat">
            <span className="mailbox-dashboard__stat-value">{aiTop10Count}</span>
            <span className="mailbox-dashboard__stat-label">AI Top 10</span>
          </div>
        </div>
      </div>

      {/* Suggested Actions */}
      {followUpCount > 0 && (
        <div className="mailbox-dashboard__section">
          <div className="mailbox-dashboard__section-title">Suggested Actions</div>
          <div className="mailbox-dashboard__action-row">
            <span className="mailbox-dashboard__action-text">
              {followUpCount} message{followUpCount !== 1 ? 's' : ''} need
              {followUpCount === 1 ? 's' : ''} your reply
            </span>
            <button type="button" className="ghost-button small" onClick={onFilterFollowUp}>
              View &rarr;
            </button>
          </div>
        </div>
      )}

      {/* Last Sync */}
      <div className="mailbox-dashboard__section">
        <div className="mailbox-dashboard__sync-row">
          <span className="mailbox-dashboard__sync-label">Last synced {lastSyncLabel}</span>
          <button
            type="button"
            className="ghost-button small"
            onClick={onSync}
            disabled={syncStatus.isSyncing}
          >
            {syncStatus.isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>
    </div>
  )
}
