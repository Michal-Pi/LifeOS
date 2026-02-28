import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { CalendarSidebar } from '@/components/CalendarSidebar'
import type { CanonicalCalendarEvent } from '@lifeos/calendar'
import type { Contact, DunbarCircle } from '@lifeos/agents'
import type { CanonicalTask } from '@/types/todo'

// Mock modules that CalendarSidebar imports
vi.mock('@/components/AlertSelector', () => ({
  AlertSelector: () => <div data-testid="alert-selector" />,
}))
vi.mock('@/components/AttendeeList', () => ({
  AttendeeList: () => <div data-testid="attendee-list" />,
}))
vi.mock('@/components/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => <div data-testid="empty-state">{title}</div>,
}))
vi.mock('@/components/contacts/MeetingBriefingModal', () => ({
  MeetingBriefingModal: () => <div data-testid="briefing-modal" />,
}))

function makeEvent(overrides: Partial<CanonicalCalendarEvent> = {}): CanonicalCalendarEvent {
  return {
    canonicalEventId: 'evt-1',
    userId: 'user-1',
    calendarId: 'cal-1',
    title: 'Test Meeting',
    startMs: Date.now(),
    endMs: Date.now() + 3_600_000,
    startIso: new Date().toISOString(),
    endIso: new Date(Date.now() + 3_600_000).toISOString(),
    allDay: false,
    attendees: [],
    ...overrides,
  } as CanonicalCalendarEvent
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    contactId: 'c-1',
    userId: 'user-1',
    displayName: 'Alice Smith',
    circle: 1 as DunbarCircle,
    significance: 4,
    identifiers: { emails: ['alice@example.com'], phones: [] },
    tags: [],
    starred: false,
    archived: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    ...overrides,
  } as Contact
}

function makeTask(overrides: Partial<CanonicalTask> = {}): CanonicalTask {
  return {
    id: 'task-1',
    userId: 'user-1',
    title: 'Test Meeting',
    domain: 'work',
    importance: 'medium',
    status: 'todo',
    completed: false,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    calendarEventIds: ['evt-1'],
    ...overrides,
  } as CanonicalTask
}

const defaultProps = {
  selectedEvent: makeEvent(),
  isOnline: true,
  accountStatus: null,
  calendarsById: new Map(),
  onRSVP: vi.fn(),
  onAlertChange: vi.fn(),
  onRetryWriteback: vi.fn(),
  onConnectGoogle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('CalendarSidebar — Linked Contacts', () => {
  it('shows linked contacts when attendee emails match', () => {
    const event = makeEvent({
      attendees: [{ email: 'alice@example.com', displayName: 'Alice', responseStatus: 'accepted' }],
    })
    const contact = makeContact()

    renderWithRouter(
      <CalendarSidebar {...defaultProps} selectedEvent={event} contacts={[contact]} />
    )

    expect(screen.getByText('Linked Contacts')).toBeInTheDocument()
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('AS')).toBeInTheDocument() // initials
  })

  it('shows "Prepare for Meeting" button when contacts are linked', () => {
    const event = makeEvent({
      attendees: [{ email: 'alice@example.com', displayName: 'Alice', responseStatus: 'accepted' }],
    })
    const contact = makeContact()

    renderWithRouter(
      <CalendarSidebar {...defaultProps} selectedEvent={event} contacts={[contact]} />
    )

    expect(screen.getByText('Prepare for Meeting')).toBeInTheDocument()
  })

  it('hides contacts section when no attendee emails match', () => {
    const event = makeEvent({
      attendees: [
        { email: 'unknown@example.com', displayName: 'Unknown', responseStatus: 'needsAction' },
      ],
    })
    const contact = makeContact()

    renderWithRouter(
      <CalendarSidebar {...defaultProps} selectedEvent={event} contacts={[contact]} />
    )

    expect(screen.queryByText('Linked Contacts')).not.toBeInTheDocument()
    expect(screen.queryByText('Prepare for Meeting')).not.toBeInTheDocument()
  })

  it('hides contacts section when event has no attendees', () => {
    const event = makeEvent({ attendees: [] })
    const contact = makeContact()

    renderWithRouter(
      <CalendarSidebar {...defaultProps} selectedEvent={event} contacts={[contact]} />
    )

    expect(screen.queryByText('Linked Contacts')).not.toBeInTheDocument()
  })
})

describe('CalendarSidebar — Related Tasks', () => {
  it('shows related tasks linked via calendarEventIds', () => {
    const event = makeEvent()
    const task = makeTask()

    renderWithRouter(<CalendarSidebar {...defaultProps} selectedEvent={event} tasks={[task]} />)

    expect(screen.getByText('Related Tasks')).toBeInTheDocument()
    // The task title "Test Meeting" should appear in the task link
    expect(screen.getAllByText('Test Meeting').length).toBeGreaterThanOrEqual(2) // event title + task title
  })

  it('hides tasks section when no tasks match', () => {
    const event = makeEvent({ canonicalEventId: 'evt-other' })
    const task = makeTask({ calendarEventIds: ['evt-unrelated'], title: 'Unrelated task' })

    renderWithRouter(<CalendarSidebar {...defaultProps} selectedEvent={event} tasks={[task]} />)

    expect(screen.queryByText('Related Tasks')).not.toBeInTheDocument()
  })
})
