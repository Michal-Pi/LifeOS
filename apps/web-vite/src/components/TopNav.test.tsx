import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
import { TopNav } from './TopNav'

vi.mock('./GlobalSearch', () => ({
  GlobalSearch: () => <div data-testid="global-search" />,
}))

describe('TopNav', () => {
  it('renders the Notes link', () => {
    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Notes' })).toBeInTheDocument()
  })
})
