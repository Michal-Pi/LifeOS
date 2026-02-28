import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './globals.css'
import './lib/cleanupOldTemplates' // Expose cleanup function to window
import './styles/habits-mind.css'
import './styles/training.css'

// Global error handler to catch unhandled promise rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason
    console.error('Unhandled promise rejection:', error)
  })

  // Intercept Firestore primary lease warnings and route them to the
  // lifecycle manager for active recovery instead of only suppressing output.
  const originalWarn = console.warn
  const originalError = console.error

  const extractLogText = (args: unknown[]): string =>
    args
      .map((arg) => {
        if (typeof arg === 'string') return arg
        if (arg && typeof arg === 'object' && 'message' in arg) {
          const value = (arg as { message?: unknown }).message
          return typeof value === 'string' ? value : ''
        }
        return ''
      })
      .filter(Boolean)
      .join(' ')

  const isLeaseMessage = (msg: string) => {
    const lower = msg.toLowerCase()
    return (
      lower.includes('failed to obtain primary lease') ||
      lower.includes('maybegarbagecollectmulticlientstate') ||
      lower.includes('backfill indexes') ||
      lower.includes('apply remote event') ||
      lower.includes('collect garbage')
    )
  }

  const routeLeaseError = (msg: string) => {
    // This specific action is expected in secondary tabs and not actionable.
    if (msg.toLowerCase().includes('maybegarbagecollectmulticlientstate')) {
      return
    }

    import('./lib/firestoreLifecycle').then(({ reportLeaseError }) => {
      import('./lib/firebase').then(({ getFirestoreClient }) => {
        try {
          const db = getFirestoreClient()
          const action = msg.includes('Backfill')
            ? 'Backfill Indexes'
            : msg.includes('Apply remote')
              ? 'Apply remote event'
              : 'Collect garbage'
          reportLeaseError(db, action)
        } catch {
          // Firestore not initialized yet
        }
      })
    })
  }

  console.warn = (...args: unknown[]) => {
    const message = extractLogText(args)
    if (message) {
      if (isLeaseMessage(message)) {
        routeLeaseError(message)
        return
      }
      if (message.includes('WebChannelConnection') && message.includes('transport errored')) {
        return
      }
    }
    originalWarn.apply(console, args)
  }

  // Suppress expected Firebase network errors when offline.
  // Route lease errors to lifecycle manager for recovery.
  console.error = (...args: unknown[]) => {
    const message = extractLogText(args)
    if (message) {
      if (isLeaseMessage(message)) {
        routeLeaseError(message)
        return
      }
      if (
        message.includes('securetoken.googleapis.com') ||
        message.includes('ERR_INTERNET_DISCONNECTED') ||
        message.includes('Failed to fetch') ||
        message.includes('ERR_QUIC_PROTOCOL_ERROR') ||
        message.includes('ERR_ABORTED') ||
        message.includes('ERR_NETWORK_CHANGED') ||
        message.includes('fireauth is not defined')
      ) {
        return
      }
    }
    originalError.apply(console, args)
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed', error)
    })
  })
}
