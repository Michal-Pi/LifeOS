import type { CanonicalHabit, HabitId, CreateHabitInput, UpdateHabitInput } from '../domain/models'

export interface HabitRepository {
  create(userId: string, input: CreateHabitInput): Promise<CanonicalHabit>
  update(userId: string, habitId: HabitId, updates: UpdateHabitInput): Promise<CanonicalHabit>
  delete(userId: string, habitId: HabitId): Promise<void>
  get(userId: string, habitId: HabitId): Promise<CanonicalHabit | null>
  list(
    userId: string,
    options?: { status?: 'active' | 'paused' | 'archived' }
  ): Promise<CanonicalHabit[]>
  listForDate(userId: string, dateKey: string): Promise<CanonicalHabit[]>
}
