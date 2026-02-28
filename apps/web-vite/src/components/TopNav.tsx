import { NavLink } from 'react-router-dom'
import { GlobalSearch } from './GlobalSearch'
import { useMessageMailbox } from '@/hooks/useMessageMailbox'

interface NavGroup {
  label: string
  links: Array<{ to: string; label: string }>
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Daily',
    links: [
      { to: '/today', label: 'Today' },
      { to: '/calendar', label: 'Calendar' },
    ],
  },
  {
    label: 'Organize',
    links: [
      { to: '/planner', label: 'Planner' },
      { to: '/notes', label: 'Notes' },
      { to: '/people', label: 'People' },
    ],
  },
  {
    label: 'Communicate',
    links: [{ to: '/mailbox', label: 'Mailbox' }],
  },
  {
    label: 'Automate',
    links: [
      { to: '/workflows', label: 'Workflows' },
      { to: '/agents', label: 'Agents' },
    ],
  },
]

export function TopNav() {
  const { messages } = useMessageMailbox({ autoSync: false, maxMessages: 50 })
  const unreadCount = messages.filter((m) => !m.isRead && !m.isDismissed).length

  return (
    <header className="top-nav">
      <div className="top-nav__inner">
        <div className="top-nav__brand">
          <span className="top-nav__logo">LIFE_OS</span>
        </div>

        <nav className="top-nav__links">
          {NAV_GROUPS.map((group, groupIndex) => (
            <div key={group.label} className="top-nav__group">
              {groupIndex > 0 && <span className="top-nav__separator" />}
              {group.links.map((link) => (
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
            </div>
          ))}
        </nav>

        <div className="top-nav__search">
          <GlobalSearch />
        </div>

        <div className="top-nav__actions">
          <NavLink
            to="/settings"
            className={({ isActive }) => `top-nav__link${isActive ? ' top-nav__link--active' : ''}`}
            aria-label="Settings"
          >
            Settings
          </NavLink>
        </div>
      </div>
    </header>
  )
}
