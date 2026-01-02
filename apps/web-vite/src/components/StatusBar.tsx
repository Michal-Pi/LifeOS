import type { ReactNode } from 'react'

interface StatusBarProps {
  children: ReactNode
}

export function StatusBar({ children }: StatusBarProps) {
  return <div className="status-bar">{children}</div>
}
