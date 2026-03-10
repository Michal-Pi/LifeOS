import { render, screen, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentBuilderModal } from '../AgentBuilderModal'

// Mock hooks
const mockCreateAgent = vi.fn()
const mockUpdateAgent = vi.fn()
vi.mock('@/hooks/useAgentOperations', () => ({
  useAgentOperations: () => ({
    createAgent: mockCreateAgent,
    updateAgent: mockUpdateAgent,
  }),
}))

// Mock Select component to render a plain <select>
vi.mock('@/components/Select', () => ({
  Select: ({
    value,
    onChange,
    options,
    id,
  }: {
    value: string
    onChange: (v: string) => void
    options: { value: string; label: string }[]
    id?: string
  }) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('@lifeos/agents', () => ({
  MODEL_OPTIONS_BY_PROVIDER: {
    openai: [{ value: 'gpt-5.2', label: 'GPT-5.2' }],
    anthropic: [{ value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' }],
    google: [{ value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' }],
    xai: [{ value: 'grok-4-1-fast-non-reasoning', label: 'Grok 4.1 Fast' }],
  },
  hashAgentConfig: () => 'test-agent-hash',
}))

const defaultProps = {
  agent: null,
  isOpen: true,
  onClose: vi.fn(),
  onSave: vi.fn(),
  availableTools: [],
}

beforeEach(() => {
  vi.clearAllMocks()
})

function renderModal(props = {}) {
  return render(<AgentBuilderModal {...defaultProps} {...props} />)
}

describe('AgentBuilderWizard', () => {
  it('step 1 validation: empty name disables Next', () => {
    renderModal()
    const nextButton = screen.getByText('Next')
    expect(nextButton).toBeDisabled()
  })

  it('step navigation: fill step 1, click Next, step 2 visible', () => {
    renderModal()

    // Fill step 1 required fields
    fireEvent.change(screen.getByPlaceholderText('e.g., Workout Planner'), {
      target: { value: 'My Agent' },
    })
    fireEvent.change(screen.getByPlaceholderText('You are a helpful assistant that...'), {
      target: { value: 'You are a test agent.' },
    })

    // Next should now be enabled
    const nextButton = screen.getByText('Next')
    expect(nextButton).not.toBeDisabled()
    fireEvent.click(nextButton)

    // Step 2: should see model fields
    expect(screen.getByText('Temperature: 0.70')).toBeInTheDocument()
  })

  it('back button: on step 2, click Back, returns to step 1', () => {
    renderModal()

    // Fill step 1 and go to step 2
    fireEvent.change(screen.getByPlaceholderText('e.g., Workout Planner'), {
      target: { value: 'My Agent' },
    })
    fireEvent.change(screen.getByPlaceholderText('You are a helpful assistant that...'), {
      target: { value: 'You are a test agent.' },
    })
    fireEvent.click(screen.getByText('Next'))

    // Click Back
    fireEvent.click(screen.getByText('Back'))

    // Step 1 should be visible
    expect(screen.getByPlaceholderText('e.g., Workout Planner')).toBeInTheDocument()
  })

  it('review shows summary on step 3', () => {
    renderModal()

    // Fill step 1
    fireEvent.change(screen.getByPlaceholderText('e.g., Workout Planner'), {
      target: { value: 'Review Agent' },
    })
    fireEvent.change(screen.getByPlaceholderText('You are a helpful assistant that...'), {
      target: { value: 'A prompt for review.' },
    })
    fireEvent.click(screen.getByText('Next'))

    // Step 2: click Next
    fireEvent.click(screen.getByText('Next'))

    // Step 3: review should show configured values
    expect(screen.getByText('Review Agent')).toBeInTheDocument()
    expect(screen.getByText('A prompt for review.')).toBeInTheDocument()
    expect(screen.getByText('openai')).toBeInTheDocument()
    expect(screen.getByText('gpt-5.2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create Agent' })).toBeInTheDocument()
  })
})
