/**
 * Zod Schemas for Structured Output Parsing
 *
 * These schemas are used with function calling across all 4 LLM providers
 * (OpenAI, Anthropic, Gemini, Grok) to get structured outputs from dialectical phases.
 */

import { z } from 'zod'

// ----- Rewrite Operators -----

export const RewriteOperatorTypeSchema = z.enum([
  'SPLIT',
  'MERGE',
  'REVERSE_EDGE',
  'ADD_MEDIATOR',
  'SCOPE_TO_REGIME',
  'TEMPORALIZE',
])

export const RewriteOperatorSchema = z.object({
  type: RewriteOperatorTypeSchema,
  target: z.string().describe('The node or edge to apply the operator to'),
  args: z.record(z.string(), z.unknown()).describe('Operator-specific arguments'),
  rationale: z.string().describe('Reason for applying this operator'),
})

// ----- Thesis Output Schema -----

/**
 * Schema for thesis generation output
 * Used in the thesis_generation phase of dialectical cycle
 */
export const ThesisOutputSchema = z.object({
  conceptGraph: z
    .record(z.string(), z.array(z.string()))
    .describe('Map of concept names to related concepts'),
  causalModel: z.array(z.string()).describe('List of cause-effect relationships as strings'),
  falsificationCriteria: z.array(z.string()).min(1).describe('Conditions that would disprove this thesis (at least one required)'),
  decisionImplications: z.array(z.string()).describe('Actions that follow from this thesis'),
  unitOfAnalysis: z
    .string()
    .describe('The primary subject of analysis (e.g., individual, organization, system)'),
  temporalGrain: z.string().describe('Time scale of the analysis (e.g., seconds, days, years)'),
  regimeAssumptions: z.array(z.string()).describe('Conditions under which this thesis holds'),
  confidence: z.number().min(0).max(1).describe('Confidence level between 0 and 1'),
})

// Type inference helper
export type ThesisOutputParsed = z.infer<typeof ThesisOutputSchema>

// ----- Negation Output Schema -----

/**
 * Schema for cross-negation output
 * Used in the cross_negation phase of dialectical cycle
 */
export const NegationOutputSchema = z.object({
  internalTensions: z
    .array(z.string())
    .describe('Contradictions identified within the target thesis'),
  categoryAttacks: z.array(z.string()).describe('Challenges to the categories used in the thesis'),
  preservedValid: z
    .array(z.string())
    .describe('Elements from the target thesis that should be preserved'),
  rivalFraming: z.string().describe('An alternative way to frame the problem or solution'),
  rewriteOperator: RewriteOperatorTypeSchema.describe('The graph transformation operator to apply'),
  operatorArgs: z.record(z.string(), z.unknown()).describe('Arguments for the rewrite operator'),
})

export type NegationOutputParsed = z.infer<typeof NegationOutputSchema>

// ----- Contradiction Output Schema -----

export const ContradictionTypeSchema = z.enum(['SYNCHRONIC', 'DIACHRONIC', 'REGIME_SHIFT'])
export const ContradictionSeveritySchema = z.enum(['HIGH', 'MEDIUM', 'LOW'])

/**
 * Schema for contradiction detection output
 * Used by contradiction trackers
 */
export const ContradictionOutputSchema = z.object({
  type: ContradictionTypeSchema.describe('Type of contradiction'),
  severity: ContradictionSeveritySchema.describe('How critical is this contradiction'),
  actionDistance: z.number().int().min(0).describe('BFS shortest path to nearest action node'),
  participatingClaims: z.array(z.string()).describe('IDs of claims involved in the contradiction'),
  description: z.string().describe('Human-readable description of the contradiction'),
})

export type ContradictionOutputParsed = z.infer<typeof ContradictionOutputSchema>

// ----- Sublation Output Schema -----

const NewClaimSchema = z.object({
  id: z.string().describe('Unique identifier for the new claim'),
  text: z.string().describe('The claim text'),
  confidence: z.number().min(0).max(1).describe('Confidence level'),
})

const NewPredictionSchema = z.object({
  id: z.string().describe('Unique identifier for the prediction'),
  text: z.string().describe('The prediction text'),
  threshold: z.string().describe('Threshold or condition for the prediction'),
})

/**
 * Schema for sublation (synthesis) output
 * Used in the sublation phase of dialectical cycle
 */
export const SublationOutputSchema = z.object({
  operators: z.array(RewriteOperatorSchema).describe('Rewrite operators to apply for synthesis'),
  preservedElements: z
    .array(z.string())
    .describe('Elements from theses that are preserved in synthesis'),
  negatedElements: z.array(z.string()).describe('Elements from theses that are rejected'),
  newConceptGraph: z
    .record(z.string(), z.array(z.string()))
    .describe('Updated concept relationships after synthesis'),
  newClaims: z.array(NewClaimSchema).describe('New claims that emerge from the synthesis'),
  newPredictions: z.array(NewPredictionSchema).describe('Testable predictions from the synthesis'),
  incompleteReason: z
    .string()
    .optional()
    .describe('Why the synthesis is partial or incomplete when the sublation step degraded'),
})

