import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PromptLibraryPage } from '../PromptLibraryPage'
import type { PromptTemplate } from '@lifeos/agents'

const mockTemplates: PromptTemplate[] = [
  {
    templateId: 'prompt-1',
    name: 'Research Summary',
    description: 'A short description for research.',
    type: 'agent',
    category: 'research',
    tags: ['research', 'summary'],
    content: 'Summarize the research.',
    variables: [],
    version: 1,
    usageCount: 5,
    createdAtMs: 0,
    updatedAtMs: 0,
  },
  {
    templateId: 'prompt-2',
    name: 'Content Writer',
    description:
      'This is a very long description that should be truncated because it exceeds the one hundred character limit set in the component for showing the expand button.',
    type: 'workflow',
    category: 'content-creation',
    tags: ['content', 'writing', 'blog', 'extra-tag'],
    content: 'Write content.',
    variables: [],
    version: 2,
    usageCount: 10,
    createdAtMs: 0,
    updatedAtMs: 0,
  },
]

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'user-1' } }),
}))

const mockLoadTemplates = vi.fn()
const mockDeleteTemplate = vi.fn()
const mockGetUsageStats = vi.fn().mockResolvedValue([])

vi.mock('@/hooks/usePromptLibrary', () => ({
  usePromptLibrary: () => ({
    templates: mockTemplates,
    loading: false,
    loadTemplates: mockLoadTemplates,
    deleteTemplate: mockDeleteTemplate,
    getUsageStats: mockGetUsageStats,
  }),
}))

vi.mock('@/contexts/useDialog', () => ({
  useDialog: () => ({
    confirm: vi.fn().mockResolvedValue(true),
    alert: vi.fn(),
  }),
}))

vi.mock('@/components/agents/PromptEditor', () => ({
  PromptEditor: ({ mode }: { mode: string }) => (
    <div data-testid="prompt-editor">Editor mode: {mode}</div>
  ),
}))

vi.mock('@/components/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}))

vi.mock('@/components/SegmentedControl', () => ({
  SegmentedControl: () => <div data-testid="segmented-control" />,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/workflows/prompts']}>
      <PromptLibraryPage />
    </MemoryRouter>
  )
}

describe('PromptLibraryPage', () => {
  it('renders all type chips and category chips', () => {
    renderPage()
    expect(screen.getByText('All Types')).toBeInTheDocument()
    expect(screen.getByText('Agent')).toBeInTheDocument()
    expect(screen.getByText('Tool')).toBeInTheDocument()
    expect(screen.getByText('Workflow')).toBeInTheDocument()
    expect(screen.getByText('Synthesis')).toBeInTheDocument()
    expect(screen.getByText('Tone of Voice')).toBeInTheDocument()

    expect(screen.getByText('All Categories')).toBeInTheDocument()
    expect(screen.getByText('Project Mgmt')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
    expect(screen.getByText('Research')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Coordination')).toBeInTheDocument()
    expect(screen.getByText('General')).toBeInTheDocument()
  })

  it('applies active class when a filter chip is clicked', () => {
    renderPage()
    const researchChip = screen.getByText('Research')
    fireEvent.click(researchChip)
    expect(researchChip).toHaveClass('filter-chip--active')
  })

  it('filters prompts by search query', () => {
    renderPage()
    const searchInput = screen.getByPlaceholderText(
      'Search prompts by name, description, or tag...'
    )
    fireEvent.change(searchInput, { target: { value: 'Content Writer' } })
    expect(screen.getByText('Content Writer')).toBeInTheDocument()
    expect(screen.queryByText('Research Summary')).not.toBeInTheDocument()
  })

  it('shows card description with Show more for long descriptions', () => {
    renderPage()
    expect(screen.getByText('Show more')).toBeInTheDocument()
  })

  it('expands description when Show more is clicked', () => {
    renderPage()
    const showMoreButton = screen.getByText('Show more')
    fireEvent.click(showMoreButton)
    expect(screen.getByText('Show less')).toBeInTheDocument()
  })

  it('opens side panel when a card is clicked', () => {
    renderPage()
    const card = screen.getByText('Research Summary').closest('article')!
    fireEvent.click(card)
    expect(screen.getByTestId('prompt-editor')).toBeInTheDocument()
    expect(screen.getByText('Edit Prompt')).toBeInTheDocument()
  })

  it('closes side panel when close button is clicked', () => {
    renderPage()
    const card = screen.getByText('Research Summary').closest('article')!
    fireEvent.click(card)
    expect(screen.getByTestId('prompt-editor')).toBeInTheDocument()

    const closeButton = screen.getByLabelText('Close panel')
    fireEvent.click(closeButton)
    expect(screen.queryByTestId('prompt-editor')).not.toBeInTheDocument()
  })

  it('shows Use in Workflow button in edit mode', () => {
    renderPage()
    const card = screen.getByText('Research Summary').closest('article')!
    fireEvent.click(card)
    expect(screen.getByText('Use in Workflow')).toBeInTheDocument()
  })
})
