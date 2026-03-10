/**
 * AgenticWorkflowsPage — Unified page for workflows, templates, agents, and tools.
 *
 * Replaces the former separate WorkflowsPage and AgentsPage with a single
 * four-tab layout under "Agentic Workflows".
 */

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useWorkflowOperations } from '@/hooks/useWorkflowOperations'
import { useWorkflowTemplateOperations } from '@/hooks/useWorkflowTemplateOperations'
import { useAgentOperations } from '@/hooks/useAgentOperations'
import { useAgentTemplateOperations } from '@/hooks/useAgentTemplateOperations'
import { useToolOperations } from '@/hooks/useToolOperations'
import { WorkflowFormModal } from '@/components/agents/WorkflowFormModal'
import { AgentBuilderModal } from '@/components/agents/AgentBuilderModal'
import { ToolBuilderModal } from '@/components/agents/ToolBuilderModal'
import { TemplateSaveModal } from '@/components/agents/TemplateSaveModal'
import { WorkflowsTab } from '@/components/agentic/WorkflowsTab'
import { TemplatesTab } from '@/components/agentic/TemplatesTab'
import { AgentsTab } from '@/components/agentic/AgentsTab'
import { ToolsTab } from '@/components/agentic/ToolsTab'
import { EvalsTab } from '@/components/agentic/EvalsTab'
import { Button } from '@/components/ui/button'
import { builtinTools } from '@/agents/builtinTools'
import type { AgentConfig, Workflow, AgentTemplate, ToolDefinition } from '@lifeos/agents'

type AgenticTab = 'workflows' | 'templates' | 'agents' | 'tools' | 'evals'

