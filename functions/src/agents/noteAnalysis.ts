/**
 * Note AI Analysis Functions
 *
 * Cloud Functions for AI-powered note analysis tools:
 * - Summarize
 * - Fact Check
 * - LinkedIn Analysis
 * - Write with AI
 * - Tag with AI
 * - Suggest Note Tags
 */

import Anthropic from '@anthropic-ai/sdk'
import { MODEL_PRICING } from '@lifeos/agents'
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { loadProviderKeys, ANTHROPIC_API_KEY } from './providerKeys.js'

// Types
interface AIToolRequest {
  tool: 'summarize' | 'factCheck' | 'linkedIn' | 'writeWithAI' | 'tagWithAI' | 'suggestNoteTags'
  content: string
  prompt?: string
  context?: {
    availableTopics?: Array<{ id: string; name: string }>
    availableNotes?: Array<{ id: string; title: string }>
  }
}

interface AIToolResponse {
  tool: string
  result: unknown
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

interface FactCheckResult {
  claim: string
  confidence: 'high' | 'medium' | 'low' | 'uncertain'
  explanation: string
  suggestedSources?: string[]
}

interface LinkedInAnalysis {
  overallScore: number
  hooks: string[]
  suggestedHashtags: string[]
  quotableLines: string[]
  improvements: string[]
}

interface ParagraphTagSuggestion {
  paragraphPath: string
  paragraphText: string
  suggestedTags: string[]
  matchedTopicIds: string[]
  matchedNoteIds: string[]
  confidence: number
}

/**
 * Calculate cost based on token usage
 */
function _calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[modelName] ?? MODEL_PRICING.default
  const inputCost = (inputTokens / 1_000_000) * pricing.input
  const outputCost = (outputTokens / 1_000_000) * pricing.output
  return inputCost + outputCost
}

/**
 * Execute a prompt with Claude
 */
async function executePrompt(
  client: Anthropic,
  systemPrompt: string,
  userPrompt: string,
  modelName = 'claude-3-5-haiku-20241022'
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const response = await client.messages.create({
    model: modelName,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const textContent = response.content.find((c) => c.type === 'text')
  const content = textContent?.type === 'text' ? textContent.text : ''

  return {
    content,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

/**
 * Summarize note content
 */
async function summarize(client: Anthropic, content: string): Promise<string> {
  const systemPrompt = `You are an expert at synthesizing information. Create concise, insightful summaries that capture the essence of the content.

Guidelines:
- Focus on key themes, insights, and main points
- Use bullet points for clarity
- Keep it concise (3-5 key points maximum)
- Highlight any actionable items or conclusions`

  const userPrompt = `Please summarize the following note content:\n\n${content}`

  const result = await executePrompt(client, systemPrompt, userPrompt)
  return result.content
}

/**
 * Fact-check claims in the note
 */
async function factCheck(client: Anthropic, content: string): Promise<FactCheckResult[]> {
  const systemPrompt = `You are a fact-checking expert. Analyze the text and identify factual claims that could be verified.

For each claim, provide:
1. The exact claim made
2. Confidence level (high/medium/low/uncertain) based on your knowledge
3. Brief explanation of why
4. Suggested sources to verify (if applicable)

Respond in JSON format:
[
  {
    "claim": "the exact claim",
    "confidence": "high|medium|low|uncertain",
    "explanation": "why this confidence level",
    "suggestedSources": ["source1", "source2"]
  }
]

Only include claims that are verifiable factual statements. Skip opinions, subjective statements, and obvious facts.
If no factual claims are found, return an empty array.`

  const userPrompt = `Analyze the following text for factual claims:\n\n${content}`

  const result = await executePrompt(client, systemPrompt, userPrompt)

  try {
    // Extract JSON from response
    const jsonMatch = result.content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as FactCheckResult[]
    }
    return []
  } catch {
    return []
  }
}

/**
 * Analyze content for LinkedIn post potential
 */
async function analyzeLinkedIn(client: Anthropic, content: string): Promise<LinkedInAnalysis> {
  const systemPrompt = `You are a LinkedIn content strategist. Analyze the content for its potential as a LinkedIn post.

Evaluate and provide:
1. Overall score (1-10) for LinkedIn engagement potential
2. 2-3 hook suggestions (attention-grabbing opening lines)
3. 3-5 relevant hashtags
4. 2-3 quotable lines from the content
5. 2-3 specific improvements to make it more engaging

Respond in JSON format:
{
  "overallScore": 7,
  "hooks": ["Hook 1", "Hook 2"],
  "suggestedHashtags": ["tag1", "tag2", "tag3"],
  "quotableLines": ["Line 1", "Line 2"],
  "improvements": ["Improvement 1", "Improvement 2"]
}`

  const userPrompt = `Analyze this content for LinkedIn:\n\n${content}`

  const result = await executePrompt(client, systemPrompt, userPrompt)

  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as LinkedInAnalysis
    }
    return {
      overallScore: 5,
      hooks: [],
      suggestedHashtags: [],
      quotableLines: [],
      improvements: ['Unable to analyze - please try again'],
    }
  } catch {
    return {
      overallScore: 5,
      hooks: [],
      suggestedHashtags: [],
      quotableLines: [],
      improvements: ['Unable to parse analysis - please try again'],
    }
  }
}

/**
 * Generate new content based on existing note and prompt
 */
async function writeWithAI(client: Anthropic, content: string, prompt: string): Promise<string> {
  const systemPrompt = `You are a skilled writer. Based on the existing content and the user's instructions, generate new content that matches the style and tone.

Guidelines:
- Match the existing content's style, tone, and vocabulary
- Be concise but comprehensive
- Focus on the specific request
- Output only the new content, no explanations or meta-commentary`

  const userPrompt = `Existing content:
${content}

---

Request: ${prompt}

Please generate the requested content:`

  const result = await executePrompt(client, systemPrompt, userPrompt)
  return result.content
}

/**
 * Analyze paragraphs and suggest tags
 */
async function tagWithAI(
  client: Anthropic,
  content: string,
  availableTopics: Array<{ id: string; name: string }>,
  availableNotes: Array<{ id: string; title: string }>
): Promise<ParagraphTagSuggestion[]> {
  const topicsStr = availableTopics.map((t) => `- ${t.name} (${t.id})`).join('\n')
  const notesStr = availableNotes
    .slice(0, 20)
    .map((n) => `- ${n.title} (${n.id})`)
    .join('\n')

  const systemPrompt = `You are a semantic analysis expert. Analyze each paragraph to identify its main topics and suggest relevant tags.

For each paragraph:
1. Suggest 1-3 freeform topic tags that describe what the paragraph discusses
2. Match to existing topics/notes if relevant

Available Topics:
${topicsStr || '(none)'}

Available Notes:
${notesStr || '(none)'}

Respond in JSON format:
[
  {
    "paragraphPath": "0.1.2",
    "paragraphText": "first 100 chars...",
    "suggestedTags": ["tag1", "tag2"],
    "matchedTopicIds": ["topic:xxx"],
    "matchedNoteIds": ["note:yyy"],
    "confidence": 0.8
  }
]

Extract the paragraph path from the input format: [index] (path): text`

  const userPrompt = `Analyze these paragraphs for tagging:\n\n${content}`

  const result = await executePrompt(client, systemPrompt, userPrompt)

  try {
    const jsonMatch = result.content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as ParagraphTagSuggestion[]
    }
    return []
  } catch {
    return []
  }
}

