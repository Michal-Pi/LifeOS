/**
 * Axiom Cookbook & Library Loader
 *
 * Parses axiom_cookbook.json and axiom_library.json at module load,
 * exposing indexed lookups for recipes, techniques, and axioms.
 * Agents receive curated slices — not the full JSON.
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { z } from 'zod'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('AxiomLoader')

// ----- Zod schemas for raw JSON (snake_case from JSON files) -----

const RawCookbookRecipeSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  question: z.string(),
  when_to_use: z.string(),
  oracle_phases: z.array(z.string()),
  oracle_agents: z.array(z.string()),
  axiom_sequence: z.array(
    z.object({
      step: z.number(),
      action: z.string(),
      axioms: z.array(z.string()),
      instruction: z.string(),
    })
  ),
  techniques: z.array(z.string()),
  traps: z.array(z.object({ trap: z.string(), antidote: z.string() })),
  output_template: z.string(),
})

const RawCookbookTechniqueSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  key_axioms: z.array(z.string()),
  used_in_recipes: z.array(z.string()),
  common_errors: z.array(z.string()),
  output: z.string(),
})

const RawCookbookSchema = z.object({
  meta: z.object({
    name: z.string(),
    version: z.string(),
    total_recipes: z.number(),
    total_techniques: z.number(),
    total_axioms: z.number(),
    recipe_categories: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        subtitle: z.string(),
        primary_phase: z.string(),
      })
    ),
  }),
  recipes: z.array(RawCookbookRecipeSchema),
  techniques: z.array(RawCookbookTechniqueSchema),
})

const RawAxiomLibrarySchema = z.object({
  meta: z.object({
    name: z.string(),
    version: z.string(),
    totalAxioms: z.number(),
    domains: z.array(z.string()),
  }),
  axioms: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      domain: z.string(),
      formalDefinition: z.string(),
      mathematicalFormulation: z.string().optional(),
      boundaryConditions: z.array(z.string()),
      canonicalCitations: z.array(z.string()),
      systemElevation: z
        .object({
          role: z.string(),
          behavior: z.string(),
        })
        .optional(),
    })
  ),
})

// ----- Loaded types (camelCase for TS consumption) -----

export interface LoadedRecipe {
  id: string
  name: string
  category: string
  question: string
  whenToUse: string
  oraclePhases: string[]
  oracleAgents: string[]
  axiomSequence: Array<{
    step: number
    action: string
    axioms: string[]
    instruction: string
  }>
  techniques: string[]
  traps: Array<{ trap: string; antidote: string }>
  outputTemplate: string
}

export interface LoadedTechnique {
  id: string
  name: string
  description: string
  keyAxioms: string[]
  usedInRecipes: string[]
  commonErrors: string[]
  output: string
}

export interface LoadedAxiom {
  id: string
  name: string
  domain: string
  formalDefinition: string
  mathematicalFormulation?: string
  boundaryConditions: string[]
  canonicalCitations: string[]
  systemElevation?: {
    role: string
    behavior: string
  }
}

// ----- Indexes -----

/** Recipe index by ID */
const recipeById = new Map<string, LoadedRecipe>()
/** Recipes indexed by category (A, B, C, D, E) */
const recipesByCategory = new Map<string, LoadedRecipe[]>()
/** Recipes indexed by phase ("Phase 1", "Phase 2", etc.) */
const recipesByPhase = new Map<string, LoadedRecipe[]>()
/** Recipes indexed by agent name ("Decomposer", "Scanner", etc.) */
const recipesByAgent = new Map<string, LoadedRecipe[]>()

/** Technique index by ID */
const techniqueById = new Map<string, LoadedTechnique>()

/** Axiom index by ID */
const axiomById = new Map<string, LoadedAxiom>()
/** Axioms indexed by domain */
const axiomsByDomain = new Map<string, LoadedAxiom[]>()

/** Reverse index: axiom ID → recipe IDs that use it */
const axiomToRecipes = new Map<string, string[]>()

/** System elevations */
const systemElevations: LoadedAxiom[] = []

let loaded = false

// ----- Loader -----

function resolveDataPath(filename: string): string {
  const currentDir =
    typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url))

  const searchRoots = [currentDir, process.cwd()]
  for (const root of searchRoots) {
    let dir = root
    for (let depth = 0; depth < 8; depth++) {
      const candidate = resolve(dir, 'docs', 'Oracle', filename)
      if (existsSync(candidate)) {
        return candidate
      }

      const parent = resolve(dir, '..')
      if (parent === dir) break
      dir = parent
    }
  }

  const basePath =
    process.env.AXIOM_BASE_PATH ?? resolve(currentDir, '..', '..', '..', '..', 'docs', 'Oracle')
  return resolve(basePath, filename)
}

