import { render, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectSidebar } from '../ProjectSidebar'
import type { Note, Topic, Section } from '@lifeos/notes'

// --- Mocks ---

const mockTopics: Topic[] = [
  {
    topicId: 'topic-1' as Topic['topicId'],
    userId: 'u1',
    name: 'Project Alpha',
    parentTopicId: null,
    order: 0,
    createdAtMs: 1000,
    updatedAtMs: 2000,
  },
  {
    topicId: 'topic-2' as Topic['topicId'],
    userId: 'u1',
    name: 'Project Beta',
    parentTopicId: null,
    order: 1,
    createdAtMs: 1000,
    updatedAtMs: 3000,
  },
]

const mockSections: Section[] = [
  {
    sectionId: 'sec-1' as Section['sectionId'],
    userId: 'u1',
    topicId: 'topic-1' as Topic['topicId'],
    name: 'Chapter 1',
    order: 0,
    createdAtMs: 1000,
    updatedAtMs: 2000,
  },
]

vi.mock('@/hooks/useTopics', () => ({
  useTopics: () => ({
    topics: mockTopics,
    createTopic: vi.fn(),
    deleteTopic: vi.fn(),
  }),
}))

vi.mock('@/hooks/useSections', () => ({
  useSections: () => ({
    sections: mockSections,
    createSection: vi.fn(),
    deleteSection: vi.fn(),
  }),
}))

vi.mock('@/contexts/useDialog', () => ({
  useDialog: () => ({
    confirm: vi.fn().mockResolvedValue(true),
  }),
}))

// Track pinned state across tests
let pinnedSet = new Set<string>()
vi.mock('@/hooks/usePinnedNotes', () => ({
  usePinnedNotes: () => ({
    pinnedIds: pinnedSet,
    togglePin: vi.fn((id: string) => {
      if (pinnedSet.has(id)) {
        pinnedSet.delete(id)
      } else {
        pinnedSet.add(id)
      }
    }),
    isPinned: (id: string) => pinnedSet.has(id),
  }),
}))

vi.mock('@/notes/noteContent', () => ({
  stripHtml: (html: string | undefined) => (html ? html.replace(/<[^>]*>/g, '').trim() : ''),
}))

function makeNote(overrides: Partial<Note> & { noteId: string; title: string }): Note {
  return {
    userId: 'u1',
    content: {},
    contentHtml: '<p>Some content</p>',
    topicId: null,
    sectionId: null,
    projectIds: [],
    okrIds: [],
    tags: [],
    linkedNoteIds: [],
    backlinkNoteIds: [],
    mentionedNoteIds: [],
    createdAtMs: 1000,
    updatedAtMs: 2000,
    lastAccessedAtMs: 2000,
    archived: false,
    syncState: 'synced' as const,
    version: 1,
    attachmentIds: [],
    ...overrides,
  } as Note
}

const defaultProps = {
  selectedTopicId: null,
  selectedSectionId: null,
  selectedNoteId: null,
  searchQuery: '',
  onTopicSelect: vi.fn(),
  onSectionSelect: vi.fn(),
  onNoteSelect: vi.fn(),
  onNoteDelete: vi.fn(),
  onNoteDuplicate: vi.fn(),
  onCreateNote: vi.fn(),
  onSearchChange: vi.fn(),
}

