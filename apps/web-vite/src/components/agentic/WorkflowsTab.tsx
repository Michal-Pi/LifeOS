/**
 * WorkflowsTab — Workflow list and CRUD operations.
 * Extracted from WorkflowsPage for the unified Agentic Workflows page.
 */

import { useNavigate } from 'react-router-dom'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useDialog } from '@/contexts/useDialog'
import type { Workflow, AgentConfig } from '@lifeos/agents'

export interface WorkflowsTabProps {
  workflows: Workflow[]
  agents: AgentConfig[]
  isLoading: boolean
  onNew: () => void
  onEdit: (workflow: Workflow) => void
  onSaveTemplate: (workflow: Workflow) => void
  onDelete: (workflow: Workflow) => void
}

export function WorkflowsTab({
  workflows,
  agents,
  isLoading,
  onNew,
  onEdit,
  onSaveTemplate,
  onDelete,
}: WorkflowsTabProps) {
  const { confirm } = useDialog()
  const navigate = useNavigate()

  const getAgentName = (agentId: string) => {
    const agent = agents.find((a) => a.agentId === agentId)
    return agent?.name ?? 'Unknown Agent'
  }

  const handleDelete = async (workflow: Workflow) => {
    const confirmed = await confirm({
      title: 'Delete workflow',
      description: `Are you sure you want to delete workflow "${workflow.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    })
    if (confirmed) {
      onDelete(workflow)
    }
  }

  if (isLoading) {
    return <div className="loading">Loading workflows...</div>
  }

  if (workflows.length === 0) {
    return (
      <EmptyState
        label="Workflows"
        title="System idle"
        description="Workflows orchestrate multiple agents to deliver complex outcomes."
        hint="Capability unlocked: multi-agent orchestration + shared memory."
        actionLabel="Create Workflow"
        onAction={onNew}
      >
        <div className="ghost-card-grid">
          <div className="ghost-card" />
          <div className="ghost-card" />
          <div className="ghost-card" />
        </div>
      </EmptyState>
    )
  }

  return (
    <div className="workflows-grid">
      {workflows.map((workflow) => (
        <div key={workflow.workflowId} className="workflow-card">
          <div className="card-header">
            <h3>{workflow.name}</h3>
            <span className="badge">{workflow.workflowType}</span>
          </div>

          {workflow.description && <p className="description">{workflow.description}</p>}

          <div className="card-meta">
            <div>
              <strong>Agents:</strong> {workflow.agentIds.length}
            </div>
            {workflow.maxIterations && (
              <div>
                <strong>Max Iterations:</strong> {workflow.maxIterations}
              </div>
            )}
          </div>

          <div className="agent-list">
            <strong>Team:</strong>
            <ul>
              {workflow.agentIds.map((agentId) => (
                <li key={agentId}>
                  {getAgentName(agentId)}
                  {workflow.defaultAgentId === agentId && (
                    <span className="badge-small">default</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="card-actions">
            <Button variant="ghost" onClick={() => navigate(`/workflows/${workflow.workflowId}`)}>
              View Details
            </Button>
            <Button variant="ghost" onClick={() => onEdit(workflow)}>
              Edit
            </Button>
            <Button variant="ghost" onClick={() => onSaveTemplate(workflow)}>
              Save Template
            </Button>
            <Button variant="ghost" className="danger" onClick={() => handleDelete(workflow)}>
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}
