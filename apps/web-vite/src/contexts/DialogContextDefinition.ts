import { createContext } from 'react'

export type DialogVariant = 'default' | 'danger' | 'primary'

export interface DialogOptions {
  title?: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: DialogVariant
}

export interface DialogContextValue {
  confirm: (options: DialogOptions) => Promise<boolean>
  alert: (options: DialogOptions) => Promise<void>
}

export const DialogContext = createContext<DialogContextValue | undefined>(undefined)
