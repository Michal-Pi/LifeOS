import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ThemeToggle } from './ThemeToggle'

const modules = [
  { label: 'Today', href: '/', icon: '🌅' },
  { label: 'Calendar', href: '/calendar', icon: '🗓️' },
  { label: 'To-dos', href: '/todos', icon: '📝' },
  { label: 'Notes', href: '/notes', icon: '📓' },
  { label: 'People', href: '/people', icon: '👥' },
  { label: 'Projects', href: '/projects', icon: '📦' }
]
const settingsItem = { label: 'Settings', href: '/settings', icon: '⚙️' }

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation()
  const pathname = location.pathname
  return (
    <div className="app-shell">
      <nav className="sidebar" aria-label="Primary">
        <div className="sidebar-header">
          <div className="logo">
            <span className="logo-mark">∘</span>
            <span className="logo-label">LifeOS</span>
          </div>
          <button className="sidebar-button" aria-label="Collapse navigation">
            <span>⤢</span>
          </button>
        </div>
        <div className="sidebar-heading">Modules</div>
        <ul>
          {modules.map((item) => {
            const active = pathname === item.href
            return (
              <li key={item.href}>
                <Link
                  to={item.href}
                  className={`nav-link ${active ? 'active' : ''}`}
                >
                  <span className="nav-icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="nav-label">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
        <div className="sidebar-divider" />
        <Link
          to={settingsItem.href}
          className={`nav-link ${pathname === settingsItem.href ? 'active' : ''}`}
        >
          <span className="nav-icon" aria-hidden="true">
            {settingsItem.icon}
          </span>
          <span className="nav-label">{settingsItem.label}</span>
        </Link>
      </nav>
      <div className="main-column">
        <header className="top-bar">
          <div>
            <p className="top-bar-label">Navigation</p>
            <h1 className="top-bar-title">
              {pathname?.slice(1)?.replace(/-/g, ' ') || 'Dashboard'}
            </h1>
          </div>
          <div className="top-bar-actions">
            <button className="ghost-button" aria-label="Search placeholder" disabled>
              Search (coming soon)
            </button>
            <ThemeToggle />
          </div>
        </header>
        <main className="content-wrapper">
          <div className="content-card">{children}</div>
        </main>
      </div>
    </div>
  )
}
