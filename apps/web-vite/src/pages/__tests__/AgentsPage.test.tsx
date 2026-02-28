import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentsPage } from '../AgentsPage'

// Mock hooks
vi.mock('@/hooks/useAgentOperations', () => ({
  useAgentOperations: () => ({
    agents: [
      {
        agentId: 'agent-1',
        name: 'Test Agent',
        role: 'planner',
        systemPrompt: 'You are a planner.',
        modelProvider: 'openai',
        modelName: 'gpt-5.2',
        temperature: 0.7,
        maxTokens: 2000,
        createdAtMs: 0,
        updatedAtMs: 0,
      },
    ],
    isLoading: false,
    loadAgents: vi.fn(),
    deleteAgent: vi.fn(),
    createAgent: vi.fn(),
    updateAgent: vi.fn(),
  }),
}))

vi.mock('@/hooks/useAgentTemplateOperations', () => ({
  useAgentTemplateOperations: () => ({
    templates: [
      {
        templateId: 'tmpl-1',
        name: 'Template A',
        description: 'A test template',
        agentConfig: {
          role: 'researcher',
          modelProvider: 'anthropic',
          modelName: 'claude-sonnet-4-5',
          toolIds: [],
        },
        createdAtMs: 0,
        updatedAtMs: 0,
      },
    ],
    isLoading: false,
    loadTemplates: vi.fn(),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  }),
}))

vi.mock('@/hooks/useToolOperations', () => ({
  useToolOperations: () => ({
    tools: [],
    isLoading: false,
    loadTools: vi.fn(),
    createTool: vi.fn(),
    updateTool: vi.fn(),
    deleteTool: vi.fn(),
  }),
}))

vi.mock('@/contexts/useDialog', () => ({
  useDialog: () => ({
    confirm: vi.fn(),
    alert: vi.fn(),
  }),
}))

vi.mock('@/agents/builtinTools', () => ({
  builtinTools: [],
}))

vi.mock('@/agents/templatePresets', () => ({
  agentTemplatePresets: [],
}))

// Mock child components
vi.mock('@/components/agents/AgentBuilderModal', () => ({
  AgentBuilderModal: () => null,
}))

vi.mock('@/components/agents/ToolBuilderModal', () => ({
  ToolBuilderModal: () => null,
}))

vi.mock('@/components/agents/TemplateSaveModal', () => ({
  TemplateSaveModal: () => null,
}))

vi.mock('@/components/agents/AgentCard', () => ({
  AgentCard: ({ agent }: { agent: { name: string } }) => (
    <div data-testid="agent-card">{agent.name}</div>
  ),
}))

vi.mock('@/components/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}))

vi.mock('@/components/SegmentedControl', () => ({
  SegmentedControl: () => <div data-testid="segmented-control" />,
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/agents']}>
      <AgentsPage />
    </MemoryRouter>
  )
}

describe('AgentsPage', () => {
  it('renders 3 tabs', () => {
    renderPage()
    expect(screen.getByText(/My Agents/)).toBeInTheDocument()
    expect(screen.getByText(/Templates/)).toBeInTheDocument()
    expect(screen.getByText(/Tools/)).toBeInTheDocument()
  })

  it('default tab is agents and shows agent grid', () => {
    renderPage()
    expect(screen.getByTestId('agent-card')).toBeInTheDocument()
    expect(screen.getByText('Test Agent')).toBeInTheDocument()
  })

  it('switching to Templates tab shows template grid', () => {
    renderPage()
    const templatesTab = screen.getByText(/Templates/).closest('button')!
    fireEvent.click(templatesTab)
    expect(screen.getByText('Template A')).toBeInTheDocument()
  })
})
