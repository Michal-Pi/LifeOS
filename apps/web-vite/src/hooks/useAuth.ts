import { useContext } from 'react'
import { AuthContext } from '../contexts/AuthContextDefinition'

/**
 * Custom hook to access the authentication context.
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
