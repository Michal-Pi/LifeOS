import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgenticWorkflowsPage } from '../AgenticWorkflowsPage'

// Mock hooks
vi.mock('@/hooks/useWorkflowOperations', () => ({
  useWorkflowOperations: () => ({
    workflows: [
      {
        workflowId: 'wf-1',
        name: 'Test Workflow',
        description: 'A test workflow',
        agentIds: ['agent-1'],
        defaultAgentId: 'agent-1',
        workflowType: 'sequential',
        maxIterations: 5,
        createdAtMs: 0,
        updatedAtMs: 0,
      },
    ],
    isLoading: false,
    loadWorkflows: vi.fn(),
    deleteWorkflow: vi.fn(),
    createWorkflow: vi.fn(),
  }),
}))

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

vi.mock('@/hooks/useWorkflowTemplateOperations', () => ({
  useWorkflowTemplateOperations: () => ({
    templates: [],
    isLoading: false,
    loadTemplates: vi.fn(),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  }),
}))

vi.mock('@/hooks/useAgentTemplateOperations', () => ({
  useAgentTemplateOperations: () => ({
    templates: [],
    isLoading: false,
    loadTemplates: vi.fn(),
    createTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
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
  workflowTemplatePresets: [],
}))

vi.mock('@/agents/contentTypePresets', () => ({
  contentTypePresets: [],
}))

vi.mock('@/services/templateInstantiation', () => ({
  instantiateTemplate: vi.fn(),
}))

// Mock child components
vi.mock('@/components/agents/WorkflowFormModal', () => ({
  WorkflowFormModal: () => null,
}))

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

vi.mock('@/components/agents/TemplateSelector', () => ({
  TemplateSelector: () => <div data-testid="template-selector" />,
}))

vi.mock('@/components/agents/PromptEditor', () => ({
  PromptEditor: () => <div data-testid="prompt-editor" />,
}))

vi.mock('@/hooks/usePromptLibrary', () => ({
  usePromptLibrary: () => ({
    templates: [],
    loading: false,
    createTemplate: vi.fn(),
  }),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user-1' } }),
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
    <MemoryRouter initialEntries={['/workflows']}>
      <AgenticWorkflowsPage />
    </MemoryRouter>
  )
}

describe('AgenticWorkflowsPage', () => {
  it('renders page title', () => {
    renderPage()
    expect(screen.getByText('Agentic Workflows')).toBeInTheDocument()
  })

  it('renders 4 tabs', () => {
    renderPage()
    expect(screen.getByText('Workflows')).toBeInTheDocument()
    expect(screen.getByText('Templates')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Tools')).toBeInTheDocument()
  })

  it('default tab is Workflows and shows workflow cards', () => {
    renderPage()
    expect(screen.getByText('Test Workflow')).toBeInTheDocument()
  })

  it('switching to Agents tab shows agent grid', () => {
    renderPage()
    const agentsTab = screen.getByText('Agents')
    fireEvent.click(agentsTab)
    expect(screen.getByTestId('agent-card')).toBeInTheDocument()
    expect(screen.getByText('Test Agent')).toBeInTheDocument()
  })

  it('switching to Templates tab shows template selector', () => {
    renderPage()
    const templatesTab = screen.getByText('Templates')
    fireEvent.click(templatesTab)
    expect(screen.getByTestId('template-selector')).toBeInTheDocument()
  })
})
