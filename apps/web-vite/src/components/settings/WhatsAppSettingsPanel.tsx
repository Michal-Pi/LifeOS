/**
 * WhatsApp Settings Panel
 *
 * Allows users to connect WhatsApp via a companion service + QR code pairing.
 * Shows connection status and provides test/disconnect actions.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useChannelConnections } from '@/hooks/useChannelConnections'
import { Button } from '@/components/ui/button'
import { StatusDot } from '@/components/StatusDot'
import '@/styles/components/WhatsAppSettingsPanel.css'

export function WhatsAppSettingsPanel() {
  const { connections, loading, error, createConnection, deleteConnection, testConnection } =
    useChannelConnections('whatsapp')

  const [urlInput, setUrlInput] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  // QR pairing state
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [isPairing, setIsPairing] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const connection = connections[0]

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
      }
    }
  }, [])

  const handleStartPairing = useCallback(async () => {
    const url = urlInput.trim()
    if (!url) {
      setLocalError('Please enter the companion service URL')
      return
    }

    try {
      new URL(url)
    } catch {
      setLocalError('Please enter a valid URL')
      return
    }

    setIsPairing(true)
    setLocalError(null)
    setQrCode(null)

    try {
      // Fetch QR code from companion service
      const qrRes = await fetch(`${url}/api/qr`, {
        signal: AbortSignal.timeout(15_000),
      })
      if (!qrRes.ok) {
        throw new Error(`Companion service returned ${qrRes.status}`)
      }
      const qrData = (await qrRes.json()) as { qrCode?: string }
      if (!qrData.qrCode) {
        throw new Error('No QR code returned by companion service')
      }
      setQrCode(qrData.qrCode)

      // Poll for connection status
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${url}/api/status`, {
            signal: AbortSignal.timeout(5_000),
          })
          if (!statusRes.ok) return
          const statusData = (await statusRes.json()) as {
            status?: string
            phoneNumber?: string
          }

          if (statusData.status === 'connected') {
            if (pollRef.current) {
              clearInterval(pollRef.current)
              pollRef.current = null
            }

            // Create the connection in Firestore
            await createConnection({
              source: 'whatsapp',
              displayName: statusData.phoneNumber || phoneInput.trim() || 'WhatsApp',
              credentials: {
                ...(phoneInput.trim() ? { phoneNumber: phoneInput.trim() } : {}),
              },
              config: { companionServiceUrl: url },
            })

            setQrCode(null)
            setIsPairing(false)
            setIsEditing(false)
            setUrlInput('')
            setPhoneInput('')
          }
        } catch {
          // Ignore transient polling errors
        }
      }, 3000)

      // Stop polling after 2 minutes (QR expires)
      setTimeout(() => {
        if (pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
          setIsPairing(false)
          setQrCode(null)
          setLocalError('QR code expired. Click "Pair Device" to try again.')
        }
      }, 120_000)
    } catch (err) {
      setIsPairing(false)
      setLocalError(err instanceof Error ? err.message : 'Failed to reach companion service')
    }
  }, [urlInput, phoneInput, createConnection])

  const handleCancelPairing = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setQrCode(null)
    setIsPairing(false)
  }, [])

  const handleSaveDirectly = useCallback(async () => {
    const url = urlInput.trim()
    if (!url) {
      setLocalError('Please enter the companion service URL')
      return
    }

    try {
      new URL(url)
    } catch {
      setLocalError('Please enter a valid URL')
      return
    }

    setIsSaving(true)
    setLocalError(null)

    try {
      await createConnection({
        source: 'whatsapp',
        displayName: phoneInput.trim() || 'WhatsApp',
        credentials: {
          ...(phoneInput.trim() ? { phoneNumber: phoneInput.trim() } : {}),
        },
        config: { companionServiceUrl: url },
      })
      setUrlInput('')
      setPhoneInput('')
      setIsEditing(false)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [urlInput, phoneInput, createConnection])

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
    if (!confirm('Disconnect WhatsApp? You will need to re-pair to reconnect.')) {
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
    handleCancelPairing()
    setUrlInput('')
    setPhoneInput('')
    setIsEditing(false)
    setLocalError(null)
  }, [handleCancelPairing])

  if (loading) {
    return (
      <section className="settings-panel whatsapp-settings">
        <header className="settings-panel__header">
          <div>
            <p className="section-label">Integration</p>
            <h3>WhatsApp</h3>
          </div>
        </header>
        <p className="settings-panel__meta">Loading...</p>
      </section>
    )
  }

  const displayError = localError || error
  const isConnected = connection?.status === 'connected'

  return (
    <section className="settings-panel whatsapp-settings">
      <header className="settings-panel__header">
        <div>
          <p className="section-label">Integration</p>
          <h3>WhatsApp Connection</h3>
          <p className="settings-panel__meta">
            Connect WhatsApp via a companion service to see messages in your mailbox.
          </p>
        </div>
        {connection && (
          <StatusDot
            status={isConnected ? 'online' : 'offline'}
            label={isConnected ? 'Connected' : connection.status}
          />
        )}
      </header>

      {displayError && <div className="whatsapp-error">{displayError}</div>}

      {/* Not connected */}
      {!connection && !isEditing && (
        <div className="whatsapp-setup">
          <p className="whatsapp-setup-text">
            Connect WhatsApp by deploying a companion service and scanning a QR code with your
            phone.
          </p>
          <Button variant="primary" size="sm" onClick={() => setIsEditing(true)}>
            Connect WhatsApp
          </Button>
        </div>
      )}

      {/* Connected */}
      {connection && !isEditing && (
        <div className="whatsapp-configured">
          <div className="whatsapp-info">
            <span className="whatsapp-info-label">Account:</span>
            <span className="whatsapp-info-value">{connection.displayName}</span>
          </div>
          {connection.lastSyncMs && (
            <div className="whatsapp-info">
              <span className="whatsapp-info-label">Last sync:</span>
              <span className="whatsapp-info-value">
                {new Date(connection.lastSyncMs).toLocaleString()}
              </span>
            </div>
          )}
          <div className="whatsapp-actions">
            <Button variant="secondary" size="sm" onClick={handleTest} disabled={isTesting}>
              {isTesting ? 'Testing...' : 'Test Connection'}
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
        <div className="whatsapp-form">
          <div className="whatsapp-form-group">
            <label htmlFor="whatsapp-url" className="whatsapp-form-label">
              Companion Service URL <span className="whatsapp-required">*</span>
            </label>
            <input
              id="whatsapp-url"
              type="text"
              className="whatsapp-form-input"
              placeholder="https://whatsapp-companion.run.app"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              disabled={isSaving || isPairing}
            />
          </div>
          <div className="whatsapp-form-group">
            <label htmlFor="whatsapp-phone" className="whatsapp-form-label">
              Phone Number <span className="whatsapp-optional">(optional)</span>
            </label>
            <input
              id="whatsapp-phone"
              type="text"
              className="whatsapp-form-input"
              placeholder="+1 555 123 4567"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              disabled={isSaving || isPairing}
            />
            <p className="whatsapp-form-hint">For your reference only</p>
          </div>

          {/* QR Code Display */}
          {qrCode && (
            <div className="whatsapp-qr-section">
              <p className="whatsapp-qr-instructions">
                Scan this QR code with WhatsApp on your phone:
              </p>
              <p className="whatsapp-qr-instructions whatsapp-qr-steps">
                Open WhatsApp &gt; Settings &gt; Linked Devices &gt; Link a Device
              </p>
              <div className="whatsapp-qr-container">
                <img src={qrCode} alt="WhatsApp QR Code" className="whatsapp-qr-image" />
              </div>
              <p className="whatsapp-qr-waiting">Waiting for scan...</p>
            </div>
          )}

          <div className="whatsapp-form-actions">
            {!qrCode && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleStartPairing}
                  disabled={isPairing || !urlInput.trim()}
                >
                  {isPairing ? 'Loading QR...' : 'Pair Device'}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSaveDirectly}
                  disabled={isSaving || !urlInput.trim()}
                >
                  {isSaving ? 'Saving...' : 'Save Without Pairing'}
                </Button>
              </>
            )}
            <Button variant="secondary" size="sm" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="whatsapp-help">
        <details>
          <summary>How to set up WhatsApp</summary>
          <ol className="whatsapp-help-list">
            <li>Deploy the WhatsApp companion service to Cloud Run or another host</li>
            <li>Enter the service URL above</li>
            <li>Click "Pair Device" to generate a QR code</li>
            <li>
              Open WhatsApp on your phone &gt; Settings &gt; Linked Devices &gt; Link a Device
            </li>
            <li>Scan the QR code with your phone</li>
            <li>Incoming messages will be cached to Firestore and appear in your mailbox</li>
          </ol>
        </details>
      </div>
    </section>
  )
}
