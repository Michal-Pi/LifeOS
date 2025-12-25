import { useContext } from 'react'
import { ThemeContext } from './ThemeContextDefinition'

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}
