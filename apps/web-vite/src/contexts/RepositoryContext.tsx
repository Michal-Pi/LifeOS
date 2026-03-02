/**
 * RepositoryContext — centralises repository instantiation so every hook
 * shares the same singleton instances via React context instead of
 * module-scope variables.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { createFirestoreCheckInRepository } from '@/adapters/firestoreCheckInRepository'
import { createFirestoreContactRepository } from '@/adapters/contacts/firestoreContactRepository'
import { createFirestoreTodoRepository } from '@/adapters/firestoreTodoRepository'
import { createFirestoreQuoteRepository } from '@/adapters/firestoreQuoteRepository'
import { createFirestoreCalendarEventRepository } from '@/adapters/firestoreCalendarEventRepository'
import { createIndexedDbWorkoutPlanRepository } from '@/adapters/training/indexedDbWorkoutPlanRepository'
import { createIndexedDbWorkoutTemplateRepository } from '@/adapters/training/indexedDbWorkoutTemplateRepository'
import { createIndexedDbWorkoutSessionRepository } from '@/adapters/training/indexedDbWorkoutSessionRepository'

export interface Repositories {
  checkInRepository: ReturnType<typeof createFirestoreCheckInRepository>
  contactRepository: ReturnType<typeof createFirestoreContactRepository>
  todoRepository: ReturnType<typeof createFirestoreTodoRepository>
  quoteRepository: ReturnType<typeof createFirestoreQuoteRepository>
  calendarRepository: ReturnType<typeof createFirestoreCalendarEventRepository>
  planRepository: ReturnType<typeof createIndexedDbWorkoutPlanRepository>
  templateRepository: ReturnType<typeof createIndexedDbWorkoutTemplateRepository>
  sessionRepository: ReturnType<typeof createIndexedDbWorkoutSessionRepository>
}

const RepositoryContext = createContext<Repositories | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useRepositories(): Repositories {
  const ctx = useContext(RepositoryContext)
  if (!ctx) throw new Error('useRepositories must be used within RepositoryProvider')
  return ctx
}

export function RepositoryProvider({ children }: { children: ReactNode }) {
  const repositories = useMemo<Repositories>(
    () => ({
      checkInRepository: createFirestoreCheckInRepository(),
      contactRepository: createFirestoreContactRepository(),
      todoRepository: createFirestoreTodoRepository(),
      quoteRepository: createFirestoreQuoteRepository(),
      calendarRepository: createFirestoreCalendarEventRepository(),
      planRepository: createIndexedDbWorkoutPlanRepository(),
      templateRepository: createIndexedDbWorkoutTemplateRepository(),
      sessionRepository: createIndexedDbWorkoutSessionRepository(),
    }),
    []
  )

  return <RepositoryContext.Provider value={repositories}>{children}</RepositoryContext.Provider>
}
