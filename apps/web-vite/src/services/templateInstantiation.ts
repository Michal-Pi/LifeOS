import type { AgentConfig, CreateAgentInput, CreateWorkflowInput, Workflow } from '@lifeos/agents'
import type { WorkflowTemplatePreset, WorkflowGraphTemplate } from '@/agents/templatePresets'
import type { BuiltinToolMeta } from '@/agents/builtinTools'
import { agentTemplatePresets, type AgentTemplatePreset } from '@/agents/templatePresets'
import { applyContentTypeCustomization } from '@/services/contentTypeCustomizer'

type TemplateCustomization = {
  name?: string
  contentType?: string
}

export type AgentMatchResult = {
  templateName: string
  templateAgent: AgentTemplatePreset
  existingAgent: AgentConfig
  isExactMatch: boolean
}

export type AgentConflictResolution = 'reuse_existing' | 'create_from_template'

type InstantiateTemplateParams = {
  preset: WorkflowTemplatePreset
  customization?: TemplateCustomization
  existingAgents: AgentConfig[]
  createAgent: (input: CreateAgentInput) => Promise<AgentConfig>
  createWorkflow: (input: CreateWorkflowInput) => Promise<Workflow>
  availableTools: BuiltinToolMeta[]
  onAgentConflict?: (conflicts: AgentMatchResult[]) => Promise<Map<string, AgentConflictResolution>>
}

const resolveAgentTemplate = (name: string) => {
  const template = agentTemplatePresets.find((preset) => preset.name === name)
  if (!template) {
    throw new Error(`Agent template not found: ${name}`)
  }
  return template
}

/**
 * Check if an existing agent exactly matches a template agent config
 */
function isExactAgentMatch(existing: AgentConfig, templateConfig: CreateAgentInput): boolean {
  // Compare core properties that define the agent's behavior
  return (
    existing.name === templateConfig.name &&
    existing.role === templateConfig.role &&
    existing.systemPrompt === templateConfig.systemPrompt &&
    existing.modelProvider === templateConfig.modelProvider &&
    existing.modelName === templateConfig.modelName &&
    existing.temperature === templateConfig.temperature &&
    existing.maxTokens === templateConfig.maxTokens &&
    arraysEqual(existing.toolIds ?? [], templateConfig.toolIds ?? [])
  )
}

/**
 * Check if an existing agent has the same name as template (possible modified version)
 */
function findMatchingAgent(
  existingAgents: AgentConfig[],
  templateConfig: CreateAgentInput
): AgentConfig | undefined {
  return existingAgents.find((agent) => !agent.archived && agent.name === templateConfig.name)
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false
  const sortedA = [...a].sort()
  const sortedB = [...b].sort()
  return sortedA.every((val, idx) => val === sortedB[idx])
}

const buildWorkflowGraph = (
  template: WorkflowGraphTemplate | undefined,
  agentIdByTemplateName: Map<string, string>,
  workflowTemplateName: string
): Workflow['workflowGraph'] => {
  if (!template) return undefined

  return {
    version: template.version,
    startNodeId: template.startNodeId,
    nodes: template.nodes.map((node) => {
      const agentId = node.agentTemplateName
        ? agentIdByTemplateName.get(node.agentTemplateName)
        : undefined
      if (node.agentTemplateName && !agentId) {
        throw new Error(
          `Workflow graph node '${node.id}' references agent template '${node.agentTemplateName}' ` +
            `which is not in the workflow template '${workflowTemplateName}' agentTemplateNames list.`
        )
      }

      return {
        id: node.id,
        type: node.type,
        agentId,
        toolId: node.toolId,
        label: node.label,
        outputKey: node.outputKey,
        aggregationMode: node.aggregationMode,
        requestConfig: node.requestConfig,
      }
    }),
    edges: template.edges,
    limits: template.limits,
  }
}

