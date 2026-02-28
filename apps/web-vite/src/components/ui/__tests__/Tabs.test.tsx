import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Tabs } from '../Tabs'

const tabs = [
  { id: 'one', label: 'Tab One' },
  { id: 'two', label: 'Tab Two' },
  { id: 'three', label: 'Tab Three' },
]

describe('Tabs', () => {
  it('renders all tab labels', () => {
    render(
      <Tabs tabs={tabs} activeTab="one" onChange={vi.fn()}>
        Content
      </Tabs>
    )
    expect(screen.getByText('Tab One')).toBeInTheDocument()
    expect(screen.getByText('Tab Two')).toBeInTheDocument()
    expect(screen.getByText('Tab Three')).toBeInTheDocument()
  })

  it('marks active tab with aria-selected', () => {
    render(
      <Tabs tabs={tabs} activeTab="two" onChange={vi.fn()}>
        Content
      </Tabs>
    )
    expect(screen.getByText('Tab Two')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Tab One')).toHaveAttribute('aria-selected', 'false')
  })

  it('calls onChange when a tab is clicked', () => {
    const onChange = vi.fn()
    render(
      <Tabs tabs={tabs} activeTab="one" onChange={onChange}>
        Content
      </Tabs>
    )
    fireEvent.click(screen.getByText('Tab Two'))
    expect(onChange).toHaveBeenCalledWith('two')
  })

  it('supports keyboard navigation', () => {
    const onChange = vi.fn()
    render(
      <Tabs tabs={tabs} activeTab="one" onChange={onChange}>
        Content
      </Tabs>
    )
    const firstTab = screen.getByText('Tab One')
    fireEvent.keyDown(firstTab, { key: 'ArrowRight' })
    expect(onChange).toHaveBeenCalledWith('two')
  })
})
