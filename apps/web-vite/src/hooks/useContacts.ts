/**
 * useContacts Hook
 *
 * Real-time Firestore subscription to the contacts collection.
 * Provides CRUD operations and filtering by circle, search, starred, etc.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { useAuth } from '@/hooks/useAuth'
import {
  createFirestoreContactRepository,
  createFirestoreInteractionRepository,
} from '@/adapters/contacts/firestoreContactRepository'
import type {
  Contact,
  ContactId,
  CreateContactInput,
  UpdateContactInput,
  DunbarCircle,
  CreateInteractionInput,
  Interaction,
} from '@lifeos/agents'
import {
  createContactUsecase,
  updateContactUsecase,
  deleteContactUsecase,
  recordInteractionUsecase,
} from '@lifeos/agents'

interface UseContactsOptions {
  circle?: DunbarCircle
  starred?: boolean
  search?: string
  maxContacts?: number
  orderBy?: 'lastInteractionMs' | 'nextFollowUpMs' | 'displayName' | 'createdAtMs'
}

interface UseContactsResult {
  contacts: Contact[]
  loading: boolean
  error: string | null

  createContact: (input: CreateContactInput) => Promise<Contact>
  updateContact: (contactId: ContactId, updates: UpdateContactInput) => Promise<Contact>
  deleteContact: (contactId: ContactId) => Promise<void>
  recordInteraction: (input: CreateInteractionInput) => Promise<Interaction>
}

const contactRepo = createFirestoreContactRepository()
const interactionRepo = createFirestoreInteractionRepository()

export function useContacts(options: UseContactsOptions = {}): UseContactsResult {
  const { circle, starred, search, maxContacts = 200, orderBy: sortBy = 'displayName' } = options

  const { user } = useAuth()
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Real-time subscription
  useEffect(() => {
    if (!user?.uid) return

    let unsubscribe: Unsubscribe | undefined

    const setupSubscription = async () => {
      try {
        const db = await getDb()
        const contactsCol = collection(db, `users/${user.uid}/contacts`)

        const constraints = [where('archived', '==', false)]

        if (circle !== undefined) {
          constraints.push(where('circle', '==', circle))
        }

        if (starred !== undefined) {
          constraints.push(where('starred', '==', starred))
        }

        const sortDir = sortBy === 'displayName' ? 'asc' : 'desc'
        constraints.push(orderBy(sortBy, sortDir as 'asc' | 'desc'))
        constraints.push(firestoreLimit(maxContacts))

        const q = query(contactsCol, ...constraints)

        unsubscribe = onSnapshot(
          q,
          (snapshot) => {
            let data = snapshot.docs.map((d) => d.data() as Contact)

            // Client-side search filter
            if (search) {
              const term = search.toLowerCase()
              data = data.filter(
                (c) =>
                  c.displayName.toLowerCase().includes(term) ||
                  c.company?.toLowerCase().includes(term) ||
                  c.title?.toLowerCase().includes(term) ||
                  c.identifiers.emails.some((e) => e.toLowerCase().includes(term)) ||
                  c.tags.some((t) => t.toLowerCase().includes(term))
              )
            }

            setContacts(data)
            setLoading(false)
          },
          (err) => {
            console.error('Error subscribing to contacts:', err)
            setError(err.message)
            setLoading(false)
          }
        )
      } catch (err) {
        console.error('Error setting up contacts subscription:', err)
        setError((err as Error).message)
        setLoading(false)
      }
    }

    void setupSubscription()

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [user?.uid, circle, starred, search, maxContacts, sortBy])

  // CRUD actions
  const createContact = useCallback(
    async (input: CreateContactInput): Promise<Contact> => {
      if (!user?.uid) throw new Error('User not authenticated')
      return await createContactUsecase(contactRepo)(user.uid, input)
    },
    [user]
  )

  const updateContact = useCallback(
    async (contactId: ContactId, updates: UpdateContactInput): Promise<Contact> => {
      if (!user?.uid) throw new Error('User not authenticated')
      return await updateContactUsecase(contactRepo)(user.uid, contactId, updates)
    },
    [user]
  )

  const deleteContact = useCallback(
    async (contactId: ContactId): Promise<void> => {
      if (!user?.uid) throw new Error('User not authenticated')
      return await deleteContactUsecase(contactRepo)(user.uid, contactId)
    },
    [user]
  )

  const recordInteraction = useCallback(
    async (input: CreateInteractionInput): Promise<Interaction> => {
      if (!user?.uid) throw new Error('User not authenticated')
      return await recordInteractionUsecase(contactRepo, interactionRepo)(user.uid, input)
    },
    [user]
  )

  return {
    contacts,
    loading,
    error,
    createContact,
    updateContact,
    deleteContact,
    recordInteraction,
  }
}
