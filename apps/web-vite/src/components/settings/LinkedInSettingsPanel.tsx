/**
 * LinkedIn Settings Panel
 *
 * Allows users to connect their LinkedIn account via li_at session cookie.
 * Shows connection status and provides test/disconnect actions.
 */

import { useState, useCallback } from 'react'
import { useChannelConnections } from '@/hooks/useChannelConnections'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/StatusDot'
import '@/styles/components/LinkedInSettingsPanel.css'

export function LinkedInSettingsPanel() {
  const { connections, loading, error, createConnection, deleteConnection, testConnection } =
    useChannelConnections('linkedin')

  const [cookieInput, setCookieInput] = useState('')
  const [csrfInput, setCsrfInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const connection = connections[0] // LinkedIn supports one connection at a time

  const handleSave = useCallback(async () => {
    if (!cookieInput.trim()) {
      setLocalError('Please enter your li_at cookie')
      return
    }

    setIsSaving(true)
    setLocalError(null)

    try {
      await createConnection({
        source: 'linkedin',
        credentials: {
          liAtCookie: cookieInput.trim(),
          ...(csrfInput.trim() ? { csrfToken: csrfInput.trim() } : {}),
        },
      })
      setCookieInput('')
      setCsrfInput('')
      setIsEditing(false)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [cookieInput, csrfInput, createConnection])

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
    if (!confirm('Disconnect LinkedIn? You will need to re-enter your cookie to reconnect.')) {
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
    setCookieInput('')
    setCsrfInput('')
    setIsEditing(false)
    setLocalError(null)
  }, [])

  if (loading) {
    return (
      <section className="settings-panel linkedin-settings">
        <header className="settings-panel__header">
          <div>
            <p className="section-label">Integration</p>
            <h3>LinkedIn</h3>
          </div>
        </header>
        <p className="settings-panel__meta">Loading...</p>
      </section>
    )
  }

  const displayError = localError || error
  const isConnected = connection?.status === 'connected'
  const isExpired = connection?.status === 'expired'

  return (
    <section className="settings-panel linkedin-settings">
      <header className="settings-panel__header">
        <div>
          <p className="section-label">Integration</p>
          <h3>LinkedIn Connection</h3>
          <p className="settings-panel__meta">
            Connect your LinkedIn account to see prioritized messages.
          </p>
        </div>
        {connection && (
          <StatusDot
            status={isConnected ? 'online' : 'offline'}
            label={isExpired ? 'Expired' : isConnected ? 'Connected' : connection.status}
          />
        )}
      </header>

      {displayError && <div className="linkedin-error">{displayError}</div>}

      {/* Not connected and not editing */}
      {!connection && !isEditing && (
        <div className="linkedin-setup">
          <p className="linkedin-setup-text">
            Connect your LinkedIn account by providing your session cookie. This allows LifeOS to
            read and prioritize your LinkedIn messages.
          </p>
          <Button variant="primary" size="sm" onClick={() => setIsEditing(true)}>
            Connect LinkedIn
          </Button>
        </div>
      )}

      {/* Connected state */}
      {connection && !isEditing && (
        <div className="linkedin-configured">
          <div className="linkedin-info">
            <span className="linkedin-info-label">Account:</span>
            <span className="linkedin-info-value">{connection.displayName}</span>
          </div>
          {connection.lastSyncMs && (
            <div className="linkedin-info">
              <span className="linkedin-info-label">Last sync:</span>
              <span className="linkedin-info-value">
                {new Date(connection.lastSyncMs).toLocaleString()}
              </span>
            </div>
          )}
          {isExpired && (
            <div className="linkedin-warning">
              Your LinkedIn session has expired. Please re-enter your li_at cookie.
            </div>
          )}
          <div className="linkedin-actions">
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
              Update Cookie
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

      {/* Editing / adding */}
      {isEditing && (
        <div className="linkedin-form">
          <div className="linkedin-form-group">
            <label htmlFor="linkedin-cookie" className="linkedin-form-label">
              li_at Cookie <span className="linkedin-required">*</span>
            </label>
            <input
              id="linkedin-cookie"
              type="password"
              className="linkedin-form-input"
              placeholder="AQEDAx..."
              value={cookieInput}
              onChange={(e) => setCookieInput(e.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="linkedin-form-group">
            <label htmlFor="linkedin-csrf" className="linkedin-form-label">
              CSRF Token <span className="linkedin-optional">(optional)</span>
            </label>
            <input
              id="linkedin-csrf"
              type="password"
              className="linkedin-form-input"
              placeholder="ajax:12345..."
              value={csrfInput}
              onChange={(e) => setCsrfInput(e.target.value)}
              disabled={isSaving}
            />
          </div>
          <div className="linkedin-form-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !cookieInput.trim()}
            >
              {isSaving ? 'Connecting...' : 'Connect'}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="linkedin-help">
        <details>
          <summary>How to get your LinkedIn cookie</summary>
          <ol className="linkedin-help-list">
            <li>Open LinkedIn in your browser and make sure you are logged in</li>
            <li>Open DevTools (F12 or Cmd+Option+I)</li>
            <li>Go to Application &gt; Cookies &gt; linkedin.com</li>
            <li>
              Find the <code>li_at</code> cookie and copy its value
            </li>
            <li>
              (Optional) Find the <code>JSESSIONID</code> cookie for the CSRF token
            </li>
            <li>Paste the values above and click Connect</li>
            <li>
              <strong>Note:</strong> The cookie expires when you log out of LinkedIn or after some
              time. You will need to re-enter it when it expires.
            </li>
          </ol>
        </details>
      </div>
    </section>
  )
}
