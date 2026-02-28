/**
 * @fileoverview Firestore trigger handlers for managing the slug-to-user lookup index.
 *
 * When a scheduling link is created/updated/deleted, this keeps the
 * root-level /schedulingLinkSlugs/{slug} collection in sync.
 */

import { slugLookupRef } from './paths.js'
import { createLogger } from '../lib/logger.js'
import type { SchedulingLink, SlugLookup } from './types.js'

const log = createLogger('SlugManager')

/**
 * Handle scheduling link creation — create the slug lookup entry.
 */
export async function handleSchedulingLinkCreated(event: {
  data?: FirebaseFirestore.DocumentSnapshot
  params: Record<string, string>
}): Promise<void> {
  const snapshot = event.data
  if (!snapshot) return

  const link = snapshot.data() as SchedulingLink
  if (!link?.slug) return

  const userId = event.params.userId
  const linkId = event.params.linkId

  try {
    const lookup: SlugLookup = { userId, linkId }
    await slugLookupRef(link.slug).set(lookup)
    log.info(`Slug lookup created: ${link.slug} -> ${userId}/${linkId}`)
  } catch (error) {
    log.error(`Failed to create slug lookup for ${link.slug}`, error)
  }
}

/**
 * Handle scheduling link update — update slug lookup if slug changed.
 */
export async function handleSchedulingLinkUpdated(event: {
  data?: {
    before: FirebaseFirestore.DocumentSnapshot
    after: FirebaseFirestore.DocumentSnapshot
  }
  params: Record<string, string>
}): Promise<void> {
  if (!event.data) return

  const before = event.data.before.data() as SchedulingLink | undefined
  const after = event.data.after.data() as SchedulingLink | undefined

  if (!before || !after) return

  const userId = event.params.userId
  const linkId = event.params.linkId

  // If slug changed, update the lookup
  if (before.slug !== after.slug) {
    try {
      // Delete old slug lookup
      if (before.slug) {
        await slugLookupRef(before.slug).delete()
      }
      // Create new slug lookup
      if (after.slug) {
        const lookup: SlugLookup = { userId, linkId }
        await slugLookupRef(after.slug).set(lookup)
      }
      log.info(`Slug lookup updated: ${before.slug} -> ${after.slug}`)
    } catch (error) {
      log.error(`Failed to update slug lookup for ${after.slug}`, error)
    }
  }
}

/**
 * Handle scheduling link deletion — remove the slug lookup entry.
 */
export async function handleSchedulingLinkDeleted(event: {
  data?: FirebaseFirestore.DocumentSnapshot
  params: Record<string, string>
}): Promise<void> {
  const snapshot = event.data
  if (!snapshot) return

  const link = snapshot.data() as SchedulingLink | undefined
  if (!link?.slug) return

  try {
    await slugLookupRef(link.slug).delete()
    log.info(`Slug lookup deleted: ${link.slug}`)
  } catch (error) {
    log.error(`Failed to delete slug lookup for ${link.slug}`, error)
  }
}
