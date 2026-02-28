import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { KeyboardShortcuts } from '../KeyboardShortcuts'

describe('KeyboardShortcuts', () => {
  it('renders the overlay when isOpen is true', () => {
    const { container } = render(<KeyboardShortcuts isOpen={true} onClose={vi.fn()} />)
    expect(container.querySelector('.shortcuts-overlay')).not.toBeNull()
    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()
  })

  it('does not render when isOpen is false', () => {
    const { container } = render(<KeyboardShortcuts isOpen={false} onClose={vi.fn()} />)
    expect(container.querySelector('.shortcuts-overlay')).toBeNull()
  })

  it('shows all shortcut groups', () => {
    render(<KeyboardShortcuts isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Global')).toBeInTheDocument()
    expect(screen.getByText('Planner')).toBeInTheDocument()
    expect(screen.getByText('Notes')).toBeInTheDocument()
    expect(screen.getByText('People')).toBeInTheDocument()
    expect(screen.getByText('Calendar')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<KeyboardShortcuts isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when clicking the overlay backdrop', () => {
    const onClose = vi.fn()
    const { container } = render(<KeyboardShortcuts isOpen={true} onClose={onClose} />)
    fireEvent.click(container.querySelector('.shortcuts-overlay')!)
    expect(onClose).toHaveBeenCalledOnce()
  })
})
