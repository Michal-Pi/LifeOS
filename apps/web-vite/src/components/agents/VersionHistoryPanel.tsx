import type { PromptVersion } from '@lifeos/agents'

type VersionHistoryPanelProps = {
  versions: PromptVersion[]
  onRestore: (version: number) => void
}

export function VersionHistoryPanel({ versions, onRestore }: VersionHistoryPanelProps) {
  if (versions.length === 0) {
    return (
      <div className="version-history__empty">
        <p>No versions yet.</p>
      </div>
    )
  }

  return (
    <div className="version-history">
      <h4>Version History</h4>
      <ul>
        {versions.map((version) => (
          <li key={version.version}>
            <div>
              <strong>v{version.version}</strong>
              <span>{new Date(version.createdAtMs).toLocaleString()}</span>
            </div>
            <p>{version.changeDescription}</p>
            <button
              type="button"
              className="ghost-button"
              onClick={() => onRestore(version.version)}
            >
              Restore
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