export type SublationOutputParsed = z.infer<typeof SublationOutputSchema>

// ----- Meta Reflection Schema -----

export const MetaDecisionSchema = z.enum(['CONTINUE', 'TERMINATE', 'RESPECIFY'])

/**
 * Schema for meta-reflection output
 * Used in the meta_reflect phase of dialectical cycle
 */
export const MetaReflectionOutputSchema = z.object({
  decision: MetaDecisionSchema.describe(
    'Whether to continue the cycle, terminate, or respecify the goal'
  ),
  reasoning: z.string().describe('Explanation for the decision'),
  refinedGoal: z.string().optional().describe('Refined goal if decision is RESPECIFY'),
  qualityAssessment: z.object({
    contradictionResolution: z
      .number()
      .min(0)
      .max(1)
      .describe('How well were contradictions resolved'),
    conceptualProgress: z.number().min(0).max(1).describe('How much conceptual progress was made'),
    actionability: z.number().min(0).max(1).describe('How actionable is the current synthesis'),
  }),
  warnings: z.array(z.string()).describe('Any warnings about the current state'),
})

export type MetaReflectionOutputParsed = z.infer<typeof MetaReflectionOutputSchema>

// ----- Retrieval Planning Schema -----

/**
 * Schema for retrieval planning output
 * Used by the retrieval agent's THINK action
 */
export const RetrievalPlanSchema = z.object({
  strategy: z
    .enum(['focused', 'exploratory', 'contrastive', 'historical'])
    .describe('Retrieval strategy to use'),
  primaryConcepts: z.array(z.string()).describe('Main concepts to search for'),
  secondaryConcepts: z.array(z.string()).describe('Related concepts for expansion'),
  suggestedFilters: z
    .object({
      lenses: z.array(z.string()).optional().describe('Filter by thesis lenses'),
      minConfidence: z.number().min(0).max(1).optional().describe('Minimum confidence threshold'),
    })
    .optional()
    .describe('Optional filters to apply'),
})

export type RetrievalPlanParsed = z.infer<typeof RetrievalPlanSchema>

// ----- Tool Definitions for Function Calling -----

/**
 * Convert Zod schema to OpenAI/Anthropic function tool format
 * This utility helps generate tool definitions for structured output
 */
export function zodToToolDefinition(
  name: string,
  description: string,
  schema: z.ZodObject<z.ZodRawShape>
): {
  name: string
  description: string
  parameters: Record<string, unknown>
} {
  const jsonSchema = zodToJsonSchema(schema)
  return {
    name,
    description,
    parameters: jsonSchema,
  }
}

/**
 * Simple Zod to JSON Schema converter for our use case
 * Handles the subset of Zod types we use
 * Compatible with Zod v4
 */
function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Access internal definition - cast to access internals safely
  const schemaAny = schema as unknown as {
    _def?: {
      typeName?: string
      shape?: Record<string, z.ZodTypeAny> | (() => Record<string, z.ZodTypeAny>)
      values?: string[]
      type?: z.ZodTypeAny
      element?: z.ZodTypeAny
      valueType?: z.ZodTypeAny
      innerType?: z.ZodTypeAny
      options?: z.ZodTypeAny[]
      value?: unknown
    }
  }

  const def = schemaAny._def
  if (!def) {
    return { type: 'object' }
  }

  const typeName = def.typeName

  // Handle ZodObject
  if (typeName === 'ZodObject' && def.shape) {
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape
    const properties: Record<string, unknown> = {}
    const required: string[] = []

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodTypeAny
      properties[key] = zodToJsonSchema(zodValue)

      // Check if field is required (not optional)
      const valueDef = (zodValue as unknown as { _def?: { typeName?: string } })._def
      if (valueDef?.typeName !== 'ZodOptional') {
        required.push(key)
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    }
  }

  // Handle ZodString
  if (typeName === 'ZodString') {
    const result: Record<string, unknown> = { type: 'string' }
    if (schema.description) {
      result.description = schema.description
    }
    return result
  }

  // Handle ZodNumber
  if (typeName === 'ZodNumber') {
    const result: Record<string, unknown> = { type: 'number' }
    if (schema.description) {
      result.description = schema.description
    }
    return result
  }

  // Handle ZodBoolean
  if (typeName === 'ZodBoolean') {
    return { type: 'boolean' }
  }

  // Handle ZodArray
  if (typeName === 'ZodArray') {
    const itemsType = def.type ?? def.element
    return {
      type: 'array',
      items: itemsType ? zodToJsonSchema(itemsType) : { type: 'unknown' },
    }
  }

  // Handle ZodEnum
  if (typeName === 'ZodEnum') {
    return {
      type: 'string',
      enum: def.values,
    }
  }

  // Handle ZodRecord
  if (typeName === 'ZodRecord') {
    const valueType = def.valueType ?? def.element
    return {
      type: 'object',
      additionalProperties: valueType ? zodToJsonSchema(valueType) : {},
    }
  }

  // Handle ZodOptional
  if (typeName === 'ZodOptional') {
    const innerType = def.innerType
    return innerType ? zodToJsonSchema(innerType) : { type: 'unknown' }
  }

  // Handle ZodUnion
  if (typeName === 'ZodUnion') {
    const options = def.options ?? []
    return {
      oneOf: (options as z.ZodTypeAny[]).map(zodToJsonSchema),
    }
  }

  // Handle ZodLiteral
  if (typeName === 'ZodLiteral') {
    return { const: def.value }
  }

  // Handle ZodUnknown
  if (typeName === 'ZodUnknown' || typeName === 'ZodAny') {
    return {}
  }

  // Fallback for unknown types
  return { type: 'object' }
}

