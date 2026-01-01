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
    <div
      className="settings-content"
      style={{
        marginBottom: '2rem',
        padding: '1.5rem',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        background: 'var(--card)',
      }}
    >
      <h3
        style={{
          marginTop: 0,
          color: 'var(--foreground)',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
        }}
      >
        System Status
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem',
          marginTop: '1rem',
        }}
      >
        <div>
          <p className="section-label" style={{ marginBottom: '0.5rem' }}>
            Network
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: isOnline ? 'var(--success)' : 'var(--error)',
              }}
            />
            <span style={{ fontWeight: 'bold' }}>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
          </div>
        </div>
        <div>
          <p className="section-label" style={{ marginBottom: '0.5rem' }}>
            Auth
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: user ? 'var(--success)' : 'var(--secondary-foreground)',
              }}
            />
            <span style={{ fontWeight: 'bold' }}>{user ? 'AUTHENTICATED' : 'GUEST'}</span>
          </div>
        </div>
        <div>
          <p className="section-label" style={{ marginBottom: '0.5rem' }}>
            Latency
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--secondary-foreground)' }}>
              {latency ? `${latency}ms` : '...'}
            </span>
          </div>
        </div>
        <div>
          <p className="section-label" style={{ marginBottom: '0.5rem' }}>
            Bandwidth
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={runSpeedTest}
              disabled={isTestingSpeed || !isOnline}
              className="ghost-button small"
              style={{ fontSize: '0.7rem', padding: '2px 8px', minWidth: 'auto' }}
            >
              {isTestingSpeed ? 'TESTING...' : 'TEST SPEED'}
            </button>
            {downloadSpeed && (
              <span
                style={{ fontFamily: 'var(--font-mono)', color: 'var(--secondary-foreground)' }}
              >
                {downloadSpeed} Mbps
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
