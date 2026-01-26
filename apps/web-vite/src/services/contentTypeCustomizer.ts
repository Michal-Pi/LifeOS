import { contentTypePresets } from '@/agents/contentTypePresets'

export function applyContentTypeCustomization(basePrompt: string, contentType: string): string {
  const config = contentTypePresets.find(
    (preset) => preset.name === contentType || preset.id === contentType
  )
  if (!config) return basePrompt

  return `${basePrompt}

CONTENT TYPE CONFIGURATION:
- Tone: ${config.tone}
- Target Length: ${config.length}
- Focus: ${config.focus}
Adjust your output to match this content type.`
}
