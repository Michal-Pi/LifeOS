import { useEffect, useMemo } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { WorkflowId } from '@lifeos/agents'
import { ResearchQueue } from '@/components/agents/ResearchQueue'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/EmptyState'
import { useWorkflowOperations } from '@/hooks/useWorkflowOperations'

const WORKFLOW_PARAM = 'workflowId'
const WORKFLOW_STORAGE_KEY = 'lifeos:lastResearchWorkflowId'

export function ResearchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { workflows, isLoading, loadWorkflows, error } = useWorkflowOperations()

  useEffect(() => {
    void loadWorkflows()
  }, [loadWorkflows])

  const selectedWorkflowId = useMemo<WorkflowId | ''>(() => {
    if (workflows.length === 0) return ''
    const paramId = searchParams.get(WORKFLOW_PARAM)
    const storedId =
      typeof window !== 'undefined' ? window.localStorage.getItem(WORKFLOW_STORAGE_KEY) : null
    const hasParamMatch = !!paramId && workflows.some((workflow) => workflow.workflowId === paramId)
    const hasStoredMatch =
      !!storedId && workflows.some((workflow) => workflow.workflowId === storedId)
    if (hasParamMatch) return paramId as WorkflowId
    if (hasStoredMatch) return storedId as WorkflowId
    return workflows[0].workflowId
  }, [searchParams, workflows])

  useEffect(() => {
    if (!selectedWorkflowId) return
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WORKFLOW_STORAGE_KEY, selectedWorkflowId)
    }
    const paramId = searchParams.get(WORKFLOW_PARAM)
    if (paramId !== selectedWorkflowId) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set(WORKFLOW_PARAM, selectedWorkflowId)
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, selectedWorkflowId, setSearchParams])

  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.workflowId === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId]
  )

  const handleWorkflowChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value as WorkflowId
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WORKFLOW_STORAGE_KEY, nextId)
    }
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(WORKFLOW_PARAM, nextId)
    setSearchParams(nextParams)
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Research</h1>
          <p>Track deep research requests, upload findings, and complete workflows.</p>
        </div>
        <Button variant="ghost" type="button" onClick={() => navigate('/workflows')}>
          Manage workflows
        </Button>
      </header>

      {error && workflows.length === 0 ? (
        <EmptyState
          label="Research"
          title="Unable to load workflows"
          description="There was a problem fetching your workflows."
          hint={error.message}
          actionLabel="Try again"
          onAction={() => void loadWorkflows()}
        />
      ) : isLoading && workflows.length === 0 ? (
        <div className="loading">Loading workflows...</div>
      ) : workflows.length === 0 ? (
        <EmptyState
          label="Research"
          title="No workflows yet"
          description="Create a workflow to start collecting deep research requests."
          actionLabel="Create workflow"
          onAction={() => navigate('/workflows')}
        />
      ) : (
        <>
          <div className="filters">
            <div>
              <label htmlFor="researchWorkflow">Workflow</label>
              <select
                id="researchWorkflow"
                value={selectedWorkflowId}
                onChange={handleWorkflowChange}
              >
                {workflows.map((workflow) => (
                  <option key={workflow.workflowId} value={workflow.workflowId}>
                    {workflow.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedWorkflow && (
              <div className="filter-summary">
                <strong>{selectedWorkflow.agentIds.length}</strong> agents ·{' '}
                <strong>{selectedWorkflow.workflowType}</strong> workflow
              </div>
            )}
            {selectedWorkflow && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => navigate(`/workflows/${selectedWorkflow.workflowId}`)}
              >
                Open workflow
              </Button>
            )}
          </div>

          {selectedWorkflowId && (
            <div className="runs-section">
              <div className="section-header">
                <h2>Research Queue</h2>
                {selectedWorkflow?.description && (
                  <p className="section-subtitle">{selectedWorkflow.description}</p>
                )}
              </div>
              <ResearchQueue workflowId={selectedWorkflowId as WorkflowId} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
