import type { CanonicalCalendar } from '@lifeos/calendar'

const DEFAULT_CALENDAR_COLOR_VAR = '--accent'
export const DEFAULT_CALENDAR_FALLBACK = '#0313a6'

function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  }

  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/)
  if (!rgbMatch) return null

  const parts = rgbMatch[1].split(',').map((part) => parseFloat(part.trim()))
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null

  const [r, g, b] = parts
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
  const toHex = (value: number) => clamp(value).toString(16).padStart(2, '0')

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function getCssVarValue(varName: string): string | null {
  if (typeof window === 'undefined') return null
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return value || null
}

function getDefaultCalendarColor(): string {
  return getCssVarValue(DEFAULT_CALENDAR_COLOR_VAR) ?? `var(${DEFAULT_CALENDAR_COLOR_VAR})`
}

function adjustColor(hex: string, percent: number): string {
  const color = hex.replace('#', '')
  const r = parseInt(color.substring(0, 2), 16)
  const g = parseInt(color.substring(2, 4), 16)
  const b = parseInt(color.substring(4, 6), 16)

  const adjust = (c: number) => {
    let adjusted: number
    if (percent > 0) {
      adjusted = Math.round(c + ((255 - c) * percent) / 100)
    } else {
      adjusted = Math.round(c * (1 + percent / 100))
    }
    return Math.min(255, Math.max(0, adjusted))
  }

  const newR = adjust(r)
  const newG = adjust(g)
  const newB = adjust(b)

  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(newR)}${toHex(newG)}${toHex(newB)}`
}

export function getDefaultCalendarHex(): string {
  const raw = getCssVarValue(DEFAULT_CALENDAR_COLOR_VAR)
  return normalizeHexColor(raw ?? DEFAULT_CALENDAR_FALLBACK) ?? DEFAULT_CALENDAR_FALLBACK
}

export function getCalendarColors(calendar: CanonicalCalendar | undefined) {
  const baseColor = calendar?.lifeosColor ?? calendar?.color ?? getDefaultCalendarColor()
  const normalized =
    normalizeHexColor(baseColor) ??
    normalizeHexColor(getDefaultCalendarColor()) ??
    getDefaultCalendarHex()

  if (!normalized) {
    return {
      light: baseColor,
      normal: baseColor,
      dark: baseColor,
    }
  }

  return {
    light: adjustColor(normalized, 40),
    normal: normalized,
    dark: adjustColor(normalized, -20),
  }
}
