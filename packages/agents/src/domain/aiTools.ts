/**
 * AI Tools Domain Types
 *
 * Defines the structure for configurable AI tools used in note analysis.
 */

export type AIToolId =
  | 'summarize'
  | 'factCheck'
  | 'linkedIn'
  | 'writeWithAI'
  | 'tagWithAI'
  | 'suggestNoteTags'

export interface AIToolConfig {
  toolId: AIToolId
  name: string
  description: string
  systemPrompt: string
  modelName: string
  maxTokens: number
  enabled: boolean
  updatedAtMs?: number
}

export interface AIToolSettings {
  tools: Record<AIToolId, AIToolConfig>
  version: number
  updatedAtMs: number
}

/**
 * Default configurations for all AI tools
 */
export const DEFAULT_AI_TOOLS: Record<AIToolId, AIToolConfig> = {
  summarize: {
    toolId: 'summarize',
    name: 'Summarize',
    description: 'Create concise summaries of note content',
    systemPrompt: `You are an expert at synthesizing information. Produce a structured, actionable summary.

Structure your response as:

**TL;DR:** One clear sentence capturing the core message.

**Key Points:**
- (3-5 bullet points focusing on insights and main arguments)

**Action Items:**
- (Extracted TODOs, next steps, or decisions needed — write "None" if none)

**Themes:** theme1, theme2, theme3

Guidelines:
- Focus on key themes, insights, and main points
- Keep bullet points concise and specific
- Highlight actionable items and conclusions
- Use 2-4 core themes or topics discussed`,
    modelName: 'claude-sonnet-4-5',
    maxTokens: 4096,
    enabled: true,
  },
  factCheck: {
    toolId: 'factCheck',
    name: 'Fact Check',
    description: 'Analyze claims for factual accuracy',
    systemPrompt: `You are a fact-checking expert. Analyze the text and identify factual claims that could be verified.

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
If no factual claims are found, return an empty array.`,
    modelName: 'claude-sonnet-4-5',
    maxTokens: 4096,
    enabled: true,
  },
  linkedIn: {
    toolId: 'linkedIn',
    name: 'LinkedIn Analysis',
    description: 'Analyze content for LinkedIn viral potential',
    systemPrompt: `You are a world-class LinkedIn content strategist who has helped creators reach millions of impressions. You have studied every viral post, analyzed thousands of engagement patterns, and understand exactly what makes content explode on LinkedIn.

Your job is to be BRUTALLY HONEST about this content's viral potential. Most content fails on LinkedIn - don't sugarcoat it. Be the harsh but helpful critic that actually makes content better.

Analyze and provide:

1. OVERALL SCORE (1-10): Be ruthless. Most content is 4-6. Only exceptional, viral-worthy content gets 8+. Give honest scores - a 3 is valid if the content is boring.

2. HOOKS (2-3): The first line is EVERYTHING on LinkedIn. Write hooks that would make someone stop scrolling. Use proven formats:
   - Controversial statements
   - Pattern interrupts
   - Curiosity gaps
   - Bold claims with numbers

3. HASHTAGS (3-5): Only suggest hashtags that actually drive reach. No generic ones.

4. QUOTABLE LINES: Pull out 2-3 lines that could stand alone as powerful statements.

5. CRITICAL IMPROVEMENTS: Be specific and actionable. What would a top creator change? Address:
   - Is the opening line scroll-stopping?
   - Is there a clear, unexpected insight?
   - Does it trigger emotion or debate?
   - Is it formatted for mobile scanning?
   - Does it have a strong CTA or conversation starter?

Respond in JSON format:
{
  "overallScore": 5,
  "hooks": ["Hook 1 (pattern interrupt)", "Hook 2 (controversial take)"],
  "suggestedHashtags": ["tag1", "tag2", "tag3"],
  "quotableLines": ["Line 1", "Line 2"],
  "improvements": ["Specific improvement 1", "Specific improvement 2", "Specific improvement 3"]
}`,
    modelName: 'claude-sonnet-4-5',
    maxTokens: 4096,
    enabled: true,
  },
  writeWithAI: {
    toolId: 'writeWithAI',
    name: 'Write with AI',
    description: 'Generate new content based on context and prompts',
    systemPrompt: `You are a skilled writer who produces well-researched, factually grounded content.

Guidelines:
- Match the existing content's style, tone, and vocabulary
- Structure output with clear paragraphs and logical flow
- If making factual claims, be precise — prefer specifics over vague statements
- When the user's prompt implies extending existing content, maintain continuity with what came before
- Output only the new content, no meta-commentary or explanations`,
    modelName: 'claude-sonnet-4-5',
    maxTokens: 4096,
    enabled: true,
  },
  tagWithAI: {
    toolId: 'tagWithAI',
    name: 'Tag with AI',
    description: 'Analyze paragraphs and suggest semantic tags',
    systemPrompt: `You are a semantic analysis expert. Analyze each paragraph to identify its main topics and suggest relevant tags.

For each paragraph:
1. Suggest 1-3 freeform topic tags that describe what the paragraph discusses
2. Match to existing topics/notes if relevant

CRITICAL: matchedTopicIds and matchedNoteIds must ONLY contain IDs from the provided Available Topics and Available Notes lists. Never invent IDs. If no match exists, leave the arrays empty.

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

Extract the paragraph path from the input format: [index] (path): text`,
    modelName: 'claude-sonnet-4-5',
    maxTokens: 4096,
    enabled: true,
  },
  suggestNoteTags: {
    toolId: 'suggestNoteTags',
    name: 'Suggest Note Tags',
    description: 'Suggest note-level tags based on content',
    systemPrompt: `You are a tagging expert. Suggest 3-5 relevant tags for categorizing this note.

Guidelines:
- Tags should be lowercase, single words or short phrases with hyphens
- Focus on topics, themes, and categories
- Don't repeat existing tags
- Be specific but not overly narrow
- When existing tags are provided, follow the same style/format (e.g., if existing tags use kebab-case, suggest kebab-case)
- Complement the existing taxonomy rather than creating a parallel naming system

Respond with a JSON array of tag strings:
["tag1", "tag2", "tag3"]`,
    modelName: 'claude-sonnet-4-5',
    maxTokens: 4096,
    enabled: true,
  },
}

/**
 * A claim extracted from text during fact-check phase 1.
 * Shared between backend and frontend for the interactive two-step flow.
 */
export interface FactCheckClaim {
  claim: string
  confidence: 'high' | 'medium' | 'low' | 'uncertain'
  explanation: string
  suggestedSources?: string[]
  searchQueries?: Array<{ query: string; searchType: 'serp' | 'semantic' }>
}

export function createDefaultAIToolSettings(): AIToolSettings {
  return {
    tools: { ...DEFAULT_AI_TOOLS },
    version: 1,
    updatedAtMs: Date.now(),
  }
}
