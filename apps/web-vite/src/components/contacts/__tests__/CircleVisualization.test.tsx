import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { CircleVisualization } from '../CircleVisualization'
import type { Contact, DunbarCircle } from '@lifeos/agents'

function makeContact(circle: DunbarCircle, id: string): Contact {
  return {
    contactId: id as Contact['contactId'],
    userId: 'u1',
    displayName: `Contact ${id}`,
    circle,
    significance: 5 - circle,
    identifiers: { emails: [], phones: [] },
    tags: [],
    sources: ['manual'],
    archived: false,
    starred: false,
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
  }
}

const contacts: Contact[] = [
  makeContact(0, 'c1'),
  makeContact(0, 'c2'),
  makeContact(1, 'c3'),
  makeContact(2, 'c4'),
  makeContact(2, 'c5'),
  makeContact(2, 'c6'),
  makeContact(3, 'c7'),
  makeContact(4, 'c8'),
]

describe('CircleVisualization', () => {
  it('renders all 5 circles', () => {
    render(
      <CircleVisualization contacts={contacts} selectedCircle={null} onSelectCircle={() => {}} />
    )
    expect(screen.getByText('Core')).toBeInTheDocument()
    expect(screen.getByText('Inner')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Extended')).toBeInTheDocument()
    expect(screen.getByText('Acquaintance')).toBeInTheDocument()
  })

  it('shows correct contact counts', () => {
    render(
      <CircleVisualization contacts={contacts} selectedCircle={null} onSelectCircle={() => {}} />
    )
    // Core has 2, Inner has 1, Active has 3, Extended has 1, Acquaintance has 1
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    // Two counts of '1' — Inner, Extended, and Acquaintance
    const ones = screen.getAllByText('1')
    expect(ones.length).toBe(3)
  })

  it('calls onSelectCircle when clicking a circle', () => {
    const onSelect = vi.fn()
    render(
      <CircleVisualization contacts={contacts} selectedCircle={null} onSelectCircle={onSelect} />
    )
    fireEvent.click(screen.getByText('Core'))
    expect(onSelect).toHaveBeenCalledWith(0)
  })

  it('"All" button shows total count', () => {
    render(
      <CircleVisualization contacts={contacts} selectedCircle={null} onSelectCircle={() => {}} />
    )
    expect(screen.getByText(`All (${contacts.length})`)).toBeInTheDocument()
  })

  it('applies active class to selected circle', () => {
    const { container } = render(
      <CircleVisualization contacts={contacts} selectedCircle={0} onSelectCircle={() => {}} />
    )
    const activeRing = container.querySelector('.circle-viz__ring--active')
    expect(activeRing).toBeInTheDocument()
    expect(activeRing?.classList.contains('circle-viz__ring--0')).toBe(true)
  })
})
