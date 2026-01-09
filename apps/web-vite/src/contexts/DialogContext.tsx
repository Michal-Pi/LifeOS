import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { DialogContext, type DialogOptions } from './DialogContextDefinition'

interface DialogState {
  type: 'confirm' | 'alert'
  options: DialogOptions
  resolve: (value: boolean | void) => void
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<DialogState[]>([])
  const dialog = queue[0] ?? null

  const enqueueDialog = useCallback((next: DialogState) => {
    setQueue((prev) => [...prev, next])
  }, [])

  const confirm = useCallback(
    (options: DialogOptions) => {
      return new Promise<boolean>((resolve) => {
        enqueueDialog({ type: 'confirm', options, resolve })
      })
    },
    [enqueueDialog]
  )

  const alert = useCallback(
    (options: DialogOptions) => {
      return new Promise<void>((resolve) => {
        enqueueDialog({ type: 'alert', options, resolve })
      })
    },
    [enqueueDialog]
  )

  const handleConfirm = () => {
    if (!dialog) return
    dialog.resolve(dialog.type === 'confirm' ? true : undefined)
    setQueue((prev) => prev.slice(1))
  }

  const handleCancel = () => {
    if (!dialog) return
    dialog.resolve(dialog.type === 'confirm' ? false : undefined)
    setQueue((prev) => prev.slice(1))
  }

  const value = useMemo(() => ({ confirm, alert }), [confirm, alert])

  return (
    <DialogContext.Provider value={value}>
      {children}
      {dialog && (
        <ConfirmDialog
          isOpen={!!dialog}
          title={dialog.options.title ?? (dialog.type === 'confirm' ? 'Confirm action' : 'Notice')}
          description={dialog.options.description}
          confirmLabel={
            dialog.options.confirmLabel ?? (dialog.type === 'confirm' ? 'Confirm' : 'OK')
          }
          cancelLabel={dialog.options.cancelLabel ?? 'Cancel'}
          confirmVariant={
            dialog.options.confirmVariant ?? (dialog.type === 'confirm' ? 'danger' : 'primary')
          }
          showCancel={dialog.type === 'confirm'}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </DialogContext.Provider>
  )
}
