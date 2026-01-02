import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'
vi.mock('./GlobalSearch', () => ({
  GlobalSearch: () => <div data-testid="global-search" />,
}))

describe('TopNav', () => {
  it('renders the Notes link', async () => {
    const { TopNav } = await import('./TopNav')

    render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: 'Notes' })).toBeInTheDocument()
  })
})
