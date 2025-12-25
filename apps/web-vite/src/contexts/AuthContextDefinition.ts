import { createContext } from 'react'
import { type User } from '../lib/firebase'

/**
 * Authentication Context Value Interface
 *
 * Defines the shape of the authentication context.
 */
export interface AuthContextValue {
  user: User | null
  loading: boolean
  error: Error | null
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

/**
 * The React Context object for authentication.
 */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined)