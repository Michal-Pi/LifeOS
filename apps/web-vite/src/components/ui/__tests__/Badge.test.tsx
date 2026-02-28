import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Badge } from '../Badge'

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>)
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('applies variant classes', () => {
    const variants = ['default', 'success', 'warning', 'error', 'info', 'outline', 'work'] as const
    for (const variant of variants) {
      const { container, unmount } = render(<Badge variant={variant}>Test</Badge>)
      expect(container.querySelector(`.ui-badge--${variant}`)).toBeInTheDocument()
      unmount()
    }
  })

  it('applies size class', () => {
    const { container } = render(<Badge size="sm">Small</Badge>)
    expect(container.querySelector('.ui-badge--sm')).toBeInTheDocument()
  })
})
