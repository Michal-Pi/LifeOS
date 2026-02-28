import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workflow } from '@lifeos/agents'
import { ResearchPage } from './ResearchPage'
import { useWorkflowOperations } from '@/hooks/useWorkflowOperations'

vi.mock('@/components/agents/ResearchQueue', () => ({
  ResearchQueue: ({ workflowId }: { workflowId: string }) => (
    <div data-testid="research-queue" data-workflow-id={workflowId} />
  ),
}))

vi.mock('@/hooks/useWorkflowOperations', () => ({
  useWorkflowOperations: vi.fn(),
}))

const createWorkflow = (params: {
  workflowId: string
  name: string
  workflowType: Workflow['workflowType']
  agentIds: string[]
}): Workflow =>
  ({
    workflowId: params.workflowId,
    userId: 'user-1',
    name: params.name,
    agentIds: params.agentIds,
    workflowType: params.workflowType,
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    syncState: 'synced',
    version: 1,
  }) as Workflow

describe('ResearchPage', () => {
  const mockUseWorkflowOperations = vi.mocked(useWorkflowOperations)

  beforeEach(() => {
    mockUseWorkflowOperations.mockReturnValue({
      workflows: [
        createWorkflow({
          workflowId: 'ws-1',
          name: 'Alpha',
          workflowType: 'sequential',
          agentIds: ['agent-1'],
        }),
        createWorkflow({
          workflowId: 'ws-2',
          name: 'Beta',
          workflowType: 'graph',
          agentIds: ['agent-1', 'agent-2'],
        }),
      ],
      isLoading: false,
      error: null,
      loadWorkflows: vi.fn(),
      deleteWorkflow: vi.fn(),
      createWorkflow: vi.fn(),
      updateWorkflow: vi.fn(),
      getWorkflow: vi.fn(),
      listWorkflows: vi.fn(),
      runs: [],
      createRun: vi.fn(),
      updateRun: vi.fn(),
      getRun: vi.fn(),
      listRuns: vi.fn(),
      deleteRun: vi.fn(),
      loadRuns: vi.fn(),
    })
    window.localStorage.clear()
  })

  it('prefers persisted workflow when no query param is set', async () => {
    window.localStorage.setItem('lifeos:lastResearchWorkflowId', 'ws-2')

    render(
      <MemoryRouter initialEntries={['/research']}>
        <ResearchPage />
      </MemoryRouter>
    )

    const select = await screen.findByLabelText('Workflow')
    expect(select).toHaveValue('ws-2')
    expect(screen.getByTestId('research-queue')).toHaveAttribute('data-workflow-id', 'ws-2')
  })

  it('updates persisted workflow when selection changes', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/research']}>
        <ResearchPage />
      </MemoryRouter>
    )

    const select = await screen.findByLabelText('Workflow')
    await user.selectOptions(select, 'ws-2')

    expect(window.localStorage.getItem('lifeos:lastResearchWorkflowId')).toBe('ws-2')
    expect(screen.getByTestId('research-queue')).toHaveAttribute('data-workflow-id', 'ws-2')
  })
})
