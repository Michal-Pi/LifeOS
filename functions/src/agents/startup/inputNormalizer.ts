import type {
  OracleScope,
  OracleSearchPlan,
  SearchPlan,
  SourceRecord,
} from '@lifeos/agents'
import { z } from 'zod'
import {
  extractUserContext,
  buildContextSourceRecords,
} from '../deepResearch/contextProcessor.js'
import { safeParseJsonWithSchema } from '../shared/jsonParser.js'

export interface NormalizedStartupInput {
  normalizedGoal: string
  contextSummary: string | null
  hasContext: boolean
  noteCount: number
  fileCount: number
  rawCharCount: number
  sources: SourceRecord[]
  contentMap: Record<string, string>
  warnings: string[]
}

export interface GoalFrame {
  canonicalGoal: string
  coreQuestion: string
  subquestions: string[]
  keyConcepts: string[]
  verificationTargets: string[]
  plannerRationale: string
}

export interface DialecticalGoalFrame extends GoalFrame {
  focusAreas: string[]
  candidateTensions: string[]
  retrievalIntent: {
    useKnowledgeGraph: boolean
    useExternalResearch: boolean
  }
}

export interface OracleGoalFrame extends GoalFrame {
  scope: OracleScope
  searchPlan: OracleSearchPlan
}

export interface DeepResearchGoalFrame extends GoalFrame {
  searchPlan: SearchPlan
}

export interface StartupSeedSummary {
  sourceCount: number
  claimCount: number
  graphNodeCount: number
  graphEdgeCount: number
  evidenceLinkedCount: number
}

const MAX_SUBQUESTIONS = 10
const MAX_KEY_CONCEPTS = 12
const MAX_VERIFICATION_TARGETS = 12
const MAX_FOCUS_AREAS = 8
const MAX_CANDIDATE_TENSIONS = 8

const BaseGoalFrameSchema = z.object({
  canonicalGoal: z.string().trim().min(1),
  coreQuestion: z.string().trim().min(1),
  subquestions: z.array(z.string().trim().min(1)).max(MAX_SUBQUESTIONS),
  keyConcepts: z.array(z.string().trim().min(1)).max(MAX_KEY_CONCEPTS),
  verificationTargets: z.array(z.string().trim().min(1)).max(MAX_VERIFICATION_TARGETS),
  plannerRationale: z.string().trim().min(1),
})

const SearchPlanSchema = z.object({
  serpQueries: z.array(z.string().trim().min(1)).min(1).max(5),
  scholarQueries: z.array(z.string().trim().min(1)).max(3),
  semanticQueries: z.array(z.string().trim().min(1)).max(3),
  rationale: z.string().trim().min(1),
  targetSourceCount: z.number().int().min(1).max(20),
})

const RetrievalIntentSchema = z.object({
  useKnowledgeGraph: z.boolean(),
  useExternalResearch: z.boolean(),
})

const DialecticalGoalFrameSchema = BaseGoalFrameSchema.extend({
  focusAreas: z.array(z.string().trim().min(1)).max(MAX_FOCUS_AREAS),
  candidateTensions: z.array(z.string().trim().min(1)).max(MAX_CANDIDATE_TENSIONS),
  retrievalIntent: RetrievalIntentSchema,
})

const OracleScopeSchema = z.object({
  topic: z.string().trim().min(1),
  domain: z.string().trim().min(1),
  timeHorizon: z.string().trim().min(1),
  geography: z.string().trim().min(1),
  decisionContext: z.string().trim().min(1),
  boundaries: z.object({
    inScope: z.array(z.string().trim().min(1)).max(20),
    outOfScope: z.array(z.string().trim().min(1)).max(20),
  }),
})

const OracleGoalFrameSchema = BaseGoalFrameSchema.extend({
  scope: OracleScopeSchema,
  searchPlan: z.record(z.string(), z.array(z.string().trim().min(1))),
})

const DeepResearchGoalFrameSchema = BaseGoalFrameSchema.extend({
  searchPlan: SearchPlanSchema,
})

type RawAttachedNote = {
  noteId?: unknown
  title?: unknown
  content?: unknown
}

type RawUploadedFile = {
  name?: unknown
  type?: unknown
  content?: unknown
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}

