/**
 * MailboxStatsBar Component
 *
 * Horizontal bar between the page header and the list/detail content.
 * Shows clickable stat pills that double as filters:
 * - Quick filters: All, Today, Top Priority, Needs Reply, Unread
 * - Channel filters: one pill per active channel (Gmail, Slack, etc.)
 * - Folder buttons: Drafts, Outbox (next to filters)
 */

import { useMemo } from 'react'
import type { PrioritizedMessage, MessageSource } from '@lifeos/agents'
import '@/styles/components/MailboxStatsBar.css'

export type MailboxFolder = 'inbox' | 'drafts' | 'outbox'

export type MailboxFilter =
  | { type: 'all' }
  | { type: 'today' }
  | { type: 'top-priority' }
  | { type: 'needs-reply' }
  | { type: 'unread' }
  | { type: 'channel'; source: MessageSource }

interface MailboxStatsBarProps {
  messages: PrioritizedMessage[]
  activeFilter: MailboxFilter
  activeFolder: MailboxFolder
  draftsCount: number
  outboxCount: number
  onFilterChange: (filter: MailboxFilter) => void
  onFolderChange: (folder: MailboxFolder) => void
  onCompose: () => void
  onSync: () => void
  isSyncing: boolean
}

const IMPORTANCE_THRESHOLD = 70

const SOURCE_LABELS: Record<MessageSource, string> = {
  gmail: 'Gmail',
  slack: 'Slack',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
}

function isFilterActive(active: MailboxFilter, target: MailboxFilter): boolean {
  if (active.type !== target.type) return false
  if (active.type === 'channel' && target.type === 'channel') {
    return active.source === target.source
  }
  return true
}

export function MailboxStatsBar({
  messages,
  activeFilter,
  activeFolder,
  draftsCount,
  outboxCount,
  onFilterChange,
  onFolderChange,
  onCompose,
  onSync,
  isSyncing,
}: MailboxStatsBarProps) {
  const stats = useMemo(() => {
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const startMs = startOfToday.getTime()

    let todayCount = 0
    let topPriorityCount = 0
    let needsReplyCount = 0
    let unreadCount = 0
    const channelCounts = new Map<MessageSource, number>()

    for (const msg of messages) {
      if (msg.receivedAtMs >= startMs) todayCount++
      if (msg.importanceScore != null && msg.importanceScore >= IMPORTANCE_THRESHOLD)
        topPriorityCount++
      if (msg.requiresFollowUp && !msg.isDismissed) needsReplyCount++
      if (!msg.isRead) unreadCount++

      channelCounts.set(msg.source, (channelCounts.get(msg.source) ?? 0) + 1)
    }

    return { todayCount, topPriorityCount, needsReplyCount, unreadCount, channelCounts }
  }, [messages])

  const quickFilters: Array<{ filter: MailboxFilter; label: string; count: number }> = [
    { filter: { type: 'all' }, label: 'All', count: messages.length },
    { filter: { type: 'today' }, label: 'Today', count: stats.todayCount },
    { filter: { type: 'top-priority' }, label: 'Top Priority', count: stats.topPriorityCount },
    { filter: { type: 'needs-reply' }, label: 'Needs Reply', count: stats.needsReplyCount },
    { filter: { type: 'unread' }, label: 'Unread', count: stats.unreadCount },
  ]

  const channelFilters = useMemo(() => {
    return Array.from(stats.channelCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([source, count]) => ({
        filter: { type: 'channel' as const, source },
        label: SOURCE_LABELS[source],
        count,
      }))
  }, [stats.channelCounts])

  return (
    <div className="mailbox-stats-bar">
      {/* Folder tabs */}
      <div className="mailbox-stats-bar__section">
        <button
          type="button"
          className={`mailbox-stats-bar__pill ${activeFolder === 'inbox' ? 'mailbox-stats-bar__pill--active' : ''}`}
          onClick={() => onFolderChange('inbox')}
        >
          Inbox <span className="mailbox-stats-bar__count">{messages.length}</span>
        </button>
        <button
          type="button"
          className={`mailbox-stats-bar__pill ${activeFolder === 'drafts' ? 'mailbox-stats-bar__pill--active' : ''}`}
          onClick={() => onFolderChange('drafts')}
        >
          Drafts {draftsCount > 0 && <span className="mailbox-stats-bar__count">{draftsCount}</span>}
        </button>
        <button
          type="button"
          className={`mailbox-stats-bar__pill ${activeFolder === 'outbox' ? 'mailbox-stats-bar__pill--active' : ''}`}
          onClick={() => onFolderChange('outbox')}
        >
          Outbox {outboxCount > 0 && <span className="mailbox-stats-bar__count">{outboxCount}</span>}
        </button>
      </div>

      {/* Inbox filters — only shown when inbox is active */}
      {activeFolder === 'inbox' && (
        <>
          <div className="mailbox-stats-bar__separator" />
          <div className="mailbox-stats-bar__section">
            {quickFilters.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`mailbox-stats-bar__pill ${isFilterActive(activeFilter, item.filter) ? 'mailbox-stats-bar__pill--active' : ''}`}
                onClick={() => onFilterChange(item.filter)}
              >
                {item.label} <span className="mailbox-stats-bar__count">{item.count}</span>
              </button>
            ))}
          </div>

          {channelFilters.length > 0 && (
            <>
              <div className="mailbox-stats-bar__separator" />
              <div className="mailbox-stats-bar__section">
                {channelFilters.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`mailbox-stats-bar__pill ${isFilterActive(activeFilter, item.filter) ? 'mailbox-stats-bar__pill--active' : ''}`}
                    onClick={() => onFilterChange(item.filter)}
                  >
                    {item.label} <span className="mailbox-stats-bar__count">{item.count}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="mailbox-stats-bar__actions">
        <button type="button" className="primary-button small" onClick={onCompose}>
          Compose
        </button>
        <button
          type="button"
          className="ghost-button small"
          onClick={onSync}
          disabled={isSyncing}
        >
          {isSyncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>
    </div>
  )
}
