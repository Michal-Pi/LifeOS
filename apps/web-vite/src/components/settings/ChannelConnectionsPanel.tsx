/**
 * ChannelConnectionsPanel Component
 *
 * Unified panel showing all messaging channel connections.
 * Gmail, Slack, LinkedIn, WhatsApp, and Telegram.
 *
 * - Gmail: Shows connection status; managed via Calendar Settings.
 * - Slack: Full app configuration + workspace management (embeds existing panels).
 * - LinkedIn: Cookie-based authentication via li_at session cookie.
 * - Telegram: Bot token authentication via BotFather.
 * - WhatsApp: QR code pairing via companion service.
 */

import { useState } from 'react'
import { StatusDot } from '@/components/StatusDot'
import { SlackAppSettingsPanel } from '@/components/settings/SlackAppSettingsPanel'
import { SlackConnectionsPanel } from '@/components/settings/SlackConnectionsPanel'
import { LinkedInSettingsPanel } from '@/components/settings/LinkedInSettingsPanel'
import { TelegramSettingsPanel } from '@/components/settings/TelegramSettingsPanel'
import { WhatsAppSettingsPanel } from '@/components/settings/WhatsAppSettingsPanel'
import { useSlackConnections } from '@/hooks/useSlackConnections'
import { useSlackAppSettings } from '@/hooks/useSlackAppSettings'
import { useChannelConnections } from '@/hooks/useChannelConnections'
import { useAuth } from '@/hooks/useAuth'
import '@/styles/components/ChannelConnectionsPanel.css'

interface ChannelDef {
  id: string
  name: string
  icon: string
  iconClass: string
  description: string
}

const CHANNELS: ChannelDef[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    icon: '@',
    iconClass: 'channel-icon--gmail',
    description: 'Email messages from connected Google accounts',
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '#',
    iconClass: 'channel-icon--slack',
    description: 'Messages from connected Slack workspaces',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'in',
    iconClass: 'channel-icon--linkedin',
    description: 'Professional messages and connection requests',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp',
    icon: 'WA',
    iconClass: 'channel-icon--whatsapp',
    description: 'Personal and group messages',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: 'TG',
    iconClass: 'channel-icon--telegram',
    description: 'Direct messages and channel notifications',
  },
]

export function ChannelConnectionsPanel() {
  const { user } = useAuth()
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null)

  // Slack state for summary display
  const { connections: slackConnections } = useSlackConnections()
  const { isConfigured: slackConfigured } = useSlackAppSettings(user?.uid)

  // Channel connection state for summary display
  const { connections: linkedinConnections } = useChannelConnections('linkedin')
  const { connections: telegramConnections } = useChannelConnections('telegram')
  const { connections: whatsappConnections } = useChannelConnections('whatsapp')

  const toggleChannel = (channelId: string) => {
    setExpandedChannel((prev) => (prev === channelId ? null : channelId))
  }

  const getChannelStatus = (channelId: string): { status: 'online' | 'offline'; label: string } => {
    switch (channelId) {
      case 'gmail':
        return { status: 'online', label: 'Via Calendar' }
      case 'slack':
        if (slackConnections.length > 0) return { status: 'online', label: 'Connected' }
        if (slackConfigured) return { status: 'idle' as 'offline', label: 'Configured' }
        return { status: 'offline', label: 'Not configured' }
      case 'linkedin': {
        const conn = linkedinConnections[0]
        if (!conn) return { status: 'offline', label: 'Not connected' }
        if (conn.status === 'expired') return { status: 'offline', label: 'Expired' }
        if (conn.status === 'connected') return { status: 'online', label: 'Connected' }
        return { status: 'offline', label: conn.status }
      }
      case 'telegram': {
        const conn = telegramConnections[0]
        if (!conn) return { status: 'offline', label: 'Not connected' }
        if (conn.status === 'connected') return { status: 'online', label: 'Connected' }
        return { status: 'offline', label: conn.status }
      }
      case 'whatsapp': {
        const conn = whatsappConnections[0]
        if (!conn) return { status: 'offline', label: 'Not connected' }
        if (conn.status === 'connected') return { status: 'online', label: 'Connected' }
        return { status: 'offline', label: conn.status }
      }
      default:
        return { status: 'offline', label: 'Not configured' }
    }
  }

  const getChannelSummary = (channelId: string): string => {
    switch (channelId) {
      case 'gmail':
        return 'Connected via Calendar Settings'
      case 'slack':
        if (slackConnections.length > 0)
          return `${slackConnections.length} workspace${slackConnections.length !== 1 ? 's' : ''} connected`
        if (slackConfigured) return 'App configured, no workspaces connected'
        return 'Not configured'
      case 'linkedin': {
        const conn = linkedinConnections[0]
        if (!conn) return 'Not connected'
        if (conn.status === 'expired') return 'Session expired — update cookie'
        return conn.displayName || 'Connected'
      }
      case 'telegram': {
        const conn = telegramConnections[0]
        if (!conn) return 'Not connected'
        return conn.displayName || 'Connected'
      }
      case 'whatsapp': {
        const conn = whatsappConnections[0]
        if (!conn) return 'Not connected'
        return conn.displayName || 'Connected'
      }
      default:
        return 'Not configured'
    }
  }

  return (
    <section className="settings-panel channel-connections-panel">
      <header className="settings-panel__header">
        <div>
          <p className="section-label">Integrations</p>
          <h3>Channel Connections</h3>
          <p className="settings-panel__meta">
            Connect messaging channels to aggregate messages in your unified mailbox.
          </p>
        </div>
      </header>

      <div className="channel-list">
        {CHANNELS.map((channel) => {
          const { status, label } = getChannelStatus(channel.id)
          const isExpanded = expandedChannel === channel.id

          return (
            <div key={channel.id} className="channel-card">
              <div
                className="channel-header"
                onClick={() => toggleChannel(channel.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleChannel(channel.id)
                  }
                }}
                aria-expanded={isExpanded}
              >
                <div className={`channel-icon ${channel.iconClass}`}>{channel.icon}</div>
                <div className="channel-info">
                  <h4>{channel.name}</h4>
                  <p>{getChannelSummary(channel.id)}</p>
                </div>
                <div className="channel-status">
                  <StatusDot status={status} label={label} />
                  <span
                    className={`channel-expand-icon${isExpanded ? ' channel-expand-icon--open' : ''}`}
                  >
                    ▾
                  </span>
                </div>
              </div>

              {/* Gmail expanded content */}
              {isExpanded && channel.id === 'gmail' && (
                <div className="channel-content">
                  <p className="channel-managed-notice">
                    Gmail accounts are managed through your Calendar Settings. Any Google account
                    connected for calendar sync is automatically available for mailbox message
                    fetching.
                  </p>
                </div>
              )}

              {/* Slack expanded content */}
              {isExpanded && channel.id === 'slack' && (
                <div className="channel-content">
                  <SlackAppSettingsPanel />
                  <SlackConnectionsPanel />
                </div>
              )}

              {/* LinkedIn expanded content */}
              {isExpanded && channel.id === 'linkedin' && (
                <div className="channel-content">
                  <LinkedInSettingsPanel />
                </div>
              )}

              {/* Telegram expanded content */}
              {isExpanded && channel.id === 'telegram' && (
                <div className="channel-content">
                  <TelegramSettingsPanel />
                </div>
              )}

              {/* WhatsApp expanded content */}
              {isExpanded && channel.id === 'whatsapp' && (
                <div className="channel-content">
                  <WhatsAppSettingsPanel />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
