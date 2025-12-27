import type {
  CanonicalIncantation,
  IncantationId,
  CreateIncantationInput,
  UpdateIncantationInput,
  HabitDomain,
} from '../domain/models'

export interface IncantationRepository {
  create(userId: string, input: CreateIncantationInput): Promise<CanonicalIncantation>
  update(
    userId: string,
    incantationId: IncantationId,
    updates: UpdateIncantationInput
  ): Promise<CanonicalIncantation>
  delete(userId: string, incantationId: IncantationId): Promise<void>
  get(userId: string, incantationId: IncantationId): Promise<CanonicalIncantation | null>
  list(
    userId: string,
    options?: { activeOnly?: boolean; domain?: HabitDomain }
  ): Promise<CanonicalIncantation[]>
}
