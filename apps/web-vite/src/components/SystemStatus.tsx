import { useEffect, useState } from 'react'
import { createLogger } from '@lifeos/core'

const logger = createLogger('SystemStatus')
import { useAuth } from '@/hooks/useAuth'

export function SystemStatus() {
  const { user } = useAuth()
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )
  const [latency, setLatency] = useState<number | null>(null)
  const [downloadSpeed, setDownloadSpeed] = useState<number | null>(null)
  const [isTestingSpeed, setIsTestingSpeed] = useState(false)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Real latency check (pinging current origin)
  useEffect(() => {
    const checkLatency = async () => {
      const start = performance.now()
      try {
        // HEAD request to avoid downloading body, cache-busting to get real network time
        await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
        setLatency(Math.round(performance.now() - start))
      } catch {
        setLatency(null)
      }
    }

    void checkLatency()
    const interval = setInterval(checkLatency, 10000)
    return () => clearInterval(interval)
  }, [])

  const runSpeedTest = async () => {
    setIsTestingSpeed(true)
    setDownloadSpeed(null)
    const start = performance.now()
    try {
      // Fetch ~1.5MB image from Wikimedia (CORS enabled)
      const response = await fetch(
        'https://upload.wikimedia.org/wikipedia/commons/3/3f/JPEG_example_flower.jpg?t=' +
          Date.now(),
        { cache: 'no-store' }
      )
      const blob = await response.blob()
      const duration = (performance.now() - start) / 1000
      const bits = blob.size * 8
      const mbps = bits / duration / 1_000_000
      setDownloadSpeed(parseFloat(mbps.toFixed(2)))
    } catch (error) {
      logger.error('Speed test failed:', error)
    } finally {
      setIsTestingSpeed(false)
    }
  }

  return (
    <section className="settings-panel system-status">
      <header className="settings-panel__header">
        <div>
          <p className="section-label">System</p>
          <h3>Status</h3>
          <p className="settings-panel__meta">Live network, auth, and latency checks.</p>
        </div>
      </header>
      <div className="system-status__grid">
        <div className="system-status__item">
          <p className="section-label">Network</p>
          <div className="system-status__row">
            <span
              className={`system-status__dot ${isOnline ? 'system-status__dot--online' : 'system-status__dot--offline'}`}
            />
            <span className="system-status__value">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
          </div>
        </div>
        <div className="system-status__item">
          <p className="section-label">Auth</p>
          <div className="system-status__row">
            <span
              className={`system-status__dot ${user ? 'system-status__dot--online' : 'system-status__dot--idle'}`}
            />
            <span className="system-status__value">{user ? 'AUTHENTICATED' : 'GUEST'}</span>
          </div>
        </div>
        <div className="system-status__item">
          <p className="section-label">Latency</p>
          <div className="system-status__row">
            <span className="system-status__mono">{latency ? `${latency}ms` : '...'}</span>
          </div>
        </div>
        <div className="system-status__item">
          <p className="section-label">Bandwidth</p>
          <div className="system-status__row">
            <button
              onClick={runSpeedTest}
              disabled={isTestingSpeed || !isOnline}
              className="ghost-button small"
            >
              {isTestingSpeed ? 'TESTING...' : 'TEST SPEED'}
            </button>
            {downloadSpeed && <span className="system-status__mono">{downloadSpeed} Mbps</span>}
          </div>
        </div>
      </div>
    </section>
  )
}
