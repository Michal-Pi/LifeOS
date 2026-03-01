import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi } from 'vitest'

vi.mock('./GlobalSearch', () => ({
  GlobalSearch: () => <div data-testid="global-search" />,
}))
vi.mock('@/hooks/useMessageMailbox', () => ({
  useMessageMailbox: () => ({ messages: [], loading: false }),
}))

describe('TopNav', () => {
  async function renderNav() {
    const { TopNav } = await import('./TopNav')
    return render(
      <MemoryRouter>
        <TopNav />
      </MemoryRouter>
    )
  }

  it('renders all expected navigation links', async () => {
    await renderNav()
    const expectedLinks = [
      'Today',
      'Calendar',
      'Planner',
      'Notes',
      'People',
      'Mailbox',
      'Agentic Workflows',
    ]
    for (const label of expectedLinks) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('renders Settings link in actions area', async () => {
    const { container } = await renderNav()
    const actionsArea = container.querySelector('.top-nav__actions')
    expect(actionsArea).not.toBeNull()
    const settingsLink = screen.getByRole('link', { name: 'Settings' })
    expect(actionsArea!.contains(settingsLink)).toBe(true)
  })
})
