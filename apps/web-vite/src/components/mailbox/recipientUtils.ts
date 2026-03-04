import type { Recipient } from '@lifeos/agents'

/**
 * Format a recipient list into a compact comma-separated summary.
 * Prefers display name, falls back to email, then id.
 * Truncates with "+N more" when exceeding maxVisible.
 */
export function formatRecipientSummary(recipients: Recipient[], maxVisible = 3): string {
  if (recipients.length === 0) return 'No recipients'

  const names = recipients.map((r) => {
    if (r.name && r.name !== r.id) return r.name
    if (r.email) return r.email
    return r.id
  })

  if (names.length <= maxVisible) {
    return names.join(', ')
  }

  return `${names.slice(0, maxVisible).join(', ')} +${names.length - maxVisible} more`
}
