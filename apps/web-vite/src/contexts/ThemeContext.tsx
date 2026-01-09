/**
 * Theme Context - Framework-agnostic dark/light mode
 *
 * Simple theme provider that works with Vite/React.
 * Manages theme state and applies the appropriate class to the document.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ThemeContext,
  type AutoThemeMode,
  type Theme,
  type ThemeMode,
  type ThemeSchedule,
} from './ThemeContextDefinition'

interface ThemeProviderProps {
  children: ReactNode
  defaultTheme?: ThemeMode
}

const STORAGE_KEY = 'theme-preferences'

const defaultSchedule: ThemeSchedule = {
  start: '',
  end: '',
}

interface ThemePreferences {
  mode: ThemeMode
  autoMode: AutoThemeMode
  schedule: ThemeSchedule
}

function parseStoredPreferences(stored: string | null, fallbackMode: ThemeMode): ThemePreferences {
  if (!stored) {
    const legacyTheme = localStorage.getItem('theme')
    if (legacyTheme === 'light' || legacyTheme === 'dark') {
      return { mode: legacyTheme, autoMode: 'system', schedule: defaultSchedule }
    }
    return { mode: fallbackMode, autoMode: 'system', schedule: defaultSchedule }
  }
  try {
    const parsed = JSON.parse(stored) as Partial<ThemePreferences>
    const mode: ThemeMode =
      parsed.mode === 'light' || parsed.mode === 'dark' || parsed.mode === 'auto'
        ? parsed.mode
        : fallbackMode
    const autoMode: AutoThemeMode = parsed.autoMode === 'schedule' ? 'schedule' : 'system'
    const schedule: ThemeSchedule = {
      start: parsed.schedule?.start ?? '',
      end: parsed.schedule?.end ?? '',
    }
    return { mode, autoMode, schedule }
  } catch {
    return { mode: fallbackMode, autoMode: 'system', schedule: defaultSchedule }
  }
}

function parseTimeToMinutes(value: string): number | null {
  if (!value) return null
  const [hours, minutes] = value.split(':').map((part) => Number.parseInt(part, 10))
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function isWithinSchedule(nowMinutes: number, startMinutes: number, endMinutes: number): boolean {
  if (startMinutes === endMinutes) return false
  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes
}

function resolveTheme(preferences: ThemePreferences, systemPrefersDark: boolean, now: Date): Theme {
  if (preferences.mode === 'light' || preferences.mode === 'dark') {
    return preferences.mode
  }
  if (preferences.autoMode === 'system') {
    return systemPrefersDark ? 'dark' : 'light'
  }
  const startMinutes = parseTimeToMinutes(preferences.schedule.start)
  const endMinutes = parseTimeToMinutes(preferences.schedule.end)
  if (startMinutes === null || endMinutes === null) {
    return systemPrefersDark ? 'dark' : 'light'
  }
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return isWithinSchedule(nowMinutes, startMinutes, endMinutes) ? 'dark' : 'light'
}

function getNextScheduleCheck(preferences: ThemePreferences, now: Date): number | null {
  if (preferences.autoMode !== 'schedule') return null
  const startMinutes = parseTimeToMinutes(preferences.schedule.start)
  const endMinutes = parseTimeToMinutes(preferences.schedule.end)
  if (startMinutes === null || endMinutes === null) return null
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const minutesUntil = (target: number) => (target - nowMinutes + 24 * 60) % (24 * 60)
  const untilStart = minutesUntil(startMinutes)
  const untilEnd = minutesUntil(endMinutes)
  const nextMinutes = Math.min(untilStart || 24 * 60, untilEnd || 24 * 60)
  return nextMinutes * 60 * 1000
}

export function ThemeProvider({ children, defaultTheme = 'light' }: ThemeProviderProps) {
  const [preferences, setPreferences] = useState<ThemePreferences>(() =>
    parseStoredPreferences(localStorage.getItem(STORAGE_KEY), defaultTheme)
  )
  const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
    window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : false
  )
  const [scheduleTick, setScheduleTick] = useState(0)
  const scheduleTimeoutRef = useRef<number | null>(null)
  const resolvedTheme = useMemo(() => {
    void scheduleTick
    return resolveTheme(preferences, systemPrefersDark, new Date())
  }, [preferences, systemPrefersDark, scheduleTick])

  useEffect(() => {
    if (!window.matchMedia) return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemPrefersDark(event.matches)
    }
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  }, [preferences])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    if (scheduleTimeoutRef.current) {
      window.clearTimeout(scheduleTimeoutRef.current)
      scheduleTimeoutRef.current = null
    }
    if (preferences.mode !== 'auto' || preferences.autoMode !== 'schedule') {
      return
    }
    const delay = getNextScheduleCheck(preferences, new Date())
    if (delay === null) return
    scheduleTimeoutRef.current = window.setTimeout(() => {
      setScheduleTick((prev) => prev + 1)
    }, delay)
    return () => {
      if (scheduleTimeoutRef.current) {
        window.clearTimeout(scheduleTimeoutRef.current)
        scheduleTimeoutRef.current = null
      }
    }
  }, [preferences, systemPrefersDark])

  const setMode = (mode: ThemeMode) => {
    setPreferences((prev) => ({ ...prev, mode }))
  }

  const setAutoMode = (autoMode: AutoThemeMode) => {
    setPreferences((prev) => ({ ...prev, autoMode }))
  }

  const setSchedule = (schedule: ThemeSchedule) => {
    setPreferences((prev) => ({ ...prev, schedule }))
  }

  const toggleTheme = () => {
    setPreferences((prev) => {
      const nextMode: ThemeMode =
        prev.mode === 'light' ? 'dark' : prev.mode === 'dark' ? 'auto' : 'light'
      return { ...prev, mode: nextMode }
    })
  }

  const value = useMemo(
    () => ({
      theme: resolvedTheme,
      mode: preferences.mode,
      autoMode: preferences.autoMode,
      schedule: preferences.schedule,
      setMode,
      setAutoMode,
      setSchedule,
      toggleTheme,
    }),
    [resolvedTheme, preferences]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
