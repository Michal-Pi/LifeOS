/**
 * Slack App Settings Panel
 *
 * Allows users to configure their Slack App Client ID.
 * The Client ID is not a secret - it appears in OAuth URLs.
 */

import { useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useSlackAppSettings } from '@/hooks/useSlackAppSettings'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/StatusDot'
import '@/styles/components/SlackAppSettingsPanel.css'

export function SlackAppSettingsPanel() {
  const { user } = useAuth()
  const { settings, isLoading, error, isConfigured, saveSettings, deleteSettings } =
    useSlackAppSettings(user?.uid)

  const [clientIdInput, setClientIdInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const handleSave = useCallback(async () => {
    if (!clientIdInput.trim()) {
      setLocalError('Please enter a Slack Client ID')
      return
    }

    // Basic validation: Slack Client IDs are numeric strings
    if (!/^\d+\.\d+$/.test(clientIdInput.trim())) {
      setLocalError('Invalid Client ID format. Expected format: 123456789.987654321')
      return
    }

    setIsSaving(true)
    setLocalError(null)

    try {
      await saveSettings({ clientId: clientIdInput.trim() })
      setClientIdInput('')
      setIsEditing(false)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }, [clientIdInput, saveSettings])

  const handleDelete = useCallback(async () => {
    if (
      !confirm(
        'Remove Slack App configuration? You will need to reconfigure it to connect workspaces.'
      )
    ) {
      return
    }

    setIsDeleting(true)
    setLocalError(null)

    try {
      await deleteSettings()
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to delete settings')
    } finally {
      setIsDeleting(false)
    }
  }, [deleteSettings])

  const handleEdit = useCallback(() => {
    setClientIdInput(settings?.clientId ?? '')
    setIsEditing(true)
    setLocalError(null)
  }, [settings?.clientId])

  const handleCancel = useCallback(() => {
    setClientIdInput('')
    setIsEditing(false)
    setLocalError(null)
  }, [])

  if (isLoading) {
    return (
      <section className="settings-panel slack-app-settings">
        <header className="settings-panel__header">
          <div>
            <p className="section-label">Integration</p>
            <h3>Slack App</h3>
          </div>
        </header>
        <p className="settings-panel__meta">Loading...</p>
      </section>
    )
  }

  const displayError = localError || error

  return (
    <section className="settings-panel slack-app-settings">
      <header className="settings-panel__header">
        <div>
          <p className="section-label">Integration</p>
          <h3>Slack App Configuration</h3>
          <p className="settings-panel__meta">
            Configure your Slack App to enable workspace connections.
          </p>
        </div>
        <StatusDot
          status={isConfigured ? 'online' : 'offline'}
          label={isConfigured ? 'Configured' : 'Not configured'}
        />
      </header>

      {displayError && <div className="slack-app-error">{displayError}</div>}

      {!isConfigured && !isEditing && (
        <div className="slack-app-setup">
          <p className="slack-app-setup-text">
            To connect Slack workspaces, you need to configure your Slack App Client ID. You can
            create a Slack App at{' '}
            <a
              href="https://api.slack.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="slack-app-link"
            >
              api.slack.com/apps
            </a>
          </p>
          <Button variant="primary" size="sm" onClick={() => setIsEditing(true)}>
            Configure Slack App
          </Button>
        </div>
      )}

      {isConfigured && !isEditing && (
        <div className="slack-app-configured">
          <div className="slack-app-info">
            <span className="slack-app-info-label">Client ID:</span>
            <code className="slack-app-info-value">
              {settings?.clientId?.replace(/^(\d{4}).*(\d{4})$/, '$1...$2') ?? '---'}
            </code>
          </div>
          <div className="slack-app-actions">
            <Button variant="secondary" size="sm" onClick={handleEdit}>
              Edit
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Removing...' : 'Remove'}
            </Button>
          </div>
        </div>
      )}

      {isEditing && (
        <div className="slack-app-form">
          <div className="slack-app-form-group">
            <label htmlFor="slack-client-id" className="slack-app-form-label">
              Slack Client ID
            </label>
            <input
              id="slack-client-id"
              type="text"
              className="slack-app-form-input"
              placeholder="123456789.987654321"
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
              disabled={isSaving}
            />
            <p className="slack-app-form-hint">
              Find this in your Slack App settings under "Basic Information" &gt; "App Credentials"
            </p>
          </div>
          <div className="slack-app-form-actions">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !clientIdInput.trim()}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="slack-app-help">
        <details>
          <summary>How to create a Slack App</summary>
          <ol className="slack-app-help-list">
            <li>
              Go to{' '}
              <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer">
                api.slack.com/apps
              </a>
            </li>
            <li>Click "Create New App" &gt; "From scratch"</li>
            <li>Name your app (e.g., "LifeOS Mailbox") and select a workspace</li>
            <li>
              Go to "OAuth &amp; Permissions" and add these scopes:
              <code className="slack-app-scopes">
                channels:history, channels:read, groups:history, groups:read, im:history, im:read,
                mpim:history, mpim:read, users:read
              </code>
            </li>
            <li>
              Add a Redirect URL:{' '}
              <code>https://us-central1-lifeos-pi.cloudfunctions.net/slackAuthCallback</code>
            </li>
            <li>Copy your Client ID from "Basic Information" and paste it above</li>
          </ol>
        </details>
      </div>
    </section>
  )
}
