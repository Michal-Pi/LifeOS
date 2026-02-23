/**
 * Contact Usecases
 *
 * Pure business logic for contact and interaction operations.
 * Independent of UI framework and data layer.
 */

import type { ContactRepository, InteractionRepository } from '../ports/contactRepository'
import type {
  Contact,
  ContactId,
  CreateContactInput,
  UpdateContactInput,
  Interaction,
  CreateInteractionInput,
  DunbarCircle,
} from '../domain/contacts'
import { computeNextFollowUp, CIRCLE_TO_SIGNIFICANCE } from '../domain/contacts'

/**
 * Create a new contact
 */
export function createContactUsecase(contactRepo: ContactRepository) {
  return async (userId: string, input: CreateContactInput): Promise<Contact> => {
    if (!input.displayName.trim()) {
      throw new Error('Contact name is required')
    }

    // Ensure significance matches circle
    const withDefaults: CreateContactInput = {
      ...input,
      significance: CIRCLE_TO_SIGNIFICANCE[input.circle],
      tags: input.tags ?? [],
      sources: input.sources ?? ['manual'],
      identifiers: input.identifiers ?? { emails: [], phones: [] },
    }

    return await contactRepo.create(userId, withDefaults)
  }
}

/**
 * Update a contact
 */
export function updateContactUsecase(contactRepo: ContactRepository) {
  return async (
    userId: string,
    contactId: ContactId,
    updates: UpdateContactInput
  ): Promise<Contact> => {
    // If circle changed, update significance to match
    if (updates.circle !== undefined) {
      updates.significance = CIRCLE_TO_SIGNIFICANCE[updates.circle]

      // Recompute next follow-up based on new circle cadence
      const existing = await contactRepo.get(userId, contactId)
      if (existing?.lastInteractionMs) {
        const updatedContact = { ...existing, ...updates } as Contact
        updates.nextFollowUpMs = computeNextFollowUp(updatedContact, existing.lastInteractionMs)
      }
    }

    return await contactRepo.update(userId, contactId, updates)
  }
}

/**
 * Get a single contact
 */
export function getContactUsecase(contactRepo: ContactRepository) {
  return async (userId: string, contactId: ContactId): Promise<Contact | null> => {
    return await contactRepo.get(userId, contactId)
  }
}

/**
 * List contacts with optional filtering
 */
export function listContactsUsecase(contactRepo: ContactRepository) {
  return async (
    userId: string,
    options?: {
      circle?: DunbarCircle
      starred?: boolean
      archived?: boolean
      search?: string
      limit?: number
      orderBy?: 'lastInteractionMs' | 'nextFollowUpMs' | 'displayName' | 'createdAtMs'
    }
  ): Promise<Contact[]> => {
    return await contactRepo.list(userId, { archived: false, ...options })
  }
}

/**
 * Delete a contact
 */
export function deleteContactUsecase(contactRepo: ContactRepository) {
  return async (userId: string, contactId: ContactId): Promise<void> => {
    await contactRepo.delete(userId, contactId)
  }
}

/**
 * Record an interaction and update the contact's follow-up tracking
 */
export function recordInteractionUsecase(
  contactRepo: ContactRepository,
  interactionRepo: InteractionRepository
) {
  return async (userId: string, input: CreateInteractionInput): Promise<Interaction> => {
    // Create the interaction
    const interaction = await interactionRepo.create(userId, input)

    // Update the contact's tracking fields
    const contact = await contactRepo.get(userId, input.contactId)
    if (contact) {
      const nextFollowUpMs = computeNextFollowUp(contact, input.occurredAtMs)
      await contactRepo.update(userId, input.contactId, {
        lastInteractionMs: input.occurredAtMs,
        nextFollowUpMs,
      })
    }

    return interaction
  }
}

/**
 * Find an existing contact by email, or create a new one if not found
 */
export function findOrCreateContactByEmailUsecase(contactRepo: ContactRepository) {
  return async (
    userId: string,
    email: string,
    defaults: Partial<CreateContactInput>
  ): Promise<Contact> => {
    const existing = await contactRepo.findByEmail(userId, email)
    if (existing) return existing

    const input: CreateContactInput = {
      displayName: defaults.displayName ?? email,
      circle: (defaults.circle ?? 4) as DunbarCircle,
      significance: CIRCLE_TO_SIGNIFICANCE[(defaults.circle ?? 4) as DunbarCircle],
      identifiers: {
        emails: [email],
        phones: [],
        ...defaults.identifiers,
      },
      tags: defaults.tags ?? [],
      sources: defaults.sources ?? ['manual'],
      ...defaults,
    }

    return await contactRepo.create(userId, input)
  }
}

/**
 * Get contacts with overdue or upcoming follow-ups
 */
export function getFollowUpsDueUsecase(contactRepo: ContactRepository) {
  return async (userId: string, beforeMs: number, limit?: number): Promise<Contact[]> => {
    return await contactRepo.getFollowUpDue(userId, beforeMs, limit)
  }
}
