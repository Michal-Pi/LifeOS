interface ConfirmDialogProps {
  isOpen: boolean
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  showCancel?: boolean
  confirmVariant?: 'default' | 'danger' | 'primary'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  showCancel = true,
  confirmVariant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!isOpen) return null

  const confirmClass =
    confirmVariant === 'primary'
      ? 'primary-button'
      : confirmVariant === 'danger'
        ? 'ghost-button danger'
        : 'ghost-button'

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content modal-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="close-button" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-description">{description}</p>
        </div>
        <div className="modal-actions">
          {showCancel && (
            <button type="button" className="ghost-button" onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button type="button" className={confirmClass} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
