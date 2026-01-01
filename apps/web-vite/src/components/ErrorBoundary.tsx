import React, { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { createLogger } from '@lifeos/core'

const logger = createLogger('ErrorBoundary')

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: (error: Error, resetError: () => void) => ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught an error', error, { errorInfo })
  }

  resetError = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.resetError)
      }

      return (
        <div
          className="error-boundary-fallback"
          style={{
            padding: '2rem',
            margin: '2rem',
            border: '2px solid var(--error, #f87171)',
            borderRadius: '16px',
            backgroundColor: 'rgba(248, 113, 113, 0.12)',
          }}
        >
          <h2 style={{ color: 'var(--error, #f87171)', marginBottom: '1rem' }}>
            Something went wrong
          </h2>
          <details style={{ marginBottom: '1rem' }}>
            <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>Error details</summary>
            <pre
              style={{
                marginTop: '0.5rem',
                padding: '1rem',
                backgroundColor: 'var(--background-secondary, #f7f8fa)',
                borderRadius: '10px',
                overflow: 'auto',
                fontSize: '0.875rem',
              }}
            >
              {this.state.error.message}
              {'\n\n'}
              {this.state.error.stack}
            </pre>
          </details>
          <button
            onClick={this.resetError}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'transparent',
              color: 'var(--accent, #00e5ff)',
              border: '1px solid var(--accent, #00e5ff)',
              borderRadius: '10px',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
