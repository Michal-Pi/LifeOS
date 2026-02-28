/**
 * @fileoverview Settings Page - Configuration Control Center
 *
 * Sidebar + content layout with scroll-spy navigation.
 * Sections: General, AI Providers, Search Tools, Calendar, Channels, Quotes, System.
 *
 * Each section is extracted into its own component under
 * `components/settings/`. This page handles only sidebar navigation,
 * scroll-spy (IntersectionObserver), error banner, and section composition.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { CalendarSettingsPanel } from '@/components/CalendarSettingsPanel'
import { ChannelConnectionsPanel } from '@/components/settings/ChannelConnectionsPanel'
import { GeneralSettingsSection } from '@/components/settings/GeneralSettingsSection'
import { AIProvidersSection } from '@/components/settings/AIProvidersSection'
import { SearchToolsSection } from '@/components/settings/SearchToolsSection'
import { SchedulingLinksSection } from '@/components/settings/SchedulingLinksSection'
import { QuotesSection } from '@/components/settings/QuotesSection'
import { SystemSection } from '@/components/settings/SystemSection'

const SIDEBAR_SECTIONS = [
  { id: 'general', label: 'General' },
  { id: 'ai-providers', label: 'AI Providers' },
  { id: 'search-tools', label: 'Search Tools' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'scheduling', label: 'Scheduling' },
  { id: 'channels', label: 'Channels' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'system', label: 'System' },
] as const

export function SettingsPage() {
  const { user } = useAuth()
  const userId = user?.uid ?? ''

  const [error, setError] = useState<string | null>(null)

  // Sidebar scroll-spy
  const [activeSection, setActiveSection] = useState('general')
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id)
          }
        }
      },
      { rootMargin: '-20% 0px -60% 0px' }
    )

    const sections = document.querySelectorAll('.settings-content section[id]')
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [])

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleError = useCallback((message: string) => {
    setError(message)
  }, [])

  return (
    <div className="page-container settings-page">
      <header className="settings-header">
        <div>
          <p className="section-label">Control Center</p>
          <h1>Settings</h1>
          <p className="settings-meta">
            Tune intelligence, defaults, experience, and sync without breaking focus.
          </p>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>&#x26A0; {error}</span>
          <button onClick={() => setError(null)}>&#x2715;</button>
        </div>
      )}

      <div className="settings-layout">
        <aside className="settings-sidebar">
          <nav>
            {SIDEBAR_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`settings-sidebar__link${activeSection === section.id ? ' settings-sidebar__link--active' : ''}`}
                onClick={() => scrollTo(section.id)}
              >
                {section.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="settings-content" ref={contentRef}>
          <GeneralSettingsSection userId={user?.uid} onError={handleError} />

          <AIProvidersSection userId={user?.uid} onError={handleError} />

          <SearchToolsSection userId={user?.uid} onError={handleError} />

          {/* Calendar -- already a standalone panel */}
          <section id="calendar">
            <h2 className="settings-section__title">Calendar</h2>
            <p className="settings-section__description">
              Manage Google Calendar sync and event preferences.
            </p>
            <CalendarSettingsPanel />
          </section>

          <SchedulingLinksSection userId={user?.uid} onError={handleError} />

          {/* Channels -- already a standalone panel */}
          <section id="channels">
            <h2 className="settings-section__title">Channels</h2>
            <p className="settings-section__description">
              Connect messaging channels for unified inbox sync.
            </p>
            <ChannelConnectionsPanel />
          </section>

          <QuotesSection userId={userId} onError={handleError} />

          <SystemSection />
        </main>
      </div>
    </div>
  )
}
