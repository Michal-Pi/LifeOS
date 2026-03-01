import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { GlobalSearch } from './GlobalSearch'
import { useMessageMailbox } from '@/hooks/useMessageMailbox'

const primaryLinks = [
  { to: '/today', label: 'Today' },
  { to: '/mailbox', label: 'Mailbox' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/people', label: 'People' },
  { to: '/planner', label: 'Planner' },
  { to: '/notes', label: 'Notes' },
  { to: '/workflows', label: 'Agentic Workflows' },
]

const secondaryLinks: typeof primaryLinks = []

const navTimeFormat = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const navDateFormat = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

export function TopNav() {
  const { messages } = useMessageMailbox({ autoSync: false, maxMessages: 50 })
  const unreadCount = messages.filter((m) => !m.isRead && !m.isDismissed).length

  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="top-nav">
      <div className="top-nav__inner">
        <div className="top-nav__brand">
          <img src="/logo-icon.svg" alt="" className="top-nav__logo-icon" />
          <span className="top-nav__logo">LIFE_OS</span>
        </div>

        <nav className="top-nav__links">
          {primaryLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `top-nav__link${isActive ? ' top-nav__link--active' : ''}`
              }
            >
              {link.label}
              {link.to === '/mailbox' && unreadCount > 0 && (
                <span className="top-nav__badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="top-nav__search">
          <GlobalSearch />
        </div>

        <div className="top-nav__actions">
          {secondaryLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `top-nav__link${isActive ? ' top-nav__link--active' : ''}`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            className={({ isActive }) => `top-nav__link${isActive ? ' top-nav__link--active' : ''}`}
            aria-label="Settings"
          >
            Settings
          </NavLink>
        </div>

        <div className="top-nav__clock">
          <span className="top-nav__time">{navTimeFormat.format(now)}</span>
          <span className="top-nav__date">{navDateFormat.format(now)}</span>
        </div>
      </div>
    </header>
  )
}
