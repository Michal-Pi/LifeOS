import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QuickEventCreate } from '../QuickEventCreate'

const defaultProps = {
  startTime: new Date('2026-03-01T14:00:00'),
  endTime: new Date('2026-03-01T15:00:00'),
  position: { top: 100, left: 200 },
  onSave: vi.fn(),
  onMoreOptions: vi.fn(),
  onClose: vi.fn(),
}

describe('QuickEventCreate', () => {
  it('renders with auto-focused title input', () => {
    render(<QuickEventCreate {...defaultProps} />)

    const input = screen.getByPlaceholderText('Event title')
    expect(input).toBeInTheDocument()
    expect(input).toHaveFocus()
  })

  it('displays the time range', () => {
    render(<QuickEventCreate {...defaultProps} />)

    // Check that formatted time is shown (the exact format depends on locale)
    expect(screen.getByText(/2:00/)).toBeInTheDocument()
    expect(screen.getByText(/3:00/)).toBeInTheDocument()
  })

  it('calls onSave with title and times when Enter is pressed', () => {
    const onSave = vi.fn()
    render(<QuickEventCreate {...defaultProps} onSave={onSave} />)

    const input = screen.getByPlaceholderText('Event title')
    fireEvent.change(input, { target: { value: 'Team standup' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({
      title: 'Team standup',
      startMs: defaultProps.startTime.getTime(),
      endMs: defaultProps.endTime.getTime(),
    })
  })

  it('calls onSave with default title when Enter pressed with empty input', () => {
    const onSave = vi.fn()
    render(<QuickEventCreate {...defaultProps} onSave={onSave} />)

    const input = screen.getByPlaceholderText('Event title')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Untitled event' }))
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<QuickEventCreate {...defaultProps} onClose={onClose} />)

    const input = screen.getByPlaceholderText('Event title')
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onMoreOptions when "More options" is clicked', () => {
    const onMoreOptions = vi.fn()
    render(<QuickEventCreate {...defaultProps} onMoreOptions={onMoreOptions} />)

    const input = screen.getByPlaceholderText('Event title')
    fireEvent.change(input, { target: { value: 'Planning session' } })
    fireEvent.click(screen.getByText('More options'))

    expect(onMoreOptions).toHaveBeenCalledTimes(1)
    expect(onMoreOptions).toHaveBeenCalledWith({
      title: 'Planning session',
      startMs: defaultProps.startTime.getTime(),
      endMs: defaultProps.endTime.getTime(),
    })
  })

  it('calls onSave when Save button is clicked', () => {
    const onSave = vi.fn()
    render(<QuickEventCreate {...defaultProps} onSave={onSave} />)

    const input = screen.getByPlaceholderText('Event title')
    fireEvent.change(input, { target: { value: 'Lunch' } })
    fireEvent.click(screen.getByText('Save'))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lunch' }))
  })
})
