const FULL_SYNC_LOOKBACK_DAYS = 90

export function getFullSyncTimeMin(nowMs: number = Date.now()): string {
  const startMs = nowMs - FULL_SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  return new Date(startMs).toISOString()
}

export function isSyncTokenInvalid(error: unknown): boolean {
  if (!error) return false
  const err = error as { code?: string | number; message?: string }
  return err.code === 'SYNC_TOKEN_INVALID' || err.message === 'SYNC_TOKEN_INVALID'
}
