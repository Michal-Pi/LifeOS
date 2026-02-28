import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { Note } from '@lifeos/notes'

// --- Mocks ---

const mockUseNoteOperations = vi.fn()
vi.mock('@/hooks/useNoteOperations', () => ({
  useNoteOperations: (...args: unknown[]) => mockUseNoteOperations(...args),
}))

vi.mock('@/hooks/useTopics', () => ({
  useTopics: () => ({
    topics: [
      {
        topicId: 'topic-1',
        name: 'My Project',
        userId: 'u1',
        parentTopicId: null,
        order: 0,
        createdAtMs: 1000,
        updatedAtMs: 2000,
      },
    ],
    createTopic: vi.fn(),
    deleteTopic: vi.fn(),
  }),
}))

vi.mock('@/hooks/useNoteSync', () => ({
  useNoteSync: () => ({
    isOnline: true,
    lastSyncMs: null,
    stats: null,
    triggerSync: vi.fn(),
  }),
}))

vi.mock('@/hooks/useNoteMetadataCache', () => ({
  useNoteMetadataCache: vi.fn(),
}))

vi.mock('@/hooks/useSections', () => ({
  useSections: () => ({
    sections: [],
    createSection: vi.fn(),
    deleteSection: vi.fn(),
  }),
}))

vi.mock('@/hooks/usePinnedNotes', () => ({
  usePinnedNotes: () => ({
    pinnedIds: new Set(),
    togglePin: vi.fn(),
    isPinned: () => false,
  }),
}))

vi.mock('@/contexts/useDialog', () => ({
  useDialog: () => ({
    confirm: vi.fn().mockResolvedValue(true),
  }),
}))

vi.mock('@/components/notes/NoteSyncStatus', () => ({
  SyncStatusBanner: () => null,
}))

vi.mock('@/components/editor', () => ({
  NoteEditor: () => <div data-testid="note-editor">Editor</div>,
}))

vi.mock('@/components/notes/ProjectLinker', () => ({
  ProjectLinker: () => null,
}))

vi.mock('@/components/notes/OKRLinker', () => ({
  OKRLinker: () => null,
}))

vi.mock('@/components/notes/ImportModal', () => ({
  ImportModal: () => null,
}))

vi.mock('@/components/notes/AIToolsDropdown', () => ({
  AIToolsDropdown: () => null,
}))

vi.mock('@/components/notes/ExportMenu', () => ({
  ExportMenu: () => null,
}))

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    noteId: 'note-1' as Note['noteId'],
    userId: 'u1',
    title: 'Test Note',
    content: {},
    contentHtml: undefined,
    topicId: null,
    sectionId: null,
    projectIds: [],
    okrIds: [],
    tags: [],
    linkedNoteIds: [],
    backlinkNoteIds: [],
    mentionedNoteIds: [],
    createdAtMs: 1000,
    updatedAtMs: Date.now() - 2 * 60 * 60 * 1000,
    lastAccessedAtMs: 2000,
    archived: false,
    syncState: 'synced' as const,
    version: 1,
    attachmentIds: [],
    ...overrides,
  } as Note
}

function defaultOpsReturn(note: Note | null, notes: Note[] = note ? [note] : []) {
  return {
    notes,
    currentNote: note,
    createNote: vi.fn(),
    setCurrentNote: vi.fn(),
    saveNoteContent: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    listNotes: vi.fn(),
    updateProjectLinks: vi.fn(),
    updateOKRLinks: vi.fn(),
    updateAttachments: vi.fn(),
    updateTags: vi.fn(),
  }
}

// Lazy-import NotesPage so mocks are applied
let NotesPage: React.ComponentType
beforeEach(async () => {
  vi.clearAllMocks()
  mockUseNoteOperations.mockReturnValue(defaultOpsReturn(null))
  const mod = await import('@/pages/NotesPage')
  NotesPage = mod.NotesPage
})

function renderPage() {
  return render(
    <MemoryRouter>
      <NotesPage />
    </MemoryRouter>
  )
}

describe('Note Metadata Bar', () => {
  it('shows word count for current note', () => {
    const note = makeNote({ contentHtml: '<p>This is a test note</p>' })
    mockUseNoteOperations.mockReturnValue(defaultOpsReturn(note))

    renderPage()
    expect(screen.getByText('5 words')).toBeTruthy()
  })

  it('renders tags as chips', () => {
    const note = makeNote({ tags: ['react', 'typescript', 'testing'] })
    mockUseNoteOperations.mockReturnValue(defaultOpsReturn(note))

    renderPage()
    expect(screen.getByText('react')).toBeTruthy()
    expect(screen.getByText('typescript')).toBeTruthy()
    expect(screen.getByText('testing')).toBeTruthy()
  })

  it('shows relative edit date', () => {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
    const note = makeNote({ updatedAtMs: twoHoursAgo })
    mockUseNoteOperations.mockReturnValue(defaultOpsReturn(note))

    renderPage()
    expect(screen.getByText(/2 hours ago/)).toBeTruthy()
  })

  it('shows project name when note has a topic', () => {
    const note = makeNote({ topicId: 'topic-1' as Note['topicId'] })
    mockUseNoteOperations.mockReturnValue(defaultOpsReturn(note))

    const { container } = renderPage()
    const metaBar = container.querySelector('.note-meta-bar')
    expect(metaBar).toBeTruthy()
    const projectChip = metaBar!.querySelector('.note-meta-bar__project')
    expect(projectChip?.textContent).toBe('My Project')
  })
})
