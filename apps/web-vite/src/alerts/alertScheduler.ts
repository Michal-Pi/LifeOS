/**
 * Alert Scheduler Module
 * 
 * This module manages in-app alert delivery for calendar events.
 * It runs only while the app is open (foreground) and is best-effort.
 * 
 * Key behaviors:
 * - Watches events in a time window (next 24 hours)
 * - Computes next pending alerts
 * - Sets timers to fire alerts
 * - Recomputes when events change or tab gains focus
 */

import type { CanonicalCalendarEvent, CanonicalAlert } from '@lifeos/calendar'
import {
  getPrimaryAlert,
  computeAlertFireTimeMs,
  shouldAlertFire,
  isDeleted,
  createLogger
} from '@lifeos/calendar'

const logger = createLogger('AlertScheduler')

/**
 * Represents an alert that should be shown
 */
export interface PendingAlert {
  event: CanonicalCalendarEvent
  alert: CanonicalAlert
  fireTimeMs: number
}

/**
 * Callback when an alert fires
 */
export type AlertCallback = (pendingAlert: PendingAlert) => void

/**
 * Scheduler state
 */
interface SchedulerState {
  events: CanonicalCalendarEvent[]
  timer: ReturnType<typeof setTimeout> | null
  onAlert: AlertCallback | null
  isRunning: boolean
  lastComputeMs: number
}

const state: SchedulerState = {
  events: [],
  timer: null,
  onAlert: null,
  isRunning: false,
  lastComputeMs: 0
}

// Time window for alert checking (24 hours)
const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000

// Minimum recompute interval (prevent thrashing)
const MIN_RECOMPUTE_INTERVAL_MS = 1000

/**
 * Start the alert scheduler
 */
export function startAlertScheduler(onAlert: AlertCallback): void {
  if (state.isRunning) {
    logger.warn('Already running')
    return
  }

  state.onAlert = onAlert
  state.isRunning = true

  // Listen for visibility changes
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  // Initial computation
  recomputeAlerts()

  logger.info('Started')
}

/**
 * Stop the alert scheduler
 */
export function stopAlertScheduler(): void {
  if (!state.isRunning) {
    return
  }

  state.isRunning = false
  state.onAlert = null
  clearTimer()

  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  }

  logger.info('Stopped')
}

/**
 * Update the events the scheduler watches
 */
export function updateSchedulerEvents(events: CanonicalCalendarEvent[]): void {
  state.events = events
  
  if (state.isRunning) {
    recomputeAlerts()
  }
}

/**
 * Force recomputation of alerts (e.g., after alert settings change)
 */
export function refreshAlerts(): void {
  if (state.isRunning) {
    recomputeAlerts()
  }
}

/**
 * Handle visibility change (tab focus)
 */
function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible' && state.isRunning) {
    recomputeAlerts()
  }
}

/**
 * Clear the current timer
 */
function clearTimer(): void {
  if (state.timer) {
    clearTimeout(state.timer)
    state.timer = null
  }
}

/**
 * Recompute which alerts should fire and schedule the next one
 */
function recomputeAlerts(): void {
  // Throttle recomputation
  const now = Date.now()
  if (now - state.lastComputeMs < MIN_RECOMPUTE_INTERVAL_MS) {
    return
  }
  state.lastComputeMs = now

  clearTimer()

  if (!state.isRunning || !state.onAlert) {
    return
  }

  const nowMs = Date.now()
  const windowEndMs = nowMs + ALERT_WINDOW_MS

  // Find all pending alerts in the window
  const pendingAlerts: PendingAlert[] = []

  for (const event of state.events) {
    // Skip deleted/cancelled events
    if (isDeleted(event) || event.status === 'cancelled') {
      continue
    }

    // Skip events outside the window
    if (event.startMs > windowEndMs || event.startMs < nowMs) {
      continue
    }

    // Get primary alert
    const alert = getPrimaryAlert(event)
    if (!alert || !alert.enabled) {
      continue
    }

    // Compute fire time
    const fireTimeMs = computeAlertFireTimeMs(event, alert)
    if (fireTimeMs === null) {
      continue
    }

    // Check if alert should fire now or in the future
    if (shouldAlertFire(event, alert, nowMs)) {
      // Fire immediately
      state.onAlert({ event, alert, fireTimeMs })
    } else if (fireTimeMs > nowMs && fireTimeMs < windowEndMs) {
      // Schedule for later
      pendingAlerts.push({ event, alert, fireTimeMs })
    }
  }

  // Find the next alert to schedule
  if (pendingAlerts.length > 0) {
    // Sort by fire time
    pendingAlerts.sort((a, b) => a.fireTimeMs - b.fireTimeMs)
    const nextAlert = pendingAlerts[0]
    const delay = Math.max(0, nextAlert.fireTimeMs - nowMs)

    state.timer = setTimeout(() => {
      if (state.isRunning && state.onAlert) {
        // Verify the alert should still fire
        if (shouldAlertFire(nextAlert.event, nextAlert.alert, Date.now())) {
          state.onAlert(nextAlert)
        }
        // Recompute for next alert
        recomputeAlerts()
      }
    }, delay)

    logger.info('Next alert scheduled', {
      eventTitle: nextAlert.event.title,
      delaySeconds: Math.round(delay / 1000)
    })
  }
}

/**
 * Get scheduler status for debugging/display
 */
export function getSchedulerStatus(): {
  isRunning: boolean
  eventCount: number
  hasTimer: boolean
} {
  return {
    isRunning: state.isRunning,
    eventCount: state.events.length,
    hasTimer: state.timer !== null
  }
}





