import type {
  CanonicalInterventionPreset,
  InterventionId,
  CreateInterventionInput,
  UpdateInterventionInput,
  InterventionType,
  FeelingState,
} from '../domain/models'

export interface InterventionRepository {
  create(userId: string, input: CreateInterventionInput): Promise<CanonicalInterventionPreset>
  update(
    userId: string,
    interventionId: InterventionId,
    updates: UpdateInterventionInput
  ): Promise<CanonicalInterventionPreset>
  delete(userId: string, interventionId: InterventionId): Promise<void>
  get(interventionId: InterventionId): Promise<CanonicalInterventionPreset | null>
  listUserPresets(userId: string): Promise<CanonicalInterventionPreset[]>
  listSystemPresets(): Promise<CanonicalInterventionPreset[]>
  listByType(type: InterventionType): Promise<CanonicalInterventionPreset[]>
  listByFeeling(feeling: FeelingState): Promise<CanonicalInterventionPreset[]>
}
