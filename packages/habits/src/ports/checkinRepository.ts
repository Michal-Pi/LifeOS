import type {
  CanonicalHabitCheckin,
  CheckinId,
  HabitId,
  CreateCheckinInput,
  UpdateCheckinInput,
} from '../domain/models'

export interface CheckinRepository {
  upsert(userId: string, input: CreateCheckinInput): Promise<CanonicalHabitCheckin>
  update(
    userId: string,
    checkinId: CheckinId,
    updates: UpdateCheckinInput
  ): Promise<CanonicalHabitCheckin>
  delete(userId: string, checkinId: CheckinId): Promise<void>
  get(userId: string, checkinId: CheckinId): Promise<CanonicalHabitCheckin | null>
  getByHabitAndDate(
    userId: string,
    habitId: HabitId,
    dateKey: string
  ): Promise<CanonicalHabitCheckin | null>
  listForDate(userId: string, dateKey: string): Promise<CanonicalHabitCheckin[]>
  listForHabit(
    userId: string,
    habitId: HabitId,
    options?: { limit?: number; startDate?: string; endDate?: string }
  ): Promise<CanonicalHabitCheckin[]>
  listForDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<CanonicalHabitCheckin[]>
}
