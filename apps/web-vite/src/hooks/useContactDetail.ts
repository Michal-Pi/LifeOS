/**
 * useContactDetail Hook
 *
 * Real-time subscription for a single contact and its interaction history.
 */

import { useState, useEffect, useCallback } from 'react'
import { doc, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { useAuth } from '@/hooks/useAuth'
import {
  createFirestoreContactRepository,
  createFirestoreInteractionRepository,
} from '@/adapters/contacts/firestoreContactRepository'
import type {
  Contact,
  ContactId,
  UpdateContactInput,
  Interaction,
  CreateInteractionInput,
  InteractionType,
} from '@lifeos/agents'
import { updateContactUsecase, recordInteractionUsecase } from '@lifeos/agents'

interface UseContactDetailOptions {
  contactId: ContactId | null
  interactionLimit?: number
  interactionType?: InteractionType
}

interface UseContactDetailResult {
  contact: Contact | null
  interactions: Interaction[]
  loading: boolean
  error: string | null

  updateContact: (updates: UpdateContactInput) => Promise<Contact>
  recordInteraction: (
    input: Omit<CreateInteractionInput, 'contactId' | 'userId'>
  ) => Promise<Interaction>
}

const contactRepo = createFirestoreContactRepository()
const interactionRepo = createFirestoreInteractionRepository()

export function useContactDetail(options: UseContactDetailOptions): UseContactDetailResult {
  const { contactId, interactionLimit = 50, interactionType } = options

  const { user } = useAuth()
  const [contact, setContact] = useState<Contact | null>(null)
  const [interactions, setInteractions] = useState<Interaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Subscribe to contact document
  useEffect(() => {
    if (!user?.uid || !contactId) return

    let unsubscribe: Unsubscribe | undefined

    const setup = async () => {
      try {
        const db = await getDb()
        const contactDoc = doc(db, `users/${user.uid}/contacts/${contactId}`)

        unsubscribe = onSnapshot(
          contactDoc,
          (snapshot) => {
            if (snapshot.exists()) {
              setContact(snapshot.data() as Contact)
            } else {
              setContact(null)
            }
            setLoading(false)
          },
          (err) => {
            console.error('Error subscribing to contact:', err)
            setError(err.message)
            setLoading(false)
          }
        )
      } catch (err) {
        console.error('Error setting up contact subscription:', err)
        setError((err as Error).message)
        setLoading(false)
      }
    }

    void setup()

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [user?.uid, contactId])

  // Load interactions
  useEffect(() => {
    if (!user?.uid || !contactId) return

    const loadInteractions = async () => {
      try {
        const result = await interactionRepo.list(user.uid, contactId, {
          limit: interactionLimit,
          type: interactionType,
        })
        setInteractions(result)
      } catch (err) {
        console.error('Error loading interactions:', err)
      }
    }

    void loadInteractions()
  }, [user?.uid, contactId, interactionLimit, interactionType])

  const updateContact = useCallback(
    async (updates: UpdateContactInput): Promise<Contact> => {
      if (!user?.uid || !contactId) throw new Error('User not authenticated or no contact selected')
      return await updateContactUsecase(contactRepo)(user.uid, contactId, updates)
    },
    [user, contactId]
  )

  const recordInteraction = useCallback(
    async (input: Omit<CreateInteractionInput, 'contactId' | 'userId'>): Promise<Interaction> => {
      if (!user?.uid || !contactId) throw new Error('User not authenticated or no contact selected')
      const fullInput: CreateInteractionInput = {
        ...input,
        contactId,
        userId: user.uid,
      }
      const interaction = await recordInteractionUsecase(contactRepo, interactionRepo)(
        user.uid,
        fullInput
      )

      // Refresh interactions
      const updated = await interactionRepo.list(user.uid, contactId, {
        limit: interactionLimit,
        type: interactionType,
      })
      setInteractions(updated)

      return interaction
    },
    [user, contactId, interactionLimit, interactionType]
  )

  return {
    contact,
    interactions,
    loading,
    error,
    updateContact,
    recordInteraction,
  }
}
