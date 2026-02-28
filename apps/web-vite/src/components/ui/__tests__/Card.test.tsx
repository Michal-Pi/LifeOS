import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Card } from '../Card'

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Hello Card</Card>)
    expect(screen.getByText('Hello Card')).toBeInTheDocument()
  })

  it('renders header and footer when provided', () => {
    render(
      <Card header={<span>Header</span>} footer={<span>Footer</span>}>
        Body
      </Card>
    )
    expect(screen.getByText('Header')).toBeInTheDocument()
    expect(screen.getByText('Footer')).toBeInTheDocument()
  })

  it('applies compact class', () => {
    const { container } = render(<Card compact>Content</Card>)
    expect(container.querySelector('.ui-card--compact')).toBeInTheDocument()
  })

  it('applies interactive class and handles onClick', () => {
    const onClick = vi.fn()
    const { container } = render(<Card onClick={onClick}>Clickable</Card>)
    expect(container.querySelector('.ui-card--interactive')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Clickable'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders correct HTML element via as prop', () => {
    const { container } = render(<Card as="article">Content</Card>)
    expect(container.querySelector('article.ui-card')).toBeInTheDocument()
  })
})
