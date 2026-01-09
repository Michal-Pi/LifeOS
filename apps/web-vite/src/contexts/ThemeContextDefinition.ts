import { createContext } from 'react'

export type Theme = 'light' | 'dark'
export type ThemeMode = Theme | 'auto'
export type AutoThemeMode = 'system' | 'schedule'

export interface ThemeSchedule {
  start: string
  end: string
}

/**
 * Theme Context Value Interface
 *
 * Defines the shape of the theme context.
 */
export interface ThemeContextValue {
  theme: Theme
  mode: ThemeMode
  autoMode: AutoThemeMode
  schedule: ThemeSchedule
  setMode: (mode: ThemeMode) => void
  setAutoMode: (mode: AutoThemeMode) => void
  setSchedule: (schedule: ThemeSchedule) => void
  toggleTheme: () => void
}

/**
 * The React Context object for theme.
 */
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)
