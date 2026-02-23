/**
 * Telegram Settings Panel
 *
 * Allows users to connect a Telegram bot via bot token from BotFather.
 * Shows connection status and provides test/disconnect actions.
 */

import { useState, useCallback } from 'react'
import { useChannelConnections } from '@/hooks/useChannelConnections'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/StatusDot'
import '@/styles/components/TelegramSettingsPanel.css'

export function TelegramSettingsPanel() {
  const { connections, loading, error, createConnection, deleteConnection, testConnection } =
    useChannelConnections('telegram')

  const [tokenInput, setTokenInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const connection = connections[0]

  const handleSave = useCallback(async () => {
    const token = tokenInput.trim()

    if (!token) {
      setLocalError('Please enter your bot token')
      return
    }

    if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
      setLocalError('Invalid bot token format. Expected format: 123456789:ABCDefGHI...')
      return
    }

    setIsSaving(true)
    setLocalError(null)

    try {
      await createConnection({
        source: 'telegram',
        credentials: { botToken: token },
      })
      setTokenInput('')
      setIsEditing(false)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [tokenInput, createConnection])

  const handleTest = useCallback(async () => {
    if (!connection) return

    setIsTesting(true)
    setLocalError(null)

    try {
      const result = await testConnection(connection.connectionId)
      if (result.errorMessage) {
        setLocalError(result.errorMessage)
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Test failed')
    } finally {
      setIsTesting(false)
    }
  }, [connection, testConnection])

  const handleDisconnect = useCallback(async () => {
    if (!connection) return
    if (!confirm('Disconnect Telegram bot? You will need to re-enter the token to reconnect.')) {
      return
    }

    setIsDisconnecting(true)
    setLocalError(null)

    try {
      await deleteConnection(connection.connectionId)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to disconnect')
    } finally {
      setIsDisconnecting(false)
    }
  }, [connection, deleteConnection])

  const handleCancel = useCallback(() => {
    setTokenInput('')
    setIsEditing(false)
    setLocalError(null)
  }, [])

  if (loading) {
    return (
      <section className="settings-panel telegram-settings">
        <header className="settings-panel__header">
          <div>
            <p className="section-label">Integration</p>
            <h3>Telegram</h3>
          </div>
        </header>
        <p className="settings-panel__meta">Loading...</p>
      </section>
    )
  }

  const displayError = localError || error
  const isConnected = connection?.status === 'connected'

  return (
    <section className="settings-panel telegram-settings">
      <header className="settings-panel__header">
        <div>
          <p className="section-label">Integration</p>
          <h3>Telegram Bot</h3>
          <p className="settings-panel__meta">
            Connect a Telegram bot to receive and send messages.
          </p>
        </div>
        {connection && (
          <StatusDot
            status={isConnected ? 'online' : 'offline'}
            label={isConnected ? 'Connected' : connection.status}
          />
        )}
      </header>

      {displayError && <div className="telegram-error">{displayError}</div>}

      {/* Not connected */}
      {!connection && !isEditing && (
        <div className="telegram-setup">
          <p className="telegram-setup-text">
            Connect a Telegram bot to aggregate messages in your mailbox. Create a bot via
            BotFather, then enter the token here.
          </p>
          <Button variant="primary" size="sm" onClick={() => setIsEditing(true)}>
            Connect Telegram Bot
          </Button>
        </div>
      )}

      {/* Connected */}
      {connection && !isEditing && (
        <div className="telegram-configured">
          <div className="telegram-info">
            <span className="telegram-info-label">Bot:</span>
            <span className="telegram-info-value">{connection.displayName}</span>
          </div>
          {connection.lastSyncMs && (
            <div className="telegram-info">
              <span className="telegram-info-label">Last sync:</span>
              <span className="telegram-info-value">
                {new Date(connection.lastSyncMs).toLocaleString()}
              </span>
            </div>
          )}
          <div className="telegram-actions">
            <Button variant="secondary" size="sm" onClick={handleTest} disabled={isTesting}>
              {isTesting ? 'Testing...' : 'Test Connection'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setIsEditing(true)
                setLocalError(null)
              }}
            >
              Update Token
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </div>
        </div>
      )}

      {/* Form */}
      {isEditing && (
        <div className="telegram-form">
          <div className="telegram-form-group">
            <label htmlFor="telegram-token" className="telegram-form-label">
              Bot Token <span className="telegram-required">*</span>
            </label>
            <input
              id="telegram-token"
              type="password"
              className="telegram-form-input"
              placeholder="123456789:ABCDefGHIjklmnop..."
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              disabled={isSaving}
            />
            <p className="telegram-form-hint">Get this from @BotFather on Telegram</p>
          </div>
          <div className="telegram-form-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !tokenInput.trim()}
            >
              {isSaving ? 'Connecting...' : 'Connect'}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="telegram-help">
        <details>
          <summary>How to create a Telegram bot</summary>
          <ol className="telegram-help-list">
            <li>Open Telegram and search for @BotFather</li>
            <li>
              Send <code>/newbot</code> and follow the prompts to name your bot
            </li>
            <li>BotFather will give you a token — copy it</li>
            <li>Paste the token above and click Connect</li>
            <li>
              <strong>Important:</strong> Users must start a conversation with your bot (send it a
              message) before their messages will appear in your mailbox.
            </li>
          </ol>
        </details>
      </div>
    </section>
  )
}
