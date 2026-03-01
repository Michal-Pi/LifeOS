import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from '../SettingsPage'

// Mock auth
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: 'test-user' } }),
}))

// Mock theme
vi.mock('@/contexts/useTheme', () => ({
  useTheme: () => ({
    mode: 'dark',
    autoMode: 'system',
    schedule: { start: '', end: '' },
    setMode: vi.fn(),
    setAutoMode: vi.fn(),
    setSchedule: vi.fn(),
  }),
}))

// Mock AI provider keys
const mockProviderKeys = {
  openaiKey: 'sk-test-openai-key-1234',
  anthropicKey: null,
  googleKey: 'AI-test-google-key-5678',
  xaiKey: null,
}
vi.mock('@/hooks/useAiProviderKeys', () => ({
  useAiProviderKeys: () => ({
    keys: mockProviderKeys,
    isLoading: false,
    error: null,
    saveKey: vi.fn(),
    removeKey: vi.fn(),
  }),
}))

// Mock search tool keys
vi.mock('@/hooks/useSearchToolKeys', () => ({
  useSearchToolKeys: () => ({
    keys: { serperKey: 'serper-key-abcd', firecrawlKey: null, exaKey: null, jinaKey: null },
    isLoading: false,
    saveKey: vi.fn(),
    removeKey: vi.fn(),
  }),
}))

// Mock agent memory settings
vi.mock('@/hooks/useAgentMemorySettings', () => ({
  useAgentMemorySettings: () => ({
    settings: { memoryMessageLimit: 50 },
    isLoading: false,
    error: null,
    saveMemoryLimit: vi.fn(),
    clearMemoryLimit: vi.fn(),
  }),
}))

// Mock callables
vi.mock('@/lib/callables', () => ({
  testSearchToolKey: vi.fn().mockResolvedValue({ data: { ok: true, message: 'OK' } }),
}))

// Mock quote repository
vi.mock('@/adapters/firestoreQuoteRepository', () => ({
  createFirestoreQuoteRepository: () => ({
    getQuotesPaginated: vi.fn().mockResolvedValue({ quotes: [], total: 0 }),
    saveQuotes: vi.fn(),
    addQuote: vi.fn(),
    updateQuote: vi.fn(),
    deleteQuote: vi.fn(),
  }),
}))

vi.mock('@lifeos/core', () => ({
  createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
  getDefaultQuotes: () => [{ text: 'Default quote', author: 'Author' }],
}))

// Mock child components
vi.mock('@/components/SystemStatus', () => ({
  SystemStatus: () => <div data-testid="system-status">SystemStatus</div>,
}))

vi.mock('@/components/CalendarSettingsPanel', () => ({
  CalendarSettingsPanel: () => <div data-testid="calendar-settings">CalendarSettings</div>,
}))

vi.mock('@/components/settings/ChannelConnectionsPanel', () => ({
  ChannelConnectionsPanel: () => <div data-testid="channel-connections">ChannelConnections</div>,
}))

vi.mock('@/components/EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state">EmptyState</div>,
}))

vi.mock('@/components/StatusDot', () => ({
  StatusDot: () => <span data-testid="status-dot" />,
}))

vi.mock('@/components/Menu', () => ({
  Menu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) => (
    <button type="button" onClick={onSelect}>
      {children}
    </button>
  ),
}))

vi.mock('@/components/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}))

vi.mock('@/components/SegmentedControl', () => ({
  SegmentedControl: () => <div data-testid="segmented-control">SegmentedControl</div>,
}))

// Mock IntersectionObserver
const mockObserve = vi.fn()
const mockDisconnect = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  window.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: mockObserve,
    disconnect: mockDisconnect,
    unobserve: vi.fn(),
  }))
})

function renderPage() {
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>
  )
}

describe('SettingsPage', () => {
  it('renders sidebar with 8 navigation links', () => {
    renderPage()
    const sidebar = document.querySelector('.settings-sidebar')
    expect(sidebar).toBeInTheDocument()
    const links = sidebar!.querySelectorAll('.settings-sidebar__link')
    expect(links).toHaveLength(8)
    expect(links[0].textContent).toBe('General')
    expect(links[1].textContent).toBe('AI Providers')
    expect(links[2].textContent).toBe('Search Tools')
    expect(links[3].textContent).toBe('Calendar')
    expect(links[4].textContent).toBe('Scheduling')
    expect(links[5].textContent).toBe('Channels')
    expect(links[6].textContent).toBe('Quotes')
    expect(links[7].textContent).toBe('System')
  })

  it('highlights active section in sidebar', () => {
    renderPage()
    // Default active section is 'general'
    const links = document.querySelectorAll('.settings-sidebar__link')
    expect(links[0]).toHaveClass('settings-sidebar__link--active')
  })

  it('calls scrollIntoView when clicking a sidebar link', () => {
    renderPage()
    const scrollIntoView = vi.fn()
    const target = document.getElementById('ai-providers')
    if (target) {
      target.scrollIntoView = scrollIntoView
    }

    const links = document.querySelectorAll('.settings-sidebar__link')
    fireEvent.click(links[1]) // Click "AI Providers"

    // The scrollTo handler calls scrollIntoView
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('shows masked API key with last 4 characters visible', () => {
    renderPage()
    // OpenAI key is set to 'sk-test-openai-key-1234'
    // Masked format: ••••••••1234
    expect(screen.getByText('••••••••1234')).toBeInTheDocument()
  })

  it('reveals full key when Reveal button is clicked', () => {
    renderPage()
    // Find the first Reveal button
    const revealButtons = screen.getAllByText('Reveal')
    expect(revealButtons.length).toBeGreaterThan(0)

    fireEvent.click(revealButtons[0])

    // Now the full key should be visible
    expect(screen.getByText('sk-test-openai-key-1234')).toBeInTheDocument()
    // Button should now say "Hide"
    expect(screen.getByText('Hide')).toBeInTheDocument()
  })

  it('shows "Not configured" for keys that are not set', () => {
    renderPage()
    const notConfigured = screen.getAllByText('Not configured')
    // Anthropic and xAI are not set for providers, firecrawl/exa/jina for search tools
    expect(notConfigured.length).toBe(5)
  })

  it('renders all 7 sections with correct IDs', () => {
    renderPage()
    expect(document.getElementById('general')).toBeInTheDocument()
    expect(document.getElementById('ai-providers')).toBeInTheDocument()
    expect(document.getElementById('search-tools')).toBeInTheDocument()
    expect(document.getElementById('calendar')).toBeInTheDocument()
    expect(document.getElementById('channels')).toBeInTheDocument()
    expect(document.getElementById('quotes')).toBeInTheDocument()
    expect(document.getElementById('system')).toBeInTheDocument()
  })

  it('renders child panels in correct sections', () => {
    renderPage()
    expect(screen.getByTestId('calendar-settings')).toBeInTheDocument()
    expect(screen.getByTestId('channel-connections')).toBeInTheDocument()
    expect(screen.getByTestId('system-status')).toBeInTheDocument()
  })

  it('sets up IntersectionObserver for scroll-spy', () => {
    renderPage()
    expect(window.IntersectionObserver).toHaveBeenCalled()
    // It should observe all section elements
    expect(mockObserve).toHaveBeenCalled()
  })
})
