/**
 * Firestore Contact Repository
 *
 * Implements ContactRepository and InteractionRepository using Firebase client SDK.
 * Path: users/{userId}/contacts/{contactId}
 * Interactions: users/{userId}/contacts/{contactId}/interactions/{interactionId}
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { newId } from '@lifeos/core'
import type {
  ContactRepository,
  InteractionRepository,
  Contact,
  ContactId,
  CreateContactInput,
  UpdateContactInput,
  DunbarCircle,
  Interaction,
  InteractionId,
  CreateInteractionInput,
  InteractionType,
} from '@lifeos/agents'
import { normalizeEmail } from '@lifeos/agents'

export const createFirestoreContactRepository = (): ContactRepository => {
  return {
    async create(userId: string, input: CreateContactInput): Promise<Contact> {
      const db = await getDb()
      const contactId = newId('contact')

      const contact: Contact = {
        ...input,
        contactId,
        userId,
        archived: false,
        starred: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      }

      const contactDoc = doc(db, `users/${userId}/contacts/${contactId}`)
      await setDoc(contactDoc, contact)

      return contact
    },

    async update(
      userId: string,
      contactId: ContactId,
      updates: UpdateContactInput
    ): Promise<Contact> {
      const db = await getDb()
      const contactDoc = doc(db, `users/${userId}/contacts/${contactId}`)
      const existing = await getDoc(contactDoc)

      if (!existing.exists()) {
        throw new Error(`Contact ${contactId} not found`)
      }

      const updated: Contact = {
        ...(existing.data() as Contact),
        ...updates,
        updatedAtMs: Date.now(),
      }

      await setDoc(contactDoc, updated)
      return updated
    },

    async get(userId: string, contactId: ContactId): Promise<Contact | null> {
      const db = await getDb()
      const contactDoc = doc(db, `users/${userId}/contacts/${contactId}`)
      const snapshot = await getDoc(contactDoc)

      if (!snapshot.exists()) return null
      return snapshot.data() as Contact
    },

    async list(
      userId: string,
      options?: {
        circle?: DunbarCircle
        starred?: boolean
        archived?: boolean
        search?: string
        limit?: number
        orderBy?: 'lastInteractionMs' | 'nextFollowUpMs' | 'displayName' | 'createdAtMs'
      }
    ): Promise<Contact[]> {
      const db = await getDb()
      const contactsCol = collection(db, `users/${userId}/contacts`)

      const constraints = []

      if (options?.archived !== undefined) {
        constraints.push(where('archived', '==', options.archived))
      }

      if (options?.circle !== undefined) {
        constraints.push(where('circle', '==', options.circle))
      }

      if (options?.starred !== undefined) {
        constraints.push(where('starred', '==', options.starred))
      }

      // Default sort by displayName
      const sortField = options?.orderBy ?? 'displayName'
      const sortDir = sortField === 'displayName' ? 'asc' : 'desc'
      constraints.push(orderBy(sortField, sortDir as 'asc' | 'desc'))

      if (options?.limit) {
        constraints.push(firestoreLimit(options.limit))
      }

      const q = query(contactsCol, ...constraints)
      const snapshot = await getDocs(q)
      let contacts = snapshot.docs.map((d) => d.data() as Contact)

      // Client-side search filter (Firestore doesn't support full-text search)
      if (options?.search) {
        const term = options.search.toLowerCase()
        contacts = contacts.filter(
          (c) =>
            c.displayName.toLowerCase().includes(term) ||
            c.company?.toLowerCase().includes(term) ||
            c.title?.toLowerCase().includes(term) ||
            c.identifiers.emails.some((e) => e.toLowerCase().includes(term)) ||
            c.tags.some((t) => t.toLowerCase().includes(term))
        )
      }

      return contacts
    },

    async delete(userId: string, contactId: ContactId): Promise<void> {
      const db = await getDb()
      const contactDoc = doc(db, `users/${userId}/contacts/${contactId}`)
      await deleteDoc(contactDoc)
    },

    async findByEmail(userId: string, email: string): Promise<Contact | null> {
      const db = await getDb()
      const normalized = normalizeEmail(email)
      const contactsCol = collection(db, `users/${userId}/contacts`)
      const q = query(
        contactsCol,
        where('identifiers.emails', 'array-contains', normalized),
        firestoreLimit(1)
      )
      const snapshot = await getDocs(q)

      if (snapshot.empty) return null
      return snapshot.docs[0].data() as Contact
    },

    async getFollowUpDue(userId: string, beforeMs: number, limit?: number): Promise<Contact[]> {
      const db = await getDb()
      const contactsCol = collection(db, `users/${userId}/contacts`)

      const constraints = [
        where('archived', '==', false),
        where('nextFollowUpMs', '<=', beforeMs),
        orderBy('nextFollowUpMs', 'asc'),
        orderBy('significance', 'asc'),
      ]

      if (limit) {
        constraints.push(firestoreLimit(limit))
      }

      const q = query(contactsCol, ...constraints)
      const snapshot = await getDocs(q)

      return snapshot.docs.map((d) => d.data() as Contact)
    },
  }
}

export const createFirestoreInteractionRepository = (): InteractionRepository => {
  return {
    async create(userId: string, input: CreateInteractionInput): Promise<Interaction> {
      const db = await getDb()
      const interactionId = newId('interaction')

      const interaction: Interaction = {
        ...input,
        interactionId,
        createdAtMs: Date.now(),
      }

      const interactionDoc = doc(
        db,
        `users/${userId}/contacts/${input.contactId}/interactions/${interactionId}`
      )
      await setDoc(interactionDoc, interaction)

      return interaction
    },

    async list(
      userId: string,
      contactId: ContactId,
      options?: {
        limit?: number
        type?: InteractionType
      }
    ): Promise<Interaction[]> {
      const db = await getDb()
      const interactionsCol = collection(db, `users/${userId}/contacts/${contactId}/interactions`)

      const constraints = [orderBy('occurredAtMs', 'desc')]

      if (options?.type) {
        constraints.unshift(where('type', '==', options.type))
      }

      if (options?.limit) {
        constraints.push(firestoreLimit(options.limit))
      }

      const q = query(interactionsCol, ...constraints)
      const snapshot = await getDocs(q)

      return snapshot.docs.map((d) => d.data() as Interaction)
    },

    async delete(
      userId: string,
      contactId: ContactId,
      interactionId: InteractionId
    ): Promise<void> {
      const db = await getDb()
      const interactionDoc = doc(
        db,
        `users/${userId}/contacts/${contactId}/interactions/${interactionId}`
      )
      await deleteDoc(interactionDoc)
    },
  }
}
