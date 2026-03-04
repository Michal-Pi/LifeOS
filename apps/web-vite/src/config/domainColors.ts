/**
 * Domain Color Configuration
 * Defines default colors for each domain and provides color management utilities
 */

import type { Domain } from '@/types/todo'

export interface DomainColorConfig {
  domain: Domain
  defaultColor: string
  label: string
}

// Default color palette for domains
export const DOMAIN_COLORS: Record<Domain, DomainColorConfig> = {
  work: {
    domain: 'work',
    defaultColor: '#3b82f6', // Blue
    label: 'Work',
  },
  projects: {
    domain: 'projects',
    defaultColor: '#06b6d4', // Cyan
    label: 'Projects',
  },
  life: {
    domain: 'life',
    defaultColor: '#10b981', // Green
    label: 'Life',
  },
  learning: {
    domain: 'learning',
    defaultColor: '#f59e0b', // Orange
    label: 'Learning',
  },
  wellbeing: {
    domain: 'wellbeing',
    defaultColor: '#ec4899', // Pink
    label: 'Wellbeing',
  },
}

// Predefined color palette for projects
export const PROJECT_COLOR_PALETTE = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#eab308', // Yellow
  '#84cc16', // Lime
  '#10b981', // Green
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#a855f7', // Purple (alt)
  '#ec4899', // Pink
  '#f43f5e', // Rose
  '#64748b', // Slate
]

/**
 * Get the color for a domain (with custom override support)
 */
export function getDomainColor(domain: Domain, customColor?: string): string {
  return customColor || DOMAIN_COLORS[domain].defaultColor
}

/**
 * Get the color for a project (falls back to domain color if no project color set)
 */
export function getProjectColor(
  projectColor: string | undefined,
  domain: Domain,
  domainCustomColor?: string
): string {
  if (projectColor) return projectColor
  return getDomainColor(domain, domainCustomColor)
}

/**
 * Convert hex color to RGB with alpha for backgrounds
 */
export function hexToRgba(hex: string, alpha: number = 0.1): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
