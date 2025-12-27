import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

/**
 * Login Page
 *
 * Simplified login page for Vite + React Router.
 * No redirect loops - just sign in and let React Router handle navigation.
 */
export function LoginPage() {
  const { user, signInWithGoogle, error } = useAuth()
  const navigate = useNavigate()

  // If user is already authenticated, redirect to today page
  useEffect(() => {
    if (user) {
      console.log('[LoginPage] User authenticated, redirecting to /today')
      navigate('/today', { replace: true })
    }
  }, [user, navigate])

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle()
      // Navigation will happen automatically via useEffect above
    } catch (err) {
      console.error('[LoginPage] Sign-in error:', err)
    }
  }

  // If already authenticated, show nothing (redirect is in progress)
  if (user) {
    return null
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <h1>Welcome to LifeOS</h1>
        <p>Sign in to continue</p>

        <button onClick={handleGoogleSignIn} className="google-signin-btn">
          Sign in with Google
        </button>

        {error && <div className="error-message">{error.message}</div>}
      </div>
    </div>
  )
}
