/**
 * SlackConnectionsPanel Component
 *
 * Manages Slack workspace connections for the mailbox feature.
 * Displays connected workspaces, allows channel selection, and OAuth flow.
 */

import { useState, useCallback } from 'react'
import { useSlackConnections } from '@/hooks/useSlackConnections'
import { StatusDot } from '@/components/StatusDot'
import { Button } from '@/components/ui/button'
import '@/styles/components/SlackConnectionsPanel.css'

export function SlackConnectionsPanel() {
  const {
    connections,
    loading,
    error,
    startOAuth,
    disconnect,
    addChannel,
    removeChannel,
    listAvailableChannels,
  } = useSlackConnections()

  const [isConnecting, setIsConnecting] = useState(false)
  const [expandedWorkspace, setExpandedWorkspace] = useState<string | null>(null)
  const [availableChannels, setAvailableChannels] = useState<
    Array<{ channelId: string; channelName: string }>
  >([])
  const [loadingChannels, setLoadingChannels] = useState(false)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const [channelSearch, setChannelSearch] = useState('')

  const handleConnect = useCallback(async () => {
    setIsConnecting(true)
    try {
      await startOAuth()
    } catch {
      // Error handled in hook
    } finally {
      setIsConnecting(false)
    }
  }, [startOAuth])

  const handleDisconnect = useCallback(
    async (workspaceId: string) => {
      setDisconnectingId(workspaceId)
      try {
        await disconnect(workspaceId)
      } catch {
        // Error handled in hook
      } finally {
        setDisconnectingId(null)
      }
    },
    [disconnect]
  )

  const handleToggleExpand = useCallback(
    async (workspaceId: string) => {
      if (expandedWorkspace === workspaceId) {
        setExpandedWorkspace(null)
        setAvailableChannels([])
        return
      }

      setExpandedWorkspace(workspaceId)
      setLoadingChannels(true)
      try {
        const channels = await listAvailableChannels(workspaceId)
        setAvailableChannels(channels)
      } catch {
        setAvailableChannels([])
      } finally {
        setLoadingChannels(false)
      }
    },
    [expandedWorkspace, listAvailableChannels]
  )

  const handleAddChannel = useCallback(
    async (workspaceId: string, channelId: string, channelName: string) => {
      await addChannel(workspaceId, channelId, channelName)
    },
    [addChannel]
  )

  const handleRemoveChannel = useCallback(
    async (workspaceId: string, channelId: string) => {
      await removeChannel(workspaceId, channelId)
    },
    [removeChannel]
  )

  const getMonitoredChannelIds = (
    monitoredChannels: Array<{ channelId: string; channelName: string }>
  ) => {
    return new Set(monitoredChannels.map((c) => c.channelId))
  }

  return (
    <section className="settings-panel slack-connections-panel">
      <header className="settings-panel__header">
        <div>
          <p className="section-label">Connections</p>
          <h3>Slack Workspaces</h3>
          <p className="settings-panel__meta">
            Connect Slack to include workspace messages in your unified mailbox.
          </p>
        </div>
        <div className="settings-panel__actions">
          <Button variant="default" size="sm" onClick={handleConnect} disabled={isConnecting}>
            {isConnecting ? 'Connecting...' : '+ Connect Workspace'}
          </Button>
        </div>
      </header>

      {error && <p className="settings-panel__error">⚠ {error}</p>}

      {loading ? (
        <p className="settings-panel__meta">Loading connections...</p>
      ) : connections.length === 0 ? (
        <div className="slack-empty-state">
          <div className="slack-empty-icon">#</div>
          <p className="slack-empty-title">No workspaces connected</p>
          <p className="slack-empty-text">
            Connect a Slack workspace to see prioritized messages alongside your email.
          </p>
        </div>
      ) : (
        <div className="slack-workspaces-list">
          {connections.map((conn) => (
            <div key={conn.connectionId} className="slack-workspace-card">
              <div className="slack-workspace-header">
                <div className="slack-workspace-info">
                  <div className="slack-workspace-icon">#</div>
                  <div>
                    <h4>{conn.workspaceName}</h4>
                    <p className="slack-workspace-meta">
                      {conn.monitoredChannels.length} channels monitored
                      {conn.lastSyncMs && (
                        <span>
                          {' '}
                          · Last sync{' '}
                          {new Date(conn.lastSyncMs).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="slack-workspace-actions">
                  <StatusDot status="online" label="Connected" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggleExpand(conn.workspaceId)}
                  >
                    {expandedWorkspace === conn.workspaceId ? 'Hide Channels' : 'Manage Channels'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDisconnect(conn.workspaceId)}
                    disabled={disconnectingId === conn.workspaceId}
                  >
                    {disconnectingId === conn.workspaceId ? 'Disconnecting...' : 'Disconnect'}
                  </Button>
                </div>
              </div>

              {expandedWorkspace === conn.workspaceId && (
                <div className="slack-channels-section">
                  {/* DM Always Synced Indicator */}
                  <div className="slack-dm-indicator">
                    <StatusDot status="online" label="Always synced" />
                    <span className="slack-dm-text">Direct Messages: Always synced</span>
                  </div>

                  <p className="section-label">Monitored Channels</p>
                  {conn.monitoredChannels.length === 0 ? (
                    <p className="slack-channels-empty">
                      No channels monitored. Add channels below to include them in your mailbox.
                    </p>
                  ) : (
                    <div className="slack-channels-list">
                      {conn.monitoredChannels.map((channel) => (
                        <div key={channel.channelId} className="slack-channel-item">
                          <span className="slack-channel-name">#{channel.channelName}</span>
                          <button
                            type="button"
                            className="slack-channel-remove"
                            onClick={() => handleRemoveChannel(conn.workspaceId, channel.channelId)}
                            aria-label={`Remove ${channel.channelName}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="section-label">Available Channels</p>
                  {loadingChannels ? (
                    <p className="settings-panel__meta">Loading channels...</p>
                  ) : availableChannels.length === 0 ? (
                    <p className="slack-channels-empty">No additional channels available.</p>
                  ) : (
                    <>
                      <input
                        type="text"
                        className="slack-channel-search"
                        placeholder="Search channels..."
                        value={channelSearch}
                        onChange={(e) => setChannelSearch(e.target.value)}
                      />
                      <div className="slack-channels-list slack-channels-available">
                        {availableChannels
                          .filter(
                            (ch) =>
                              !getMonitoredChannelIds(conn.monitoredChannels).has(ch.channelId) &&
                              ch.channelName.toLowerCase().includes(channelSearch.toLowerCase())
                          )
                          .map((channel) => (
                            <div key={channel.channelId} className="slack-channel-item">
                              <span className="slack-channel-name">#{channel.channelName}</span>
                              <button
                                type="button"
                                className="slack-channel-add"
                                onClick={() =>
                                  handleAddChannel(
                                    conn.workspaceId,
                                    channel.channelId,
                                    channel.channelName
                                  )
                                }
                                aria-label={`Add ${channel.channelName}`}
                              >
                                +
                              </button>
                            </div>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
