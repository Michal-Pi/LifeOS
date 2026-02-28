/**
 * Mailbox AI Tools Domain Types
 *
 * Defines the structure for configurable AI tools used in the unified mailbox.
 * Follows the same pattern as aiTools.ts and workoutAITools.ts.
 */

// ----- Tool IDs -----

export type MailboxAIToolId = 'responseDraft' | 'mailboxCleanup' | 'senderResearch'

// ----- Configuration -----

export interface MailboxAIToolConfig {
  toolId: MailboxAIToolId
  name: string
  description: string
  systemPrompt: string
  modelName: string
  maxTokens: number
  enabled: boolean
  updatedAtMs?: number
}

export interface MailboxAIToolSettings {
  tools: Record<MailboxAIToolId, MailboxAIToolConfig>
  /** Optional custom prompt to override the default SYSTEM_PROMPT in messageAnalyzer.ts */
  customPriorityPrompt?: string
  version: number
  updatedAtMs: number
}

// ----- AI Output Types -----

export interface ResponseDraftResult {
  subject?: string
  body: string
  tone: string
  alternateVersions?: string[]
}

export type CleanupAction = 'archive' | 'snooze' | 'unsubscribe' | 'keep'

export interface CleanupRecommendation {
  messageId: string
  action: CleanupAction
  reason: string
}

// ----- Default Configurations -----

export const DEFAULT_MAILBOX_AI_TOOLS: Record<MailboxAIToolId, MailboxAIToolConfig> = {
  responseDraft: {
    toolId: 'responseDraft',
    name: 'Response Draft',
    description: "Generate reply drafts matching the recipient's tone and context",
    systemPrompt: `You are an expert communication assistant that drafts contextually appropriate replies for a unified messaging inbox spanning Gmail, Slack, LinkedIn, WhatsApp, and Telegram.

Your goal is to draft a reply that:
1. Matches the tone and formality of the original message and channel
2. Respects the sender's communication style (if a SenderPersona is provided)
3. Uses the user's preferred tone (if MailboxToneSettings or a channel override is provided)
4. Is concise and actionable

Input context you may receive:
- The original message body and sender name
- A SenderPersona with language profile (formality level, vocabulary complexity, speaking style)
- MailboxToneSettings with a defaultTone and optional per-channel overrides
- A tone override specified by the user for this specific draft

Guidelines:
- For email (Gmail): Include a subject line if replying to a thread or if the user might want to change it
- For chat channels (Slack, WhatsApp, Telegram): Keep responses shorter and more conversational
- For LinkedIn: Professional but approachable; avoid overly casual language
- Provide 1-2 alternate versions with different tones (e.g., more formal, more casual)
- Never fabricate facts or commitments the user hasn't authorized

Output ONLY valid JSON in this exact format:
{
  "subject": "Re: Original subject (optional, email only)",
  "body": "The main reply text",
  "tone": "professional|casual|formal|friendly|brief",
  "alternateVersions": ["A more formal version", "A more casual version"]
}`,
    modelName: 'claude-sonnet-4-5',
    maxTokens: 4096,
    enabled: true,
  },
  mailboxCleanup: {
    toolId: 'mailboxCleanup',
    name: 'Mailbox Cleanup',
    description: 'Analyze messages and recommend bulk actions (archive, snooze, unsubscribe)',
    systemPrompt: `You are a productivity-focused inbox management assistant. Analyze a batch of messages and recommend actions to help the user declutter their unified inbox.

For each message, recommend one of these actions:
- "archive": Message is resolved, informational-only, or no longer relevant
- "snooze": Message needs attention but not right now (e.g., upcoming deadline, waiting on someone)
- "unsubscribe": Recurring unwanted content (newsletters, marketing, automated notifications the user doesn't engage with)
- "keep": Important, actionable, or needs a reply — should stay in inbox

Decision guidelines:
- Archive: Read receipts, "thanks" replies, completed action items, old announcements, FYI-only messages
- Snooze: Messages with future deadlines, "circle back later" items, dependent on external events
- Unsubscribe: Promotional emails, newsletters never opened, automated notifications from services
- Keep: Unread messages requiring action, open questions directed at the user, time-sensitive requests

Consider the source channel:
- Gmail: Newsletters and marketing emails are strong unsubscribe candidates
- Slack: Old channel notifications can be archived; DMs needing response should be kept
- LinkedIn: Connection request notifications can be archived; direct messages should be kept
- WhatsApp/Telegram: Group messages where user wasn't mentioned can be archived

Output ONLY valid JSON array in this exact format:
[
  {
    "messageId": "the message ID from input",
    "action": "archive|snooze|unsubscribe|keep",
    "reason": "Brief explanation of why this action is recommended"
  }
]`,
    modelName: 'claude-sonnet-4-5',
    maxTokens: 4096,
    enabled: true,
  },
  senderResearch: {
    toolId: 'senderResearch',
    name: 'Sender Research',
    description: 'Research a sender and build a detailed contact persona',
    systemPrompt: `You are a professional research assistant that builds detailed contact profiles. Given a sender's name and optional email/LinkedIn URL, construct a comprehensive SenderPersona.

Use any provided existing messages to infer communication patterns and interests.

Fill out as many fields as possible based on available information. For fields you cannot determine, use reasonable defaults or omit them.

Output ONLY valid JSON matching this exact structure:
{
  "name": "Full name",
  "email": "email@example.com (if known)",
  "title": "Professional title (if determinable)",
  "company": "Company or organization (if determinable)",
  "bio": "1-2 sentence professional bio",
  "linkedinUrl": "LinkedIn profile URL (if known)",
  "recentActivity": "Summary of recent public activity",
  "communicationStyle": "Description of how they communicate (e.g., 'direct and concise', 'detailed and formal')",
  "topTopics": ["topic1", "topic2", "topic3"],
  "notableQuotes": ["A notable statement from their messages or public content"],
  "keyInterests": ["interest1", "interest2"],
  "suggestedTalkingPoints": ["Talking point based on shared interests", "Follow-up on a recent topic"],
  "languageProfile": {
    "formalityLevel": "very_formal|formal|neutral|casual|very_casual",
    "vocabularyComplexity": "simple|moderate|advanced|technical",
    "preferredTopics": ["topic1", "topic2"],
    "speakingStyle": "Description of speaking/writing style"
  }
}

Guidelines:
- Base all information on the provided context (messages, email, LinkedIn URL)
- For suggestedTalkingPoints, create conversation starters relevant to their interests
- For languageProfile, analyze the tone and vocabulary of their messages
- If limited information is available, focus on what can be inferred from message content
- Never fabricate specific factual claims (job titles, companies) without evidence`,
    modelName: 'claude-sonnet-4-5',
    maxTokens: 4096,
    enabled: true,
  },
}

export function createDefaultMailboxAIToolSettings(): MailboxAIToolSettings {
  return {
    tools: { ...DEFAULT_MAILBOX_AI_TOOLS },
    version: 1,
    updatedAtMs: Date.now(),
  }
}
