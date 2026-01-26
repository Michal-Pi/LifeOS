import type { AgentConfig, CreateAgentInput, CreateWorkspaceInput, Workspace } from '@lifeos/agents'
import type { WorkspaceTemplatePreset, WorkflowGraphTemplate } from '@/agents/templatePresets'
import type { BuiltinToolMeta } from '@/agents/builtinTools'
import { agentTemplatePresets } from '@/agents/templatePresets'
import { applyContentTypeCustomization } from '@/services/contentTypeCustomizer'

type TemplateCustomization = {
  name?: string
  contentType?: string
}

type InstantiateTemplateParams = {
  preset: WorkspaceTemplatePreset
  customization?: TemplateCustomization
  createAgent: (input: CreateAgentInput) => Promise<AgentConfig>
  createWorkspace: (input: CreateWorkspaceInput) => Promise<Workspace>
  availableTools: BuiltinToolMeta[]
}

const resolveAgentTemplate = (name: string) => {
  const template = agentTemplatePresets.find((preset) => preset.name === name)
  if (!template) {
    throw new Error(`Agent template not found: ${name}`)
  }
  return template
}

const buildWorkflowGraph = (
  template: WorkflowGraphTemplate | undefined,
  agentIdByTemplateName: Map<string, string>,
  workspaceTemplateName: string
): Workspace['workflowGraph'] => {
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
            `which is not in the workspace template '${workspaceTemplateName}' agentTemplateNames list.`
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
  createAgent,
  createWorkspace,
  availableTools,
}: InstantiateTemplateParams): Promise<{ workspace: Workspace; agents: AgentConfig[] }> {
  if (!preset.agentTemplateNames || preset.agentTemplateNames.length === 0) {
    throw new Error('Template does not define agent templates')
  }

  const agentSuffix = customization?.name ? ` - ${customization.name}` : ''
  const baseCustomization = Boolean(customization?.contentType && preset.supportsContentTypes)
  const availableToolIds = new Set(availableTools.map((tool) => tool.toolId))

  const createdAgents: AgentConfig[] = []
  for (const templateName of preset.agentTemplateNames) {
    const template = resolveAgentTemplate(templateName)
    const toolIds = template.agentConfig.toolIds ?? []
    const missingTools = toolIds.filter((toolId) => !availableToolIds.has(toolId))
    if (missingTools.length > 0) {
      throw new Error(
        `Workspace template '${preset.name}' references unavailable tool(s) for agent template ` +
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

    const agent = await createAgent(agentInput)
    createdAgents.push(agent)
  }

  const agentIdByTemplateName = new Map(
    preset.agentTemplateNames.map((name, index) => [name, createdAgents[index]?.agentId])
  )

  const defaultAgentId = preset.defaultAgentTemplateName
    ? agentIdByTemplateName.get(preset.defaultAgentTemplateName)
    : createdAgents[0]?.agentId

  const workflowGraph = buildWorkflowGraph(
    preset.workflowGraphTemplate,
    agentIdByTemplateName,
    preset.name
  )

  const workspaceInput: CreateWorkspaceInput = {
    ...preset.workspaceConfig,
    name: customization?.name ?? preset.workspaceConfig.name,
    agentIds: createdAgents.map((agent) => agent.agentId),
    defaultAgentId,
    workflowGraph: workflowGraph ?? preset.workspaceConfig.workflowGraph,
  }

  const workspace = await createWorkspace(workspaceInput)
  return { workspace, agents: createdAgents }
}
