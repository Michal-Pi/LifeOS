import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InteractionTimeline } from '../InteractionTimeline'
import type { Interaction } from '@lifeos/agents'

function makeInteraction(id: string, type: Interaction['type'], daysAgo: number): Interaction {
  return {
    interactionId: id as Interaction['interactionId'],
    contactId: 'c1' as Interaction['contactId'],
    userId: 'u1',
    type,
    summary: `${type} interaction ${id}`,
    source: 'manual',
    occurredAtMs: Date.now() - daysAgo * 24 * 60 * 60 * 1000,
    createdAtMs: Date.now(),
  }
}

describe('InteractionTimeline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-27T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders timeline entries', () => {
    const interactions = [
      makeInteraction('i1', 'email', 1),
      makeInteraction('i2', 'meeting', 3),
      makeInteraction('i3', 'call', 7),
    ]
    const { container } = render(<InteractionTimeline interactions={interactions} />)
    const entries = container.querySelectorAll('.timeline-entry')
    expect(entries.length).toBe(3)
  })

  it('renders type-specific dot classes', () => {
    const interactions = [makeInteraction('i1', 'email', 1)]
    const { container } = render(<InteractionTimeline interactions={interactions} />)
    const dot = container.querySelector('.timeline-entry__dot--email')
    expect(dot).toBeInTheDocument()
  })

  it('renders entries in order', () => {
    const interactions = [
      makeInteraction('i1', 'email', 1),
      makeInteraction('i2', 'meeting', 3),
      makeInteraction('i3', 'note', 10),
    ]
    render(<InteractionTimeline interactions={interactions} />)
    const summaries = screen.getAllByText(/interaction/)
    expect(summaries[0].textContent).toBe('email interaction i1')
    expect(summaries[1].textContent).toBe('meeting interaction i2')
    expect(summaries[2].textContent).toBe('note interaction i3')
  })

  it('shows empty state when no interactions', () => {
    render(<InteractionTimeline interactions={[]} />)
    expect(screen.getByText('No interactions recorded yet.')).toBeInTheDocument()
  })

  it('renders connectors between entries but not after the last', () => {
    const interactions = [makeInteraction('i1', 'email', 1), makeInteraction('i2', 'meeting', 3)]
    const { container } = render(<InteractionTimeline interactions={interactions} />)
    const connectors = container.querySelectorAll('.timeline-entry__connector')
    // First entry has connector, second does not
    expect(connectors.length).toBe(1)
  })

  it('renders meeting insights when present', () => {
    const interactions: Interaction[] = [
      {
        ...makeInteraction('i1', 'meeting', 2),
        meetingInsights: ['Discussed Q1 goals', 'Action: follow up on proposal'],
      },
    ]
    render(<InteractionTimeline interactions={interactions} />)
    expect(screen.getByText('Discussed Q1 goals')).toBeInTheDocument()
    expect(screen.getByText('Action: follow up on proposal')).toBeInTheDocument()
  })
})
