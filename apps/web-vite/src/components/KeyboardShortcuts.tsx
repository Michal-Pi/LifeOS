interface ShortcutGroup {
  label: string
  shortcuts: Array<{ keys: string[]; description: string }>
}

const GLOBAL_SHORTCUTS: ShortcutGroup[] = [
  {
    label: 'Global',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open search' },
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['G', 'T'], description: 'Go to Today' },
      { keys: ['G', 'P'], description: 'Go to Planner' },
      { keys: ['G', 'N'], description: 'Go to Notes' },
      { keys: ['G', 'C'], description: 'Go to Calendar' },
      { keys: ['G', 'M'], description: 'Go to Mailbox' },
    ],
  },
  {
    label: 'Planner',
    shortcuts: [
      { keys: ['⌘', 'Shift', 'T'], description: 'New task' },
      { keys: ['V', 'P'], description: 'Priority view' },
      { keys: ['V', 'L'], description: 'List view' },
      { keys: ['V', 'B'], description: 'Board view' },
    ],
  },
  {
    label: 'Notes',
    shortcuts: [
      { keys: ['⌘', 'N'], description: 'New note' },
      { keys: ['⌘', 'Shift', 'F'], description: 'Search notes' },
    ],
  },
  {
    label: 'People',
    shortcuts: [{ keys: ['⌘', 'Shift', 'C'], description: 'Quick add contact' }],
  },
  {
    label: 'Calendar',
    shortcuts: [{ keys: ['⌘', 'Shift', 'E'], description: 'New event' }],
  },
]

interface KeyboardShortcutsProps {
  isOpen: boolean
  onClose: () => void
}

export function KeyboardShortcuts({ isOpen, onClose }: KeyboardShortcutsProps) {
  if (!isOpen) return null

  return (
    <div className="shortcuts-overlay" onClick={onClose}>
      <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-modal__header">
          <h2>Keyboard Shortcuts</h2>
          <button className="ghost-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="shortcuts-modal__body">
          {GLOBAL_SHORTCUTS.map((group) => (
            <div key={group.label} className="shortcuts-group">
              <h3 className="shortcuts-group__label">{group.label}</h3>
              <div className="shortcuts-group__list">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.description} className="shortcut-row">
                    <div className="shortcut-row__keys">
                      {shortcut.keys.map((key, i) => (
                        <span key={i}>
                          <kbd className="shortcut-key">{key}</kbd>
                          {i < shortcut.keys.length - 1 && <span className="shortcut-plus">+</span>}
                        </span>
                      ))}
                    </div>
                    <span className="shortcut-row__description">{shortcut.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
