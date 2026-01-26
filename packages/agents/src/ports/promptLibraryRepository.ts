import type {
  PromptTemplate,
  PromptTemplateId,
  CreatePromptTemplateInput,
  UpdatePromptTemplateInput,
  PromptType,
  PromptCategory,
} from '../domain/promptLibrary'

export interface PromptLibraryRepository {
  create(userId: string, input: CreatePromptTemplateInput): Promise<PromptTemplate>
  get(userId: string, templateId: PromptTemplateId): Promise<PromptTemplate | null>
  list(
    userId: string,
    filters?: {
      type?: PromptType
      category?: PromptCategory
      tags?: string[]
    }
  ): Promise<PromptTemplate[]>
  update(
    userId: string,
    templateId: PromptTemplateId,
    updates: UpdatePromptTemplateInput
  ): Promise<PromptTemplate>
  delete(userId: string, templateId: PromptTemplateId): Promise<void>
  getVersion(
    userId: string,
    templateId: PromptTemplateId,
    version: number
  ): Promise<PromptTemplate | null>
  restoreVersion(
    userId: string,
    templateId: PromptTemplateId,
    version: number
  ): Promise<PromptTemplate>
  incrementUsage(userId: string, templateId: PromptTemplateId): Promise<void>
  getUsageStats(userId: string): Promise<
    Array<{
      templateId: PromptTemplateId
      name: string
      usageCount: number
    }>
  >
}
