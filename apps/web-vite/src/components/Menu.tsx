import type { ReactNode } from 'react'

interface MenuProps {
  children: ReactNode
}

export function Menu({ children }: MenuProps) {
  return <div className="menu">{children}</div>
}

export function MenuItem({
  children,
  onSelect,
}: {
  children: ReactNode
  onSelect?: () => void
}) {
  return (
    <button type="button" className="menu-item" onClick={onSelect}>
      {children}
    </button>
  )
}