export function AgenticWorkflowsPage() {
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<AgenticTab>(
    searchParams.get('tab') === 'evals' ? 'evals' : 'workflows'
  )

  useEffect(() => {
    if (searchParams.get('tab') === 'evals') {
      queueMicrotask(() => setActiveTab('evals'))
    }
  }, [searchParams])

  // Shared data hooks (called once, passed to tabs as needed)
  const {
    workflows,
    isLoading: workflowsLoading,
    loadWorkflows,
    deleteWorkflow,
    createWorkflow,
  } = useWorkflowOperations()
  const { agents, isLoading: agentsLoading, loadAgents, deleteAgent } = useAgentOperations()
  const {
    tools,
    isLoading: toolsLoading,
    loadTools,
    createTool,
    updateTool,
    deleteTool,
  } = useToolOperations()
  const { createTemplate: createWorkflowTemplate } = useWorkflowTemplateOperations()
  const { createTemplate: createAgentTemplate } = useAgentTemplateOperations()

  useEffect(() => {
    void loadWorkflows()
    void loadAgents()
    void loadTools()
  }, [loadWorkflows, loadAgents, loadTools])

  // ── Workflow modal state ──
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null)
  const [showWorkflowModal, setShowWorkflowModal] = useState(false)
  const [prefillWorkflow, setPrefillWorkflow] = useState<Partial<Workflow> | null>(null)
  const [templateSourceWorkflow, setTemplateSourceWorkflow] = useState<Workflow | null>(null)
  const [showWorkflowTemplateModal, setShowWorkflowTemplateModal] = useState(false)
  const [workflowTemplateModalKey, setWorkflowTemplateModalKey] = useState(0)

  const handleNewWorkflow = () => {
    setSelectedWorkflow(null)
    setPrefillWorkflow(null)
    setShowWorkflowModal(true)
  }

  const handleEditWorkflow = (workflow: Workflow) => {
    setSelectedWorkflow(workflow)
    setPrefillWorkflow(null)
    setShowWorkflowModal(true)
  }

  const handleWorkflowModalClose = () => {
    setShowWorkflowModal(false)
    setSelectedWorkflow(null)
    setPrefillWorkflow(null)
  }

  const handleWorkflowModalSave = () => {
    void loadWorkflows()
  }

  const handleSaveWorkflowTemplate = (workflow: Workflow) => {
    setTemplateSourceWorkflow(workflow)
    setWorkflowTemplateModalKey((prev) => prev + 1)
    setShowWorkflowTemplateModal(true)
  }

  const handleDeleteWorkflow = async (workflow: Workflow) => {
    try {
      await deleteWorkflow(workflow.workflowId)
    } catch (err) {
      console.error('Failed to delete workflow:', err)
    }
  }

  // ── Agent modal state ──
  const [selectedAgent, setSelectedAgent] = useState<AgentConfig | null>(null)
  const [showAgentModal, setShowAgentModal] = useState(false)
  const [agentModalKey, setAgentModalKey] = useState(0)
  const [prefillAgent, setPrefillAgent] = useState<Partial<AgentConfig> | null>(null)
  const [templateSourceAgent, setTemplateSourceAgent] = useState<AgentConfig | null>(null)
  const [showAgentTemplateModal, setShowAgentTemplateModal] = useState(false)
  const [agentTemplateModalKey, setAgentTemplateModalKey] = useState(0)

  const handleNewAgent = () => {
    setSelectedAgent(null)
    setPrefillAgent(null)
    setAgentModalKey((k) => k + 1)
    setShowAgentModal(true)
  }

  const handleEditAgent = (agent: AgentConfig) => {
    setSelectedAgent(agent)
    setPrefillAgent(null)
    setAgentModalKey((k) => k + 1)
    setShowAgentModal(true)
  }

  const handleAgentModalClose = () => {
    setShowAgentModal(false)
    setSelectedAgent(null)
    setPrefillAgent(null)
  }

  const handleAgentModalSave = () => {
    void loadAgents()
  }

  const handleSaveAgentTemplate = (agent: AgentConfig) => {
    setTemplateSourceAgent(agent)
    setAgentTemplateModalKey((prev) => prev + 1)
    setShowAgentTemplateModal(true)
  }

  const handleUseAgentTemplate = (template: AgentTemplate) => {
    setSelectedAgent(null)
    setPrefillAgent(template.agentConfig)
    setAgentModalKey((k) => k + 1)
    setShowAgentModal(true)
    setActiveTab('agents')
  }

  // ── Tool modal state ──
  const [selectedTool, setSelectedTool] = useState<ToolDefinition | null>(null)
  const [showToolModal, setShowToolModal] = useState(false)

  const handleNewTool = () => {
    setSelectedTool(null)
    setShowToolModal(true)
  }

  const handleEditTool = (tool: ToolDefinition) => {
    setSelectedTool(tool)
    setShowToolModal(true)
  }

  const handleToolModalClose = () => {
    setShowToolModal(false)
    setSelectedTool(null)
  }

  const handleToolSave = () => {
    void loadTools()
  }

  const availableTools = useMemo(() => [...builtinTools, ...tools], [tools])
  const existingToolNames = useMemo(() => availableTools.map((tool) => tool.name), [availableTools])

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <p className="section-label">Automation</p>
          <h1>Agentic Workflows</h1>
        </div>
        <div className="page-header__actions">
          {activeTab === 'workflows' && <Button onClick={handleNewWorkflow}>+ New Workflow</Button>}
          {activeTab === 'agents' && <Button onClick={handleNewAgent}>+ New Agent</Button>}
          {activeTab === 'tools' && <Button onClick={handleNewTool}>+ New Tool</Button>}
        </div>
      </header>

      {/* Unified tab bar */}
      <div className="section-tabs">
        <button
          type="button"
          className={`section-tab${activeTab === 'workflows' ? ' active' : ''}`}
          onClick={() => setActiveTab('workflows')}
        >
          Workflows
        </button>
        <button
          type="button"
          className={`section-tab${activeTab === 'templates' ? ' active' : ''}`}
          onClick={() => setActiveTab('templates')}
        >
          Templates
        </button>
        <button
          type="button"
          className={`section-tab${activeTab === 'agents' ? ' active' : ''}`}
          onClick={() => setActiveTab('agents')}
        >
          Agents
        </button>
        <button
          type="button"
          className={`section-tab${activeTab === 'tools' ? ' active' : ''}`}
          onClick={() => setActiveTab('tools')}
        >
          Tools
        </button>
        <button
          type="button"
          className={`section-tab${activeTab === 'evals' ? ' active' : ''}`}
          onClick={() => setActiveTab('evals')}
        >
          Evals
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'workflows' && (
        <WorkflowsTab
          workflows={workflows}
          agents={agents}
          isLoading={workflowsLoading}
          onNew={handleNewWorkflow}
          onEdit={handleEditWorkflow}
          onSaveTemplate={handleSaveWorkflowTemplate}
          onDelete={handleDeleteWorkflow}
        />
      )}

      {activeTab === 'templates' && (
        <TemplatesTab createWorkflow={createWorkflow} loadWorkflows={loadWorkflows} />
      )}

      {activeTab === 'agents' && (
        <AgentsTab
          agents={agents}
          workflows={workflows}
          isLoading={agentsLoading}
          onNew={handleNewAgent}
          onEdit={handleEditAgent}
          onSaveTemplate={handleSaveAgentTemplate}
          onDelete={(agentId) => void deleteAgent(agentId)}
          onUseAgentTemplate={handleUseAgentTemplate}
        />
      )}

      {activeTab === 'tools' && (
        <ToolsTab
          tools={tools}
          isLoading={toolsLoading}
          onNew={handleNewTool}
          onEdit={handleEditTool}
          onDelete={(toolId) => void deleteTool(toolId)}
        />
      )}

      {activeTab === 'evals' && <EvalsTab />}

      {/* ── Modals ── */}

      <WorkflowFormModal
        workflow={selectedWorkflow}
        isOpen={showWorkflowModal}
        onClose={handleWorkflowModalClose}
        onSave={handleWorkflowModalSave}
        prefill={prefillWorkflow ?? undefined}
      />

      <AgentBuilderModal
        key={agentModalKey}
        agent={selectedAgent}
        existingAgents={agents}
        isOpen={showAgentModal}
        onClose={handleAgentModalClose}
        onSave={handleAgentModalSave}
        availableTools={availableTools}
        prefill={prefillAgent ?? undefined}
      />

      <ToolBuilderModal
        tool={selectedTool}
        isOpen={showToolModal}
        onClose={handleToolModalClose}
        onSave={handleToolSave}
        onCreate={async (input) => {
          await createTool(input)
        }}
        onUpdate={async (toolId, updates) => {
          await updateTool(toolId, updates)
        }}
        existingNames={existingToolNames}
      />

      {/* Workflow template save modal */}
      <TemplateSaveModal
        key={`wf-${workflowTemplateModalKey}`}
        isOpen={showWorkflowTemplateModal}
        title="Save Workflow Template"
        initialName={templateSourceWorkflow?.name ?? ''}
        initialDescription={templateSourceWorkflow?.description}
        onClose={() => {
          setShowWorkflowTemplateModal(false)
          setTemplateSourceWorkflow(null)
        }}
        onSave={async (name, description) => {
          if (!templateSourceWorkflow) return
          const workflowConfig = {
            name: templateSourceWorkflow.name,
            description: templateSourceWorkflow.description,
            agentIds: templateSourceWorkflow.agentIds,
            defaultAgentId: templateSourceWorkflow.defaultAgentId,
            workflowType: templateSourceWorkflow.workflowType,
            maxIterations: templateSourceWorkflow.maxIterations,
            memoryMessageLimit: templateSourceWorkflow.memoryMessageLimit,
          }
          try {
            await createWorkflowTemplate({ name, description, workflowConfig })
          } catch {
            return
          }
          setShowWorkflowTemplateModal(false)
          setTemplateSourceWorkflow(null)
        }}
      />

      {/* Agent template save modal */}
      <TemplateSaveModal
        key={`ag-${agentTemplateModalKey}`}
        isOpen={showAgentTemplateModal}
        title="Save Agent Template"
        initialName={templateSourceAgent?.name ?? ''}
        initialDescription={templateSourceAgent?.description}
        onClose={() => {
          setShowAgentTemplateModal(false)
          setTemplateSourceAgent(null)
        }}
        onSave={async (name, description) => {
          if (!templateSourceAgent) return
          const agentConfig = {
            name: templateSourceAgent.name,
            role: templateSourceAgent.role,
            systemPrompt: templateSourceAgent.systemPrompt,
            modelProvider: templateSourceAgent.modelProvider,
            modelName: templateSourceAgent.modelName,
            temperature: templateSourceAgent.temperature,
            maxTokens: templateSourceAgent.maxTokens,
            description: templateSourceAgent.description,
            toolIds: templateSourceAgent.toolIds,
          }
          try {
            await createAgentTemplate({ name, description, agentConfig })
          } catch {
            return
          }
          setShowAgentTemplateModal(false)
          setTemplateSourceAgent(null)
        }}
      />
    </div>
  )
}
