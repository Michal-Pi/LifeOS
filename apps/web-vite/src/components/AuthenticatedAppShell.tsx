'use client'

/**
 * Authenticated App Shell
 *
 * Wraps the AppShell with authentication protection.
 * Provides the user context to child components.
 */

import type { ReactNode } from 'react'
import { AppShell } from '@/components/AppShell'
import { ProtectedRoute } from '@/components/ProtectedRoute'

interface AuthenticatedAppShellProps {
  children: ReactNode
}

export function AuthenticatedAppShell({ children }: AuthenticatedAppShellProps) {
  return (
    <ProtectedRoute>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  )
}
