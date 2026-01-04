import { NavLink } from 'react-router-dom'
import { GlobalSearch } from './GlobalSearch'

const primaryLinks = [
  { to: '/today', label: 'Today' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/planner', label: 'Planner' },
  { to: '/notes', label: 'Notes' },
  { to: '/habits', label: 'Habits' },
  { to: '/workspaces', label: 'Workspaces' },
]

const secondaryLinks = [
  { to: '/agents', label: 'Agents' },
  { to: '/review', label: 'Review' },
]

export function TopNav() {
  return (
    <header className="top-nav">
      <div className="top-nav__inner">
        <div className="top-nav__brand">
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
      </div>
    </header>
  )
}
