import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Modal } from '../Modal'

describe('Modal', () => {
  it('renders when open={true}', () => {
    render(
      <Modal open title="Test Modal" onClose={vi.fn()}>
        Content
      </Modal>
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Content')).toBeInTheDocument()
  })

  it('does not render when open={false}', () => {
    render(
      <Modal open={false} title="Test Modal" onClose={vi.fn()}>
        Content
      </Modal>
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('displays title and subtitle', () => {
    render(
      <Modal open title="My Title" subtitle="My Subtitle" onClose={vi.fn()}>
        Content
      </Modal>
    )
    expect(screen.getByText('My Title')).toBeInTheDocument()
    expect(screen.getByText('My Subtitle')).toBeInTheDocument()
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(
      <Modal open title="Test" onClose={onClose}>
        Content
      </Modal>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal open title="Test" onClose={onClose}>
        Content
      </Modal>
    )
    // The overlay is the element with class ui-modal-overlay
    const overlay = document.querySelector('.ui-modal-overlay')!
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onClose when content is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal open title="Test" onClose={onClose}>
        Content
      </Modal>
    )
    fireEvent.click(screen.getByText('Content'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('renders footer content', () => {
    render(
      <Modal open title="Test" onClose={vi.fn()} footer={<button>Save</button>}>
        Content
      </Modal>
    )
    expect(screen.getByText('Save')).toBeInTheDocument()
  })

  it('applies size classes correctly', () => {
    render(
      <Modal open title="Test" onClose={vi.fn()} size="lg">
        Content
      </Modal>
    )
    expect(document.querySelector('.ui-modal-content--lg')).toBeInTheDocument()
  })
})
