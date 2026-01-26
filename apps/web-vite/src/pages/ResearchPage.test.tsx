import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workspace } from '@lifeos/agents'
import { ResearchPage } from './ResearchPage'
import { useWorkspaceOperations } from '@/hooks/useWorkspaceOperations'

vi.mock('@/components/agents/ResearchQueue', () => ({
  ResearchQueue: ({ workspaceId }: { workspaceId: string }) => (
    <div data-testid="research-queue" data-workspace-id={workspaceId} />
  ),
}))

vi.mock('@/hooks/useWorkspaceOperations', () => ({
  useWorkspaceOperations: vi.fn(),
}))

const createWorkspace = (params: {
  workspaceId: string
  name: string
  workflowType: Workspace['workflowType']
  agentIds: string[]
}): Workspace =>
  ({
    workspaceId: params.workspaceId,
    userId: 'user-1',
    name: params.name,
    agentIds: params.agentIds,
    workflowType: params.workflowType,
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    syncState: 'synced',
    version: 1,
  }) as Workspace

describe('ResearchPage', () => {
  const mockUseWorkspaceOperations = vi.mocked(useWorkspaceOperations)

  beforeEach(() => {
    mockUseWorkspaceOperations.mockReturnValue({
      workspaces: [
        createWorkspace({
          workspaceId: 'ws-1',
          name: 'Alpha',
          workflowType: 'sequential',
          agentIds: ['agent-1'],
        }),
        createWorkspace({
          workspaceId: 'ws-2',
          name: 'Beta',
          workflowType: 'graph',
          agentIds: ['agent-1', 'agent-2'],
        }),
      ],
      isLoading: false,
      error: null,
      loadWorkspaces: vi.fn(),
      deleteWorkspace: vi.fn(),
      createWorkspace: vi.fn(),
      updateWorkspace: vi.fn(),
      getWorkspace: vi.fn(),
      listWorkspaces: vi.fn(),
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

  it('prefers persisted workspace when no query param is set', async () => {
    window.localStorage.setItem('lifeos:lastResearchWorkspaceId', 'ws-2')

    render(
      <MemoryRouter initialEntries={['/research']}>
        <ResearchPage />
      </MemoryRouter>
    )

    const select = await screen.findByLabelText('Workspace')
    expect(select).toHaveValue('ws-2')
    expect(screen.getByTestId('research-queue')).toHaveAttribute('data-workspace-id', 'ws-2')
  })

  it('updates persisted workspace when selection changes', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/research']}>
        <ResearchPage />
      </MemoryRouter>
    )

    const select = await screen.findByLabelText('Workspace')
    await user.selectOptions(select, 'ws-2')

    expect(window.localStorage.getItem('lifeos:lastResearchWorkspaceId')).toBe('ws-2')
    expect(screen.getByTestId('research-queue')).toHaveAttribute('data-workspace-id', 'ws-2')
  })
})
