import type { Id } from '@lifeos/core'

export type PromptTemplateId = Id<'promptTemplate'>
export type PromptVersionId = Id<'promptVersion'>

export type PromptType = 'agent' | 'tone-of-voice' | 'workflow' | 'tool' | 'synthesis'
export type PromptCategory =
  | 'project-management'
  | 'content-creation'
  | 'research'
  | 'review'
  | 'coordination'
  | 'general'

export interface PromptVariable {
  name: string
  description: string
  required: boolean
  defaultValue?: string
  exampleValue?: string
}

export interface PromptVersion {
  version: number
  content: string
  changeDescription: string
  createdAtMs: number
  createdBy: string
}

export interface PromptTemplate {
  templateId: PromptTemplateId
  userId: string
  name: string
  description: string
  type: PromptType
  category: PromptCategory
  tags: string[]
  content: string
  version: number
  variables: PromptVariable[]
  usageCount: number
  lastUsedAtMs?: number
  createdAtMs: number
  updatedAtMs: number
  versions?: PromptVersion[]
}

export interface PromptReference {
  type: 'shared' | 'custom'
  templateId?: PromptTemplateId
  customContent?: string
  variables?: Record<string, string>
}

export interface CreatePromptTemplateInput {
  name: string
  description: string
  type: PromptType
  category: PromptCategory
  tags?: string[]
  content: string
  variables?: PromptVariable[]
}

export interface UpdatePromptTemplateInput {
  name?: string
  description?: string
  category?: PromptCategory
  tags?: string[]
  content?: string
  variables?: PromptVariable[]
  changeDescription?: string
}
