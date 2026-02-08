/**
 * Knowledge Graph Explorer Utilities
 *
 * Helper functions for the knowledge graph visualization.
 */

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength - 3) + '...'
}

/**
 * Format a timestamp (in milliseconds) for display
 */
export function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString()
}

/**
 * Capitalize the first letter of a string
 */
export function capitalize(str: string): string {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Format a percentage value (0-1) for display
 */
export function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(0)}%`
}

/**
 * Replace underscores with spaces in a string
 */
export function formatEdgeLabel(type: string): string {
  return type.replace(/_/g, ' ')
}
