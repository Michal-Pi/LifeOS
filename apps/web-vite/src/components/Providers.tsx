/**
 * Providers wrapper
 *
 * Combines all context providers in one place.
 */

import type { ReactNode } from 'react'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { DialogProvider } from '@/contexts/DialogContext'
import { RepositoryProvider } from '@/contexts/RepositoryContext'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider defaultTheme="auto">
      <DialogProvider>
        <AuthProvider>
          <RepositoryProvider>{children}</RepositoryProvider>
        </AuthProvider>
      </DialogProvider>
    </ThemeProvider>
  )
}
