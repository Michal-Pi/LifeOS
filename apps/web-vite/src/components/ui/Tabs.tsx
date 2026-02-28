import { useRef, type ReactNode } from 'react'
import './Tabs.css'

interface TabItem {
  id: string
  label: string
  icon?: ReactNode
}

interface TabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (tabId: string) => void
  children: ReactNode
  className?: string
}

export function Tabs({ tabs, activeTab, onChange, children, className }: TabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null

    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % tabs.length
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + tabs.length) % tabs.length
    } else if (e.key === 'Home') {
      nextIndex = 0
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1
    }

    if (nextIndex !== null) {
      e.preventDefault()
      tabRefs.current[nextIndex]?.focus()
      onChange(tabs[nextIndex].id)
    }
  }

  return (
    <div className={className}>
      <div className="ui-tabs-list" role="tablist">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[i] = el
            }}
            role="tab"
            type="button"
            aria-selected={tab.id === activeTab}
            tabIndex={tab.id === activeTab ? 0 : -1}
            className={`ui-tab${tab.id === activeTab ? ' ui-tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, i)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      <div className="ui-tab-panel" role="tabpanel" tabIndex={0}>
        {children}
      </div>
    </div>
  )
}
