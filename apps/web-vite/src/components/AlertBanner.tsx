import type { CanonicalCalendarEvent } from '@lifeos/calendar'
import { useCallback, useEffect, useState } from 'react'
import type { PendingAlert } from '@/alerts/alertScheduler'

interface AlertBannerProps {
  pendingAlert: PendingAlert
  onDismiss: (event: CanonicalCalendarEvent) => void
  onOpenEvent: (event: CanonicalCalendarEvent) => void
}

/**
 * Format time remaining until event starts
 */
function formatTimeRemaining(startMs: number, nowMs: number): string {
  const diffMs = startMs - nowMs
  
  if (diffMs <= 0) {
    return 'Starting now'
  }

  const diffMinutes = Math.ceil(diffMs / (60 * 1000))
  
  if (diffMinutes <= 1) {
    return 'Starts in less than a minute'
  }
  
  if (diffMinutes < 60) {
    return `Starts in ${diffMinutes} minute${diffMinutes === 1 ? '' : 's'}`
  }
  
  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60
  
  if (minutes === 0) {
    return `Starts in ${hours} hour${hours === 1 ? '' : 's'}`
  }
  
  return `Starts in ${hours}h ${minutes}m`
}

/**
 * Format event start time
 */
function formatStartTime(startIso: string): string {
  const date = new Date(startIso)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

export function AlertBanner({
  pendingAlert,
  onDismiss,
  onOpenEvent
}: AlertBannerProps) {
  const { event } = pendingAlert
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [isDismissing, setIsDismissing] = useState(false)
  const [hasBeenDismissedByTime, setHasBeenDismissedByTime] = useState(false)

  const handleDismiss = useCallback(() => {
    setIsDismissing(true)
    // Wait for animation
    setTimeout(() => {
      onDismiss(event)
    }, 200)
  }, [event, onDismiss])

  // Update countdown every second and auto-hide when event starts
  useEffect(() => {
    const interval = setInterval(() => {
      const newNowMs = Date.now()
      setNowMs(newNowMs)

      // Auto-hide when event starts
      if (newNowMs >= event.startMs && !hasBeenDismissedByTime) {
        handleDismiss()
        setHasBeenDismissedByTime(true)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [event.startMs, handleDismiss, hasBeenDismissedByTime])

  const handleOpen = () => {
    onOpenEvent(event)
    handleDismiss()
  }

  const timeRemaining = formatTimeRemaining(event.startMs, nowMs)
  const startTime = formatStartTime(event.startIso)

  return (
    <div className={`alert-banner ${isDismissing ? 'dismissing' : ''}`}>
      <span className="alert-icon">🔔</span>
      
      <div className="alert-content">
        <h4 className="alert-title">{event.title || 'Untitled Event'}</h4>
        <p className="alert-time">{startTime}</p>
        <p className="alert-countdown">{timeRemaining}</p>
      </div>

      <div className="alert-actions">
        <button
          type="button"
          className="alert-action-button primary"
          onClick={handleOpen}
        >
          Open
        </button>
      </div>

      <button
        type="button"
        className="alert-dismiss"
        onClick={handleDismiss}
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  )
}

/**
 * Container for multiple alert banners
 */
interface AlertBannerContainerProps {
  alerts: PendingAlert[]
  onDismiss: (event: CanonicalCalendarEvent) => void
  onOpenEvent: (event: CanonicalCalendarEvent) => void
}

export function AlertBannerContainer({
  alerts,
  onDismiss,
  onOpenEvent
}: AlertBannerContainerProps) {
  if (alerts.length === 0) {
    return null
  }

  return (
    <div className="alert-banner-container">
      {alerts.map((alert) => (
        <AlertBanner
          key={alert.event.canonicalEventId}
          pendingAlert={alert}
          onDismiss={onDismiss}
          onOpenEvent={onOpenEvent}
        />
      ))}
    </div>
  )
}