function stripHtmlLight(text: string): string {
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getRawNoteWarnings(context: Record<string, unknown>): string[] {
  const warnings: string[] = []
  if (!Array.isArray(context.attachedNotes)) return warnings

  let malformed = 0
  let tooShort = 0
  for (const raw of context.attachedNotes as RawAttachedNote[]) {
    if (
      !isObject(raw) ||
      typeof raw.noteId !== 'string' ||
      typeof raw.title !== 'string' ||
      typeof raw.content !== 'string'
    ) {
      malformed++
      continue
    }
    if (stripHtmlLight(raw.content).length < 20) {
      tooShort++
    }
  }

  if (malformed > 0) warnings.push(`Skipped ${malformed} malformed attached notes`)
  if (tooShort > 0) warnings.push(`Skipped ${tooShort} trivially short attached notes`)
  return warnings
}

function getRawFileWarnings(context: Record<string, unknown>): string[] {
  const warnings: string[] = []
  if (!Array.isArray(context.uploadedFiles)) return warnings

  let malformed = 0
  let tooShort = 0
  for (const raw of context.uploadedFiles as RawUploadedFile[]) {
    if (
      !isObject(raw) ||
      typeof raw.name !== 'string' ||
      typeof raw.content !== 'string'
    ) {
      malformed++
      continue
    }
    if (String(raw.content).trim().length < 20) {
      tooShort++
    }
  }

  if (malformed > 0) warnings.push(`Skipped ${malformed} malformed uploaded files`)
  if (tooShort > 0) warnings.push(`Skipped ${tooShort} trivially short uploaded files`)
  return warnings
}

export function normalizeStartupInput(
  goal: string,
  context: Record<string, unknown> = {},
): NormalizedStartupInput {
  const normalizedGoal = goal.trim()
  if (normalizedGoal.length === 0) {
    throw new Error('Goal is required')
  }

  const processedContext = extractUserContext(context)
  const { sources, contentMap } = buildContextSourceRecords(context)
  const warnings = [
    ...getRawNoteWarnings(context),
    ...getRawFileWarnings(context),
  ]

  if (processedContext.hasContext && sources.length === 0) {
    warnings.push('User context was provided but no seedable context items were retained')
  }

  return {
    normalizedGoal,
    contextSummary: processedContext.hasContext ? processedContext.formattedText : null,
    hasContext: processedContext.hasContext,
    noteCount: processedContext.noteCount,
    fileCount: processedContext.fileCount,
    rawCharCount: processedContext.rawCharCount,
    sources,
    contentMap,
    warnings,
  }
}

export function summarizeNormalizedStartupInput(input: NormalizedStartupInput): Omit<NormalizedStartupInput, 'sources' | 'contentMap'> {
  return {
    normalizedGoal: input.normalizedGoal,
    contextSummary: input.contextSummary,
    hasContext: input.hasContext,
    noteCount: input.noteCount,
    fileCount: input.fileCount,
    rawCharCount: input.rawCharCount,
    warnings: input.warnings,
  }
}

function defaultBaseGoalFrame(goal: string, rationale: string): GoalFrame {
  return {
    canonicalGoal: goal,
    coreQuestion: goal,
    subquestions: [goal],
    keyConcepts: goal.split(/\W+/).filter((token) => token.length > 3).slice(0, 6),
    verificationTargets: [goal],
    plannerRationale: rationale,
  }
}

export function createFallbackDeepResearchGoalFrame(goal: string, searchPlan: SearchPlan): DeepResearchGoalFrame {
  return {
    ...defaultBaseGoalFrame(goal, 'Fallback planner frame created after planner validation failure'),
    searchPlan,
  }
}

export function createFallbackDialecticalGoalFrame(
  goal: string,
  useKnowledgeGraph: boolean,
  useExternalResearch: boolean,
): DialecticalGoalFrame {
  return {
    ...defaultBaseGoalFrame(goal, 'Fallback dialectical frame created after planner validation failure'),
    focusAreas: [],
    candidateTensions: [],
    retrievalIntent: {
      useKnowledgeGraph,
      useExternalResearch,
    },
  }
}

export function createFallbackOracleGoalFrame(
  goal: string,
  scope: OracleScope,
  searchPlan: OracleSearchPlan,
): OracleGoalFrame {
  return {
    ...defaultBaseGoalFrame(goal, 'Fallback Oracle frame created after planner validation failure'),
    scope,
    searchPlan,
  }
}

export function parseDeepResearchGoalFrame(output: string, fallback: DeepResearchGoalFrame): DeepResearchGoalFrame {
  return safeParseJsonWithSchema(
    output,
    DeepResearchGoalFrameSchema,
    fallback,
    'DeepResearchGoalFrame',
  ).data
}

export function parseDialecticalGoalFrame(output: string, fallback: DialecticalGoalFrame): DialecticalGoalFrame {
  return safeParseJsonWithSchema(
    output,
    DialecticalGoalFrameSchema,
    fallback,
    'DialecticalGoalFrame',
  ).data
}

export function parseOracleGoalFrame(output: string, fallback: OracleGoalFrame): OracleGoalFrame {
  return safeParseJsonWithSchema(
    output,
    OracleGoalFrameSchema,
    fallback,
    'OracleGoalFrame',
  ).data
}

export function buildEmptyStartupSeedSummary(sourceCount = 0): StartupSeedSummary {
  return {
    sourceCount,
    claimCount: 0,
    graphNodeCount: 0,
    graphEdgeCount: 0,
    evidenceLinkedCount: 0,
  }
}
