import { useEffect, useState } from 'react'
import { createLogger } from '@lifeos/core'

const logger = createLogger('LoginPage')
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'

/**
 * Login Page
 *
 * Simplified login page for Vite + React Router.
 * No redirect loops - just sign in and let React Router handle navigation.
 */
export function LoginPage() {
  const { user, signInWithGoogle, signInWithEmail, signUpWithEmail, error } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // If user is already authenticated, redirect to today page
  useEffect(() => {
    if (user) {
      logger.info('[LoginPage] User authenticated, redirecting to /today')
      navigate('/today', { replace: true })
    }
  }, [user, navigate])

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle()
      // Navigation will happen automatically via useEffect above
    } catch (err) {
      logger.error('[LoginPage] Sign-in error:', err)
    }
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (mode === 'signin') {
        await signInWithEmail(email, password)
      } else {
        await signUpWithEmail(email, password)
      }
    } catch (err) {
      logger.error('[LoginPage] Email auth error:', err)
    }
  }

  // If already authenticated, show nothing (redirect is in progress)
  if (user) {
    return null
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header" style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <div className="login-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <img src="/images/logo.png" alt="LifeOS" style={{ height: '48px', width: 'auto' }} />
          </div>
          <h1>Welcome</h1>
          <p>Sign in to access your personal dashboard</p>
        </div>

        <form onSubmit={handleEmailAuth} style={{ marginBottom: '1.5rem' }}>
          <div style={{ marginBottom: '0.75rem' }}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                fontSize: '0.875rem',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
                fontSize: '0.875rem',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.75rem',
              background: '#445c47',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              marginBottom: '0.5rem',
              fontWeight: 500
            }}
          >
            {mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            style={{
              width: '100%',
              padding: '0.5rem',
              background: 'transparent',
              border: 'none',
              color: '#6b7280',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
          </button>
        </form>

        <div style={{ position: 'relative', marginBottom: '1.5rem', textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #e5e7eb', position: 'absolute', top: '50%', width: '100%', zIndex: 0 }} />
          <span
            style={{
              position: 'relative',
              background: 'white',
              padding: '0 0.5rem',
              color: '#6b7280',
              fontSize: '0.875rem',
              zIndex: 1
            }}
          >
            or
          </span>
        </div>

        <button onClick={handleGoogleSignIn} className="google-signin-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', width: '100%', padding: '0.75rem', background: '#445c47', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
          <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Sign in with Google
        </button>

        {error && (
          <div className="error-message">
            {error.message}
          </div>
        )}
      </div>
    </div>
  )
}