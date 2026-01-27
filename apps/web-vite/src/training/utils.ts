/**
 * @deprecated Do not use for sync logic. Only use for UI indicators.
 * Network status should not block operations or sync attempts.
 * The offline-first architecture handles network errors gracefully.
 */
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

export function getDayOfWeekFromDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part))
  return new Date(year, month - 1, day).getDay()
}
