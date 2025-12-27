import { randomUUID } from 'node:crypto'
import { firestore } from '../lib/firebase.js'
import { fetchCalendarList, normalizeGoogleCalendar } from './calendarApi.js'
import { accountRef, privateAccountRef, calendarRef } from './paths.js'

export interface SyncResult {
  ok: boolean
  created?: string
  reason?: string
  calendarsUpdated?: number
}

/**
 * Sync calendars from Google Calendar API to Firestore
 * Called as part of account sync to keep permissions up to date
 */
export async function syncGoogleCalendars(uid: string, accountId: string): Promise<number> {
  const calendars = await fetchCalendarList(uid, accountId)
  const now = new Date().toISOString()
  let updated = 0

  for (const entry of calendars) {
    const normalized = normalizeGoogleCalendar(entry, accountId)
    const calRef = calendarRef(uid, normalized.calendarId)
    const existingSnap = await calRef.get()
    const existing = existingSnap.exists ? (existingSnap.data() as Record<string, unknown>) : {}

    const syncEnabled = (existing.syncEnabled as boolean | undefined) ?? true
    const writebackEnabled =
      (existing.writebackEnabled as boolean | undefined) ?? normalized.canWrite
    const writebackVisibility =
      (existing.writebackVisibility as 'default' | 'private' | undefined) ?? 'default'
    const lifeosColor = (existing.lifeosColor as string | undefined) ?? normalized.color

    await calRef.set(
      {
        calendarId: normalized.calendarId,
        name: normalized.name,
        description: normalized.description,
        owner: normalized.isPrimary ? { email: entry.id, self: true } : undefined,
        accessRole: normalized.accessRole,
        canWrite: normalized.canWrite,
        isPrimary: normalized.isPrimary,
        color: normalized.color,
        foregroundColor: normalized.foregroundColor,
        timeZone: normalized.timeZone,
        providerMeta: normalized.providerMeta,
        visible: (existing.visible as boolean | undefined) ?? normalized.visible,
        selected: (existing.selected as boolean | undefined) ?? normalized.selected,
        syncEnabled,
        writebackEnabled,
        writebackVisibility,
        lifeosColor,
        updatedAt: now,
        createdAt: (existing.createdAt as string | undefined) ?? now,
      },
      { merge: true }
    )
    updated++
  }

  console.log(`[syncGoogleCalendars] Updated ${updated} calendars for user ${uid}`)
  return updated
}

export async function syncGoogleAccount(uid: string, accountId: string): Promise<SyncResult> {
  const tokenDoc = await privateAccountRef(uid, accountId).get()
  if (!tokenDoc.exists) {
    return { ok: false, reason: 'missing tokens' }
  }

  // Phase 2.6: Sync calendars first to update permissions
  let calendarsUpdated = 0
  try {
    calendarsUpdated = await syncGoogleCalendars(uid, accountId)
  } catch (error) {
    console.error('[syncGoogleAccount] Failed to sync calendars:', error)
    // Continue with event sync even if calendar sync fails
  }

  const eventId = `google:${accountId}:primary:${randomUUID()}`
  const canonicalRef = firestore.doc(`users/${uid}/calendarEvents/${eventId}`)
  await canonicalRef.set({
    canonicalEventId: eventId,
    schemaVersion: 1,
    normalizationVersion: 1,
    providerRef: {
      provider: 'google',
      accountId,
      providerCalendarId: 'primary',
      providerEventId: randomUUID(),
    },
    // Phase 2.6: Add calendarId reference
    calendarId: `google:${accountId}:primary`,
    title: 'Synced focus block',
    startMs: Date.now(),
    endMs: Date.now() + 45 * 60 * 1000,
    startIso: new Date().toISOString(),
    endIso: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    timezone: 'UTC',
    occursOn: [new Date().toISOString().slice(0, 10)],
    // Phase 2.6: Add sync metadata
    canonicalUpdatedAtMs: Date.now(),
    syncState: 'synced',
    source: { type: 'provider' },
  })

  await accountRef(uid, accountId).set(
    {
      lastSyncAt: new Date().toISOString(),
      lastSuccessAt: new Date().toISOString(),
      status: 'connected',
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  )

  return { ok: true, created: eventId, calendarsUpdated }
}
