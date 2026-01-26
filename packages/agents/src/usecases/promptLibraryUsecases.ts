import type { PromptLibraryRepository } from '../ports/promptLibraryRepository'
import type { PromptReference } from '../domain/promptLibrary'

export function createPromptLibraryUsecases(repository: PromptLibraryRepository) {
  return {
    async resolvePromptContent(
      userId: string,
      reference: PromptReference,
      runtimeVariables?: Record<string, string>
    ): Promise<string> {
      let content: string

      if (reference.type === 'shared' && reference.templateId) {
        const template = await repository.get(userId, reference.templateId)
        if (!template) {
          throw new Error('Prompt template not found')
        }
        content = template.content
        await repository.incrementUsage(userId, reference.templateId)
      } else {
        content = reference.customContent ?? ''
      }

      const allVariables = { ...reference.variables, ...runtimeVariables }
      return this.replaceVariables(content, allVariables)
    },

    replaceVariables(content: string, variables: Record<string, string>): string {
      let result = content
      for (const [key, value] of Object.entries(variables)) {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
        result = result.replace(regex, value)
      }
      return result
    },
  }
}
