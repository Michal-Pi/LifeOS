import type { ProjectManagerConfig } from '@lifeos/agents'

type ProjectManagerConfigProps = {
  value: ProjectManagerConfig
  onChange: (updates: Partial<ProjectManagerConfig>) => void
}

export function ProjectManagerConfig({ value, onChange }: ProjectManagerConfigProps) {
  return (
    <div className="form-section">
      <div className="section-label">Project Manager</div>

      <div className="form-group">
        <label htmlFor="pm-enabled">Enable Project Manager</label>
        <label>
          <input
            id="pm-enabled"
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          <span>Activate PM orchestration for this workflow</span>
        </label>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="pm-questioning-depth">Questioning depth</label>
          <select
            id="pm-questioning-depth"
            value={value.questioningDepth}
            onChange={(event) =>
              onChange({
                questioningDepth: event.target.value as ProjectManagerConfig['questioningDepth'],
              })
            }
            disabled={!value.enabled}
          >
            <option value="minimal">Minimal</option>
            <option value="standard">Standard</option>
            <option value="thorough">Thorough</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="pm-auto-council">Auto-use Expert Council</label>
          <label>
            <input
              id="pm-auto-council"
              type="checkbox"
              checked={value.autoUseExpertCouncil}
              onChange={(event) => onChange({ autoUseExpertCouncil: event.target.checked })}
              disabled={!value.enabled}
            />
            <span>Trigger council automatically when needed</span>
          </label>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="pm-council-threshold">
            Expert Council threshold: {value.expertCouncilThreshold}
          </label>
          <input
            id="pm-council-threshold"
            type="range"
            min="0"
            max="100"
            value={value.expertCouncilThreshold}
            onChange={(event) =>
              onChange({ expertCouncilThreshold: Number.parseInt(event.target.value, 10) })
            }
            disabled={!value.enabled}
          />
        </div>

        <div className="form-group">
          <label htmlFor="pm-quality-threshold">
            Quality gate threshold: {value.qualityGateThreshold}
          </label>
          <input
            id="pm-quality-threshold"
            type="range"
            min="0"
            max="100"
            value={value.qualityGateThreshold}
            onChange={(event) =>
              onChange({ qualityGateThreshold: Number.parseInt(event.target.value, 10) })
            }
            disabled={!value.enabled}
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="pm-assumption-validation">Require assumption validation</label>
        <label>
          <input
            id="pm-assumption-validation"
            type="checkbox"
            checked={value.requireAssumptionValidation}
            onChange={(event) => onChange({ requireAssumptionValidation: event.target.checked })}
            disabled={!value.enabled}
          />
          <span>Ask users to confirm inferred assumptions</span>
        </label>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="pm-conflict-detection">Enable conflict detection</label>
          <label>
            <input
              id="pm-conflict-detection"
              type="checkbox"
              checked={value.enableConflictDetection}
              onChange={(event) => onChange({ enableConflictDetection: event.target.checked })}
              disabled={!value.enabled}
            />
            <span>Detect contradictory requirements</span>
          </label>
        </div>

        <div className="form-group">
          <label htmlFor="pm-user-profiling">Enable user profiling</label>
          <label>
            <input
              id="pm-user-profiling"
              type="checkbox"
              checked={value.enableUserProfiling}
              onChange={(event) => onChange({ enableUserProfiling: event.target.checked })}
              disabled={!value.enabled}
            />
            <span>Learn user preferences over time</span>
          </label>
        </div>
      </div>
    </div>
  )
}
