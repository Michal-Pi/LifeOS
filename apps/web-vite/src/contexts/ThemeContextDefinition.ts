import { createContext } from 'react'

export type Theme = 'light' | 'dark'

/**
 * Theme Context Value Interface
 *
 * Defines the shape of the theme context.
 */
export interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

/**
 * The React Context object for theme.
 */
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
