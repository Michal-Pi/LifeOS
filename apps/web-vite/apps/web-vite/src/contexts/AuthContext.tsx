import { useEffect, useState, type ReactNode } from 'react'
import {
  signInWithGoogle as firebaseSignInWithGoogle,
  signInWithEmail as firebaseSignInWithEmail,
  signUpWithEmail as firebaseSignUpWithEmail,
  signOut as firebaseSignOut,
  subscribeToAuthState,
  initializeFirebase,
  type User,
} from '../lib/firebase'
import { AuthContext, type AuthContextValue } from '../../contexts/AuthContextDefinition'

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
    console.log('[AuthProvider] Initializing Firebase...')
    initializeFirebase()
      .then(() => {
        console.log('[AuthProvider] Firebase initialized')
      })
      .catch((err) => {
        console.error('[AuthProvider] Failed to initialize Firebase:', err)
        setError(err)
        setLoading(false)
      })
  }, [])

  // Subscribe to auth state changes
  useEffect(() => {
    console.log('[AuthProvider] Setting up auth state subscription')

    const unsubscribe = subscribeToAuthState((authUser) => {
      console.log(
        '[AuthProvider] Auth state changed:',
        authUser ? `User ${authUser.uid}` : 'No user'
      )
      setUser(authUser)
      setLoading(false)
    })

    return () => {
      console.log('[AuthProvider] Cleaning up auth subscription')
      unsubscribe()
    }
  }, [])

  const handleSignInWithGoogle = async () => {
    try {
      setError(null)
      console.log('[AuthProvider] Starting Google sign-in')
      await firebaseSignInWithGoogle()
      console.log('[AuthProvider] Google sign-in successful')
    } catch (err) {
      console.error('[AuthProvider] Google sign-in failed:', err)
      setError(err as Error)
      throw err
    }
  }

  const handleSignInWithEmail = async (email: string, password: string) => {
    try {
      setError(null)
      console.log('[AuthProvider] Starting email sign-in')
      await firebaseSignInWithEmail(email, password)
      console.log('[AuthProvider] Email sign-in successful')
    } catch (err) {
      console.error('[AuthProvider] Email sign-in failed:', err)
      setError(err as Error)
      throw err
    }
  }

  const handleSignUpWithEmail = async (email: string, password: string) => {
    try {
      setError(null)
      console.log('[AuthProvider] Starting email sign-up')
      await firebaseSignUpWithEmail(email, password)
      console.log('[AuthProvider] Email sign-up successful')
    } catch (err) {
      console.error('[AuthProvider] Email sign-up failed:', err)
      setError(err as Error)
      throw err
    }
  }

  const handleSignOut = async () => {
    try {
      setError(null)
      console.log('[AuthProvider] Starting sign-out')
      await firebaseSignOut()
      console.log('[AuthProvider] Sign-out successful')
    } catch (err) {
      console.error('[AuthProvider] Sign-out failed:', err)
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
    signOut: handleSignOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