describe('ProjectSidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pinnedSet = new Set()
  })

  it('renders pinned section at top when notes are pinned', () => {
    pinnedSet = new Set(['note-1'])
    const notes = [
      makeNote({ noteId: 'note-1', title: 'Pinned Note', topicId: 'topic-1' as Note['topicId'] }),
      makeNote({ noteId: 'note-2', title: 'Regular Note', topicId: 'topic-1' as Note['topicId'] }),
    ]

    const { container } = render(<ProjectSidebar {...defaultProps} notes={notes} />)

    const pinnedSection = container.querySelector('.sidebar-section--pinned')
    expect(pinnedSection).toBeTruthy()

    const pinnedLabel = container.querySelector('.sidebar-section--pinned .sidebar-section__label')
    expect(pinnedLabel?.textContent).toBe('Pinned')

    // Pinned section should appear before topic tree
    const tree = container.querySelector('.sidebar-tree')!
    const firstChild = tree.children[0]
    expect(firstChild.classList.contains('sidebar-section--pinned')).toBe(true)
  })

  it('does not render pinned section when no notes are pinned', () => {
    const notes = [
      makeNote({ noteId: 'note-1', title: 'Regular Note', topicId: 'topic-1' as Note['topicId'] }),
    ]

    const { container } = render(<ProjectSidebar {...defaultProps} notes={notes} />)
    expect(container.querySelector('.sidebar-section--pinned')).toBeNull()
  })

  it('renders unassigned notes after all projects', () => {
    const notes = [
      makeNote({ noteId: 'note-1', title: 'Assigned Note', topicId: 'topic-1' as Note['topicId'] }),
      makeNote({ noteId: 'note-2', title: 'Unassigned Note', topicId: null }),
    ]

    const { container } = render(<ProjectSidebar {...defaultProps} notes={notes} />)

    const tree = container.querySelector('.sidebar-tree')!
    const children = Array.from(tree.children)
    const lastChild = children[children.length - 1]
    expect(lastChild.classList.contains('sidebar-group--unassigned')).toBe(true)
    expect(lastChild.textContent).toContain('Unassigned')
    expect(lastChild.textContent).toContain('Unassigned Note')
  })

  it('sorts notes by last-edited (newest first) within a topic', () => {
    const notes = [
      makeNote({
        noteId: 'note-old',
        title: 'Old Note',
        topicId: 'topic-1' as Note['topicId'],
        updatedAtMs: 1000,
      }),
      makeNote({
        noteId: 'note-new',
        title: 'New Note',
        topicId: 'topic-1' as Note['topicId'],
        updatedAtMs: 5000,
      }),
      makeNote({
        noteId: 'note-mid',
        title: 'Mid Note',
        topicId: 'topic-1' as Note['topicId'],
        updatedAtMs: 3000,
      }),
    ]

    const { container } = render(
      <ProjectSidebar {...defaultProps} notes={notes} selectedTopicId="topic-1" />
    )

    // Find the note items within the expanded topic
    const noteRows = container.querySelectorAll('.sidebar-row.note')
    const titles = Array.from(noteRows).map((row) => row.querySelector('.row-label')?.textContent)

    expect(titles[0]).toBe('New Note')
    expect(titles[1]).toBe('Mid Note')
    expect(titles[2]).toBe('Old Note')
  })

  it('toggles topic expansion when chevron is clicked', () => {
    const notes = [
      makeNote({ noteId: 'note-1', title: 'Note A', topicId: 'topic-1' as Note['topicId'] }),
    ]

    const { container } = render(<ProjectSidebar {...defaultProps} notes={notes} />)

    // Initially collapsed (no selectedTopicId = topic-1)
    let topic = container.querySelector('.sidebar-topic') as HTMLDetailsElement
    expect(topic.open).toBe(false)

    // Click the chevron to expand
    const chevron = topic.querySelector('.chevron') as HTMLButtonElement
    fireEvent.click(chevron)

    // Should now be expanded
    topic = container.querySelector('.sidebar-topic') as HTMLDetailsElement
    expect(topic.open).toBe(true)
  })

  it('shows note count badge on topics', () => {
    const notes = [
      makeNote({ noteId: 'note-1', title: 'Note A', topicId: 'topic-1' as Note['topicId'] }),
      makeNote({ noteId: 'note-2', title: 'Note B', topicId: 'topic-1' as Note['topicId'] }),
      makeNote({ noteId: 'note-3', title: 'Note C', topicId: 'topic-2' as Note['topicId'] }),
    ]

    const { container } = render(<ProjectSidebar {...defaultProps} notes={notes} />)

    const counts = container.querySelectorAll('.sidebar-topic__count')
    expect(counts[0]?.textContent).toBe('2')
    expect(counts[1]?.textContent).toBe('1')
  })
})
