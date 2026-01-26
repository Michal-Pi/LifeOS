import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './globals.css'
import './styles/habits-mind.css'
import './styles/training.css'

// Global error handler to catch unhandled promise rejections
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason
    console.error('Unhandled promise rejection:', error)
  })

  // Suppress harmless Firestore persistence warnings
  // This warning occurs when multiple tabs compete for the primary lease
  // It's expected behavior and doesn't affect functionality
  const originalWarn = console.warn
  const originalError = console.error
  console.warn = (...args: unknown[]) => {
    const message = args[0]
    if (
      typeof message === 'string' &&
      (message.includes('Failed to obtain primary lease') || message.includes('Backfill Indexes'))
    ) {
      // Suppress this specific warning
      return
    }
    originalWarn.apply(console, args)
  }

  // Suppress Firebase token refresh errors when offline
  // These are expected when the app is offline and Firebase Auth tries to refresh tokens
  console.error = (...args: unknown[]) => {
    const message = args[0]
    if (
      typeof message === 'string' &&
      (message.includes('securetoken.googleapis.com') ||
        message.includes('ERR_INTERNET_DISCONNECTED') ||
        message.includes('Failed to fetch'))
    ) {
      // Suppress Firebase token refresh errors when offline
      return
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