export async function instantiateTemplate({
  preset,
  customization,
  existingAgents,
  createAgent,
  createWorkflow,
  availableTools,
  onAgentConflict,
}: InstantiateTemplateParams): Promise<{ workflow: Workflow; agents: AgentConfig[] }> {
  if (!preset.agentTemplateNames || preset.agentTemplateNames.length === 0) {
    throw new Error('Template does not define agent templates')
  }

  const agentSuffix = customization?.name ? ` - ${customization.name}` : ''
  const baseCustomization = Boolean(customization?.contentType && preset.supportsContentTypes)
  const availableToolIds = new Set(availableTools.map((tool) => tool.toolId))

  // First pass: build agent configs and find matches
  const templateAgentConfigs: Array<{
    templateName: string
    template: AgentTemplatePreset
    agentInput: CreateAgentInput
    existingMatch: AgentConfig | undefined
    isExactMatch: boolean
  }> = []

  for (const templateName of preset.agentTemplateNames) {
    const template = resolveAgentTemplate(templateName)
    const toolIds = template.agentConfig.toolIds ?? []
    const missingTools = toolIds.filter((toolId) => !availableToolIds.has(toolId))
    if (missingTools.length > 0) {
      throw new Error(
        `Workflow template '${preset.name}' references unavailable tool(s) for agent template ` +
          `'${template.name}': ${missingTools.join(', ')}`
      )
    }
    const shouldCustomize = baseCustomization && Boolean(template.supportsContentTypeCustomization)
    const systemPrompt = shouldCustomize
      ? applyContentTypeCustomization(
          template.agentConfig.systemPrompt,
          customization?.contentType ?? ''
        )
      : template.agentConfig.systemPrompt

    const agentInput: CreateAgentInput = {
      ...template.agentConfig,
      toolIds,
      systemPrompt,
      name: `${template.agentConfig.name}${agentSuffix}`,
    }

    const existingMatch = findMatchingAgent(existingAgents, agentInput)
    const isExactMatch = existingMatch ? isExactAgentMatch(existingMatch, agentInput) : false

    templateAgentConfigs.push({
      templateName,
      template,
      agentInput,
      existingMatch,
      isExactMatch,
    })
  }

  // Collect conflicts (modified agents that need user decision)
  const conflicts: AgentMatchResult[] = templateAgentConfigs
    .filter((config) => config.existingMatch && !config.isExactMatch)
    .map((config) => ({
      templateName: config.templateName,
      templateAgent: config.template,
      existingAgent: config.existingMatch!,
      isExactMatch: false,
    }))

  // Get resolution for conflicts if any
  let conflictResolutions = new Map<string, AgentConflictResolution>()
  if (conflicts.length > 0 && onAgentConflict) {
    conflictResolutions = await onAgentConflict(conflicts)
  }

  // Second pass: create or reuse agents based on matching and resolution
  const resultAgents: AgentConfig[] = []
  for (const config of templateAgentConfigs) {
    if (config.isExactMatch && config.existingMatch) {
      // Exact match - always reuse
      resultAgents.push(config.existingMatch)
    } else if (config.existingMatch && !config.isExactMatch) {
      // Modified agent - check resolution
      const resolution = conflictResolutions.get(config.templateName) ?? 'reuse_existing'
      if (resolution === 'reuse_existing') {
        resultAgents.push(config.existingMatch)
      } else {
        // Create new agent with a suffix to avoid name collision
        const agent = await createAgent({
          ...config.agentInput,
          name: `${config.agentInput.name} (Template)`,
        })
        resultAgents.push(agent)
      }
    } else {
      // No match - create new agent
      const agent = await createAgent(config.agentInput)
      resultAgents.push(agent)
    }
  }

  const agentIdByTemplateName = new Map(
    preset.agentTemplateNames.map((name, index) => [name, resultAgents[index]?.agentId])
  )

  const defaultAgentId = preset.defaultAgentTemplateName
    ? agentIdByTemplateName.get(preset.defaultAgentTemplateName)
    : resultAgents[0]?.agentId

  const workflowGraph = buildWorkflowGraph(
    preset.workflowGraphTemplate,
    agentIdByTemplateName,
    preset.name
  )

  const workflowInput: CreateWorkflowInput = {
    ...preset.workflowConfig,
    name: customization?.name ?? preset.workflowConfig.name,
    agentIds: resultAgents.map((agent) => agent.agentId),
    defaultAgentId,
    workflowGraph: workflowGraph ?? preset.workflowConfig.workflowGraph,
  }

  const workflow = await createWorkflow(workflowInput)
  return { workflow, agents: resultAgents }
}