function loadCookbook(): void {
  try {
    const cookbookPath = resolveDataPath('axiom_cookbook.json')
    const parsed = JSON.parse(readFileSync(cookbookPath, 'utf-8'))
    const result = RawCookbookSchema.safeParse(parsed)
    if (!result.success) {
      log.warn('Cookbook schema validation failed', {
        errors: result.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
      })
      return
    }
    const raw = result.data

    for (const r of raw.recipes) {
      const recipe: LoadedRecipe = {
        id: r.id,
        name: r.name,
        category: r.category,
        question: r.question,
        whenToUse: r.when_to_use,
        oraclePhases: r.oracle_phases,
        oracleAgents: r.oracle_agents,
        axiomSequence: r.axiom_sequence,
        techniques: r.techniques,
        traps: r.traps,
        outputTemplate: r.output_template,
      }

      recipeById.set(recipe.id, recipe)

      // Index by category
      const catList = recipesByCategory.get(recipe.category) ?? []
      catList.push(recipe)
      recipesByCategory.set(recipe.category, catList)

      // Index by phase
      for (const phase of recipe.oraclePhases) {
        const phaseList = recipesByPhase.get(phase) ?? []
        phaseList.push(recipe)
        recipesByPhase.set(phase, phaseList)
      }

      // Index by agent
      for (const agent of recipe.oracleAgents) {
        const agentList = recipesByAgent.get(agent) ?? []
        agentList.push(recipe)
        recipesByAgent.set(agent, agentList)
      }

      // Build reverse axiom→recipe index
      for (const step of recipe.axiomSequence) {
        for (const axiomId of step.axioms) {
          const existing = axiomToRecipes.get(axiomId) ?? []
          if (!existing.includes(recipe.id)) {
            existing.push(recipe.id)
          }
          axiomToRecipes.set(axiomId, existing)
        }
      }
    }

    for (const t of raw.techniques) {
      const technique: LoadedTechnique = {
        id: t.id,
        name: t.name,
        description: t.description,
        keyAxioms: t.key_axioms,
        usedInRecipes: t.used_in_recipes,
        commonErrors: t.common_errors,
        output: t.output,
      }
      techniqueById.set(technique.id, technique)
    }

    log.info('Cookbook loaded', {
      recipes: recipeById.size,
      techniques: techniqueById.size,
      categories: recipesByCategory.size,
    })
  } catch (err) {
    log.warn('Failed to load axiom cookbook — Oracle prompts will have no cookbook context', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function loadAxiomLibrary(): void {
  try {
    const libraryPath = resolveDataPath('axiom_library.json')
    const parsed = JSON.parse(readFileSync(libraryPath, 'utf-8'))
    const result = RawAxiomLibrarySchema.safeParse(parsed)
    if (!result.success) {
      log.warn('Axiom library schema validation failed', {
        errors: result.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
      })
      return
    }
    const raw = result.data

    for (const a of raw.axioms) {
      const axiom: LoadedAxiom = {
        id: a.id,
        name: a.name,
        domain: a.domain,
        formalDefinition: a.formalDefinition,
        mathematicalFormulation: a.mathematicalFormulation,
        boundaryConditions: a.boundaryConditions,
        canonicalCitations: a.canonicalCitations,
        systemElevation: a.systemElevation,
      }

      axiomById.set(axiom.id, axiom)

      // Index by domain
      const domainList = axiomsByDomain.get(axiom.domain) ?? []
      domainList.push(axiom)
      axiomsByDomain.set(axiom.domain, domainList)

      // Track system elevations
      if (axiom.systemElevation) {
        systemElevations.push(axiom)
      }
    }

    log.info('Axiom library loaded', {
      axioms: axiomById.size,
      domains: axiomsByDomain.size,
      elevations: systemElevations.length,
    })
  } catch (err) {
    log.warn('Failed to load axiom library — Oracle prompts will have no axiom definitions', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

function ensureLoaded(): void {
  if (loaded) return
  loadCookbook()
  loadAxiomLibrary()
  loaded = true
}

// ----- Public API -----

/** Get a recipe by its ID (e.g. "A1", "B3") */
export function getRecipeById(id: string): LoadedRecipe | undefined {
  ensureLoaded()
  return recipeById.get(id)
}

/** Get all recipes for a category ("A", "B", "C", "D", "E") */
export function getRecipesByCategory(category: string): LoadedRecipe[] {
  ensureLoaded()
  return recipesByCategory.get(category) ?? []
}

/** Get all recipes relevant to a phase ("Phase 0", "Phase 1", etc.) */
export function getRecipesByPhase(phase: string): LoadedRecipe[] {
  ensureLoaded()
  return recipesByPhase.get(phase) ?? []
}

/**
 * Get recipes for a specific Oracle agent role + phase combination.
 *
 * Agent names map to cookbook agent names:
 * - context_gatherer → "Context Gatherer"
 * - decomposer → "Decomposer"
 * - systems_mapper → "Systems Mapper"
 * - verifier → "Verifier"
 * - scanner → "Scanner"
 * - impact_assessor → "Impact Assessor"
 * - weak_signal_hunter → "Weak Signal Hunter"
 * - scenario_developer → "Scenario Developer"
 * - equilibrium_analyst → "Equilibrium Analyst"
 * - red_team → "Red Team"
 * - gate_evaluator → "Gate Evaluator"
 * - consistency_checker → "Consistency Checker"
 */
export function getRecipesForAgent(agentRole: string, phase?: string): LoadedRecipe[] {
  ensureLoaded()

  const agentName = ROLE_TO_COOKBOOK_NAME[agentRole]
  if (!agentName) return []

  const agentRecipes = (recipesByAgent.get(agentName) ?? []).sort((a, b) =>
    a.id.localeCompare(b.id)
  )

  if (!phase) return agentRecipes

  return agentRecipes.filter((r) => r.oraclePhases.includes(phase))
}

const ROLE_TO_COOKBOOK_NAME: Record<string, string> = {
  context_gatherer: 'Context Gatherer',
  decomposer: 'Decomposer',
  systems_mapper: 'Systems Mapper',
  verifier: 'Verifier',
  scanner: 'Scanner',
  impact_assessor: 'Impact Assessor',
  weak_signal_hunter: 'Weak Signal Hunter',
  scenario_developer: 'Scenario Developer',
  equilibrium_analyst: 'Equilibrium Analyst',
  red_team: 'Red Team',
  gate_evaluator: 'Gate Evaluator',
  consistency_checker: 'Consistency Checker',
}

/** Get a technique by its ID (e.g. "T01", "T12") */
export function getTechniqueById(id: string): LoadedTechnique | undefined {
  ensureLoaded()
  return techniqueById.get(id)
}

/** Get all techniques referenced by a recipe */
export function getTechniquesForRecipe(recipeId: string): LoadedTechnique[] {
  ensureLoaded()
  const recipe = recipeById.get(recipeId)
  if (!recipe) return []
  return recipe.techniques
    .map((tId) => techniqueById.get(tId))
    .filter((t): t is LoadedTechnique => t !== undefined)
}

/** Get an axiom by its ID (e.g. "AXM-001") */
export function getAxiomById(id: string): LoadedAxiom | undefined {
  ensureLoaded()
  return axiomById.get(id)
}

/** Get multiple axioms by their IDs */
export function getAxiomsByIds(ids: string[]): LoadedAxiom[] {
  ensureLoaded()
  return ids.map((id) => axiomById.get(id)).filter((a): a is LoadedAxiom => a !== undefined)
}

/** Get all axioms with system elevations */
export function getSystemElevations(): LoadedAxiom[] {
  ensureLoaded()
  return [...systemElevations]
}

/** Get recipe IDs that use a specific axiom */
export function getRecipesUsingAxiom(axiomId: string): string[] {
  ensureLoaded()
  return axiomToRecipes.get(axiomId) ?? []
}

/** Get all axioms in a domain */
export function getAxiomsByDomain(domain: string): LoadedAxiom[] {
  ensureLoaded()
  return axiomsByDomain.get(domain) ?? []
}

/**
 * Build a compact prompt fragment for a recipe, including its axiom sequence,
 * techniques, and traps. Used by prompt builders.
 */
export function formatRecipeForPrompt(recipe: LoadedRecipe): string {
  const lines: string[] = [
    `## Recipe ${recipe.id}: ${recipe.name}`,
    `**Question:** ${recipe.question}`,
    `**When to use:** ${recipe.whenToUse}`,
    '',
    '### Steps:',
  ]

  for (const step of recipe.axiomSequence) {
    lines.push(`${step.step}. **${step.action}** [${step.axioms.join(', ')}]`)
    lines.push(`   ${step.instruction}`)
  }

  if (recipe.traps.length > 0) {
    lines.push('')
    lines.push('### Traps to Avoid:')
    for (const trap of recipe.traps) {
      lines.push(`- **Trap:** ${trap.trap}`)
      lines.push(`  **Antidote:** ${trap.antidote}`)
    }
  }

  // Omit outputTemplate — prompt's own JSON schema is authoritative
  return lines.join('\n')
}

/**
 * Build a compact prompt fragment for a technique.
 */
export function formatTechniqueForPrompt(technique: LoadedTechnique): string {
  const lines: string[] = [
    `## Technique ${technique.id}: ${technique.name}`,
    technique.description,
    '',
    '**Common errors:**',
    ...technique.commonErrors.map((e) => `- ${e}`),
    '',
    `**Output format:** ${technique.output}`,
  ]

  return lines.join('\n')
}

/**
 * Build a compact prompt fragment for an axiom definition.
 */
export function formatAxiomForPrompt(axiom: LoadedAxiom): string {
  const lines: string[] = [
    `**${axiom.id} — ${axiom.name}** (${axiom.domain})`,
    axiom.formalDefinition,
  ]

  if (axiom.mathematicalFormulation) {
    lines.push(`Formula: ${axiom.mathematicalFormulation}`)
  }

  if (axiom.boundaryConditions.length > 0) {
    lines.push(`Boundary conditions: ${axiom.boundaryConditions.join('; ')}`)
  }

  return lines.join('\n')
}
