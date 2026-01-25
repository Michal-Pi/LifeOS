import { useEffect, useMemo } from 'react'
import type { ChangeEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { WorkspaceId } from '@lifeos/agents'
import { ResearchQueue } from '@/components/agents/ResearchQueue'
import { EmptyState } from '@/components/EmptyState'
import { useWorkspaceOperations } from '@/hooks/useWorkspaceOperations'

const WORKSPACE_PARAM = 'workspaceId'
const WORKSPACE_STORAGE_KEY = 'lifeos:lastResearchWorkspaceId'

export function ResearchPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { workspaces, isLoading, loadWorkspaces, error } = useWorkspaceOperations()

  useEffect(() => {
    void loadWorkspaces()
  }, [loadWorkspaces])

  const selectedWorkspaceId = useMemo<WorkspaceId | ''>(() => {
    if (workspaces.length === 0) return ''
    const paramId = searchParams.get(WORKSPACE_PARAM)
    const storedId =
      typeof window !== 'undefined' ? window.localStorage.getItem(WORKSPACE_STORAGE_KEY) : null
    const hasParamMatch =
      !!paramId && workspaces.some((workspace) => workspace.workspaceId === paramId)
    const hasStoredMatch =
      !!storedId && workspaces.some((workspace) => workspace.workspaceId === storedId)
    if (hasParamMatch) return paramId as WorkspaceId
    if (hasStoredMatch) return storedId as WorkspaceId
    return workspaces[0].workspaceId
  }, [searchParams, workspaces])

  useEffect(() => {
    if (!selectedWorkspaceId) return
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, selectedWorkspaceId)
    }
    const paramId = searchParams.get(WORKSPACE_PARAM)
    if (paramId !== selectedWorkspaceId) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set(WORKSPACE_PARAM, selectedWorkspaceId)
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, selectedWorkspaceId, setSearchParams])

  const selectedWorkspace = useMemo(
    () => workspaces.find((workspace) => workspace.workspaceId === selectedWorkspaceId) ?? null,
    [workspaces, selectedWorkspaceId]
  )

  const handleWorkspaceChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextId = event.target.value as WorkspaceId
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(WORKSPACE_STORAGE_KEY, nextId)
    }
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(WORKSPACE_PARAM, nextId)
    setSearchParams(nextParams)
  }

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Research</h1>
          <p>Track deep research requests, upload findings, and complete workflows.</p>
        </div>
        <button type="button" className="ghost-button" onClick={() => navigate('/workspaces')}>
          Manage workspaces
        </button>
      </header>

      {error && workspaces.length === 0 ? (
        <EmptyState
          label="Research"
          title="Unable to load workspaces"
          description="There was a problem fetching your workspaces."
          hint={error.message}
          actionLabel="Try again"
          onAction={() => void loadWorkspaces()}
        />
      ) : isLoading && workspaces.length === 0 ? (
        <div className="loading">Loading workspaces...</div>
      ) : workspaces.length === 0 ? (
        <EmptyState
          label="Research"
          title="No workspaces yet"
          description="Create a workspace to start collecting deep research requests."
          actionLabel="Create workspace"
          onAction={() => navigate('/workspaces')}
        />
      ) : (
        <>
          <div className="filters">
            <div>
              <label htmlFor="researchWorkspace">Workspace</label>
              <select
                id="researchWorkspace"
                value={selectedWorkspaceId}
                onChange={handleWorkspaceChange}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.workspaceId} value={workspace.workspaceId}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </div>
            {selectedWorkspace && (
              <div className="filter-summary">
                <strong>{selectedWorkspace.agentIds.length}</strong> agents ·{' '}
                <strong>{selectedWorkspace.workflowType}</strong> workflow
              </div>
            )}
            {selectedWorkspace && (
              <button
                type="button"
                className="ghost-button"
                onClick={() => navigate(`/workspaces/${selectedWorkspace.workspaceId}`)}
              >
                Open workspace
              </button>
            )}
          </div>

          {selectedWorkspaceId && (
            <div className="runs-section">
              <div className="section-header">
                <h2>Research Queue</h2>
                {selectedWorkspace?.description && (
                  <p className="section-subtitle">{selectedWorkspace.description}</p>
                )}
              </div>
              <ResearchQueue workspaceId={selectedWorkspaceId as WorkspaceId} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
