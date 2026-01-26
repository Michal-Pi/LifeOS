import type {
  WorkoutTemplate,
  TemplateId,
  CreateTemplateInput,
  UpdateTemplateInput,
  WorkoutContext,
} from '../domain/models'

export interface WorkoutTemplateRepository {
  create(userId: string, input: CreateTemplateInput): Promise<WorkoutTemplate>
  update(
    userId: string,
    templateId: TemplateId,
    updates: UpdateTemplateInput
  ): Promise<WorkoutTemplate>
  delete(userId: string, templateId: TemplateId): Promise<void>
  get(userId: string, templateId: TemplateId): Promise<WorkoutTemplate | null>
  list(userId: string, options?: { context?: WorkoutContext }): Promise<WorkoutTemplate[]>
  listByContext(userId: string, context: WorkoutContext): Promise<WorkoutTemplate[]>
}
