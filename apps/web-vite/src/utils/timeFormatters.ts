/**
 * Time formatting utilities
 */

/**
 * Format a timestamp as a relative time string (e.g., "2 min ago")
 */
export function minutesAgo(iso?: string): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'moments ago'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} min ago`
  return `${Math.round(diff / 3_600_000)}h ago`
}
