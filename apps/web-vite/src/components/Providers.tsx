/**
 * Providers wrapper
 *
 * Combines all context providers in one place.
 */

import type { ReactNode } from 'react'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { DialogProvider } from '@/contexts/DialogContext'

interface ProvidersProps {
  children: ReactNode
}

export function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider defaultTheme="auto">
      <DialogProvider>
        <AuthProvider>{children}</AuthProvider>
      </DialogProvider>
    </ThemeProvider>
  )
}