// ----- Compact Graph Schema -----

const CompactGraphNodeSchema = z.object({
  id: z.string().describe('Short node ID, e.g. "n1"'),
  label: z.string().max(80).describe('Node label, ≤80 chars'),
  type: z.enum(['claim', 'concept', 'mechanism', 'prediction']),
  note: z.string().max(150).optional().describe('Qualifications or caveats, ≤150 chars'),
  sourceId: z.string().optional().describe('Source record ID for research-backed nodes'),
  sourceUrl: z.string().optional().describe('Source URL for research-backed nodes'),
  sourceConfidence: z.number().min(0).max(1).optional().describe('Quality-weighted source confidence'),
})

const CompactGraphEdgeSchema = z.object({
  from: z.string().describe('Source node ID'),
  to: z.string().describe('Target node ID'),
  rel: z.enum(['causes', 'contradicts', 'supports', 'mediates', 'scopes']),
  weight: z.number().min(0).max(1).optional().describe('Confidence weight'),
})

export const CompactGraphSchema = z.object({
  nodes: z.array(CompactGraphNodeSchema).max(10).describe('Graph nodes, max 10'),
  edges: z.array(CompactGraphEdgeSchema).describe('Typed edges between nodes'),
  summary: z.string().max(200).describe('Human-readable headline, ≤200 chars'),
  reasoning: z.string().max(500).describe('Qualitative texture: hedging, nuance, emergent insights, ≤500 chars'),
  confidence: z.number().min(0).max(1),
  regime: z.string().describe('Conditions under which this holds'),
  temporalGrain: z.string().describe('Time scale of analysis'),
})

export type CompactGraphParsed = z.infer<typeof CompactGraphSchema>

// ----- Graph Diff Schema -----

export const GraphDiffSchema = z.object({
  addedNodes: z.array(z.string()).describe('IDs of nodes added this cycle'),
  removedNodes: z.array(z.string()).describe('IDs of nodes removed this cycle'),
  addedEdges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    rel: z.string(),
  })).describe('Edges added this cycle'),
  removedEdges: z.array(z.object({
    from: z.string(),
    to: z.string(),
    rel: z.string(),
  })).describe('Edges removed this cycle'),
  modifiedNodes: z.array(z.object({
    id: z.string(),
    oldLabel: z.string(),
    newLabel: z.string(),
  })).describe('Nodes whose labels were updated'),
  resolvedContradictions: z.array(z.string()).describe('IDs of contradicts edges removed'),
  newContradictions: z.array(z.string()).describe('IDs of new contradicts edges added'),
})

export type GraphDiffParsed = z.infer<typeof GraphDiffSchema>

// ----- Graph-based Sublation Output Schema -----

export const GraphSublationOutputSchema = z.object({
  mergedGraph: CompactGraphSchema.describe('The merged and evolved knowledge graph'),
  diff: GraphDiffSchema.describe('What changed from the prior merged graph'),
  resolvedContradictions: z.array(z.string()).describe('Descriptions of contradictions resolved'),
})

export type GraphSublationOutputParsed = z.infer<typeof GraphSublationOutputSchema>

// ----- Pre-built Tool Definitions -----

export const DIALECTICAL_TOOLS = {
  generateThesis: zodToToolDefinition(
    'generate_thesis',
    'Generate a structured thesis from a given perspective (lens)',
    ThesisOutputSchema
  ),

  generateNegation: zodToToolDefinition(
    'generate_negation',
    'Generate a determinate negation critiquing a target thesis',
    NegationOutputSchema
  ),

  detectContradiction: zodToToolDefinition(
    'detect_contradiction',
    'Detect and classify a contradiction between claims',
    ContradictionOutputSchema
  ),

  generateSynthesis: zodToToolDefinition(
    'generate_synthesis',
    'Generate a synthesis (Aufhebung) that preserves, negates, and transcends theses',
    SublationOutputSchema
  ),

  metaReflect: zodToToolDefinition(
    'meta_reflect',
    'Reflect on the dialectical cycle and decide whether to continue, terminate, or respecify',
    MetaReflectionOutputSchema
  ),

  planRetrieval: zodToToolDefinition(
    'plan_retrieval',
    'Plan a retrieval strategy for querying the knowledge graph',
    RetrievalPlanSchema
  ),
}