/**
 * Suggest note-level tags based on content
 */
async function suggestNoteTags(
  client: Anthropic,
  content: string,
  existingTags: string[]
): Promise<string[]> {
  const existingStr = existingTags.length > 0 ? `Existing tags: ${existingTags.join(', ')}` : ''

  const systemPrompt = `You are a tagging expert. Suggest 3-5 relevant tags for categorizing this note.

Guidelines:
- Tags should be lowercase, single words or short phrases with hyphens
- Focus on topics, themes, and categories
- Don't repeat existing tags
- Be specific but not overly narrow

${existingStr}

Respond with a JSON array of tag strings:
["tag1", "tag2", "tag3"]`

  const userPrompt = `Suggest tags for this content:\n\n${content}`

  const result = await executePrompt(client, systemPrompt, userPrompt)

  try {
    const jsonMatch = result.content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      const tags = JSON.parse(jsonMatch[0]) as string[]
      // Filter out existing tags
      return tags.filter((t) => !existingTags.includes(t))
    }
    return []
  } catch {
    return []
  }
}

/**
 * Main Cloud Function for note AI analysis
 */
export const analyzeNoteWithAI = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (request): Promise<AIToolResponse> => {
    // Verify authentication
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated')
    }

    const userId = request.auth.uid
    const data = request.data as AIToolRequest

    if (!data.tool || !data.content) {
      throw new HttpsError('invalid-argument', 'Missing required fields: tool and content')
    }

    // Load API keys from user settings (with fallback to secrets)
    const providerKeys = await loadProviderKeys(userId)

    if (!providerKeys.anthropic) {
      throw new HttpsError(
        'failed-precondition',
        'Anthropic API key not configured. Please add your API key in Settings → Model Settings.'
      )
    }

    // Initialize Anthropic client
    const client = new Anthropic({
      apiKey: providerKeys.anthropic,
    })

    let result: unknown
    let inputTokens = 0
    let outputTokens = 0

    try {
      switch (data.tool) {
        case 'summarize':
          result = await summarize(client, data.content)
          break

        case 'factCheck':
          result = await factCheck(client, data.content)
          break

        case 'linkedIn':
          result = await analyzeLinkedIn(client, data.content)
          break

        case 'writeWithAI':
          if (!data.prompt) {
            throw new HttpsError('invalid-argument', 'Write with AI requires a prompt')
          }
          result = await writeWithAI(client, data.content, data.prompt)
          break

        case 'tagWithAI':
          result = await tagWithAI(
            client,
            data.content,
            data.context?.availableTopics ?? [],
            data.context?.availableNotes ?? []
          )
          break

        case 'suggestNoteTags': {
          const existingTags = data.context?.availableTopics?.map((t) => t.name) ?? []
          result = await suggestNoteTags(client, data.content, existingTags)
          break
        }

        default:
          throw new HttpsError('invalid-argument', `Unknown tool: ${data.tool}`)
      }

      return {
        tool: data.tool,
        result,
        usage: {
          inputTokens,
          outputTokens,
        },
      }
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error
      }
      console.error('AI analysis error:', error)
      throw new HttpsError('internal', 'Failed to process AI analysis')
    }
  }
)
