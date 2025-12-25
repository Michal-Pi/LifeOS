import { useEffect, useState, type ReactNode } from 'react'
import {
  signInWithGoogle as firebaseSignInWithGoogle,
  signInWithEmail as firebaseSignInWithEmail,
  signUpWithEmail as firebaseSignUpWithEmail,
  signOut as firebaseSignOut,
  subscribeToAuthState,
  initializeFirebase,
  type User
} from '../lib/firebase'
import { AuthContext, type AuthContextValue } from './AuthContextDefinition'
import { ThemeProvider } from './ThemeContext'
import { createLogger } from '@lifeos/core'

const logger = createLogger('AuthProvider')

/**
 * Authentication Context
 *
 * Provides authentication state and methods throughout the app.
 * Simplified from Next.js version - no SSR workarounds needed.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Initialize Firebase on mount
  useEffect(() => {
    logger.info('Initializing Firebase...')
    initializeFirebase()
      .then(() => {
        logger.info('Firebase initialized')
      })
      .catch((err) => {
        logger.error('Failed to initialize Firebase:', err)
        setError(err)
        setLoading(false)
      })
  }, [])

  // Subscribe to auth state changes
  useEffect(() => {
    logger.info('Setting up auth state subscription')

    const unsubscribe = subscribeToAuthState((authUser) => {
      logger.info('Auth state changed', { userId: authUser?.uid ?? 'No user' })
      setUser(authUser)
      setLoading(false)
    })

    return () => {
      logger.info('Cleaning up auth subscription')
      unsubscribe()
    }
  }, [])

  const handleSignInWithGoogle = async () => {
    try {
      setError(null)
      logger.info('Starting Google sign-in')
      await firebaseSignInWithGoogle()
      logger.info('Google sign-in successful')
    } catch (err) {
      logger.error('Google sign-in failed:', err)
      setError(err as Error)
      throw err
    }
  }

  const handleSignInWithEmail = async (email: string, password: string) => {
    try {
      setError(null)
      logger.info('Starting email sign-in')
      await firebaseSignInWithEmail(email, password)
      logger.info('Email sign-in successful')
    } catch (err) {
      logger.error('Email sign-in failed:', err)
      setError(err as Error)
      throw err
    }
  }

  const handleSignUpWithEmail = async (email: string, password: string) => {
    try {
      setError(null)
      logger.info('Starting email sign-up')
      await firebaseSignUpWithEmail(email, password)
      logger.info('Email sign-up successful')
    } catch (err) {
      logger.error('Email sign-up failed:', err)
      setError(err as Error)
      throw err
    }
  }

  const handleSignOut = async () => {
    try {
      setError(null)
      logger.info('Starting sign-out')
      await firebaseSignOut()
      logger.info('Sign-out successful')
    } catch (err) {
      logger.error('Sign-out failed:', err)
      setError(err as Error)
      throw err
    }
  }

  const value: AuthContextValue = {
    user,
    loading,
    error,
    signInWithGoogle: handleSignInWithGoogle,
    signInWithEmail: handleSignInWithEmail,
    signUpWithEmail: handleSignUpWithEmail,
    signOut: handleSignOut
  }

  return (
    <AuthContext.Provider value={value}>
      <ThemeProvider>{children}</ThemeProvider>
    </AuthContext.Provider>
  )
}
