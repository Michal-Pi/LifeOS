/**
 * ExpertCouncilConfigSection
 *
 * Full Expert Council configuration: mode, council size, self-exclusion,
 * council models, chairman model, consensus, cost limits, and caching.
 */

import type { ExecutionMode, ModelProvider } from '@lifeos/agents'
import { MODEL_OPTIONS_BY_PROVIDER } from '@lifeos/agents'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/Select'
import {
  EXECUTION_MODE_SELECT_OPTIONS,
  type ExpertCouncilSectionProps,
} from './workflowFormConstants'

export function ExpertCouncilConfigSection({
  expertCouncilEnabled,
  expertCouncilDefaultMode,
  setExpertCouncilDefaultMode,
  expertCouncilAllowModeOverride,
  setExpertCouncilAllowModeOverride,
  expertCouncilMinCouncilSizeInput,
  setExpertCouncilMinCouncilSizeInput,
  expertCouncilMaxCouncilSizeInput,
  setExpertCouncilMaxCouncilSizeInput,
  expertCouncilSelfExclusionEnabled,
  setExpertCouncilSelfExclusionEnabled,
  expertCouncilCouncilModels,
  expertCouncilChairmanModel,
  setExpertCouncilChairmanModel,
  onCouncilModelChange,
  onCouncilModelRemove,
  onCouncilModelAdd,
  expertCouncilConsensusThresholdInput,
  setExpertCouncilConsensusThresholdInput,
  expertCouncilMaxCostInput,
  setExpertCouncilMaxCostInput,
  expertCouncilCachingEnabled,
  setExpertCouncilCachingEnabled,
  expertCouncilCacheHoursInput,
  setExpertCouncilCacheHoursInput,
  providerOptions,
}: ExpertCouncilSectionProps) {
  return (
    <div className="form-section">
      <div className="section-label">Expert Council Settings</div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="expertCouncilMode">Default Mode</label>
          <Select
            id="expertCouncilMode"
            value={expertCouncilDefaultMode}
            onChange={(value) => setExpertCouncilDefaultMode(value as ExecutionMode)}
            disabled={!expertCouncilEnabled}
            options={EXECUTION_MODE_SELECT_OPTIONS}
          />
        </div>

        <div className="form-group">
          <label htmlFor="expertCouncilAllowOverride">Allow per-run override</label>
          <label>
            <input
              id="expertCouncilAllowOverride"
              type="checkbox"
              checked={expertCouncilAllowModeOverride}
              onChange={(e) => setExpertCouncilAllowModeOverride(e.target.checked)}
              disabled={!expertCouncilEnabled}
            />
            <span>Let users choose a mode per execution</span>
          </label>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="expertCouncilMinSize">Minimum council size</label>
          <input
            id="expertCouncilMinSize"
            type="number"
            min={2}
            value={expertCouncilMinCouncilSizeInput}
            onChange={(e) => setExpertCouncilMinCouncilSizeInput(e.target.value)}
            disabled={!expertCouncilEnabled}
          />
        </div>
        <div className="form-group">
          <label htmlFor="expertCouncilMaxSize">Maximum council size</label>
          <input
            id="expertCouncilMaxSize"
            type="number"
            min={2}
            value={expertCouncilMaxCouncilSizeInput}
            onChange={(e) => setExpertCouncilMaxCouncilSizeInput(e.target.value)}
            disabled={!expertCouncilEnabled}
          />
        </div>
      </div>

      <div className="form-group">
        <label>Self-exclusion</label>
        <label>
          <input
            type="checkbox"
            checked={expertCouncilSelfExclusionEnabled}
            onChange={(e) => setExpertCouncilSelfExclusionEnabled(e.target.checked)}
            disabled={!expertCouncilEnabled}
          />
          <span>Judges do not review their own responses</span>
        </label>
      </div>

      {/* Council Models */}
      <div className="form-group">
        <label>Council Models</label>
        {expertCouncilCouncilModels.length === 0 ? (
          <div className="empty-state">
            <p>No council models configured.</p>
          </div>
        ) : (
          expertCouncilCouncilModels.map((model, index) => (
            <div key={`${model.modelId}-${index}`} className="form-section">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor={`council-model-id-${index}`}>Model ID</label>
                  <input
                    id={`council-model-id-${index}`}
                    type="text"
                    value={model.modelId}
                    onChange={(e) => onCouncilModelChange(index, { modelId: e.target.value })}
                    disabled={!expertCouncilEnabled}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`council-model-provider-${index}`}>Provider</label>
                  <Select
                    id={`council-model-provider-${index}`}
                    value={model.provider}
                    onChange={(value) =>
                      onCouncilModelChange(index, {
                        provider: value as ModelProvider,
                      })
                    }
                    disabled={!expertCouncilEnabled}
                    options={providerOptions}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor={`council-model-name-${index}`}>Model name</label>
                  <Select
                    id={`council-model-name-${index}`}
                    value={model.modelName}
                    onChange={(value) => onCouncilModelChange(index, { modelName: value })}
                    options={MODEL_OPTIONS_BY_PROVIDER[model.provider] ?? []}
                    disabled={!expertCouncilEnabled}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`council-model-temp-${index}`}>Temperature</label>
                  <input
                    id={`council-model-temp-${index}`}
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={model.temperature ?? ''}
                    onChange={(e) =>
                      onCouncilModelChange(index, {
                        temperature: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    disabled={!expertCouncilEnabled}
                  />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor={`council-model-max-tokens-${index}`}>Max tokens</label>
                  <input
                    id={`council-model-max-tokens-${index}`}
                    type="number"
                    min={1}
                    value={model.maxTokens ?? ''}
                    onChange={(e) =>
                      onCouncilModelChange(index, {
                        maxTokens: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    disabled={!expertCouncilEnabled}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor={`council-model-system-${index}`}>System prompt</label>
                  <input
                    id={`council-model-system-${index}`}
                    type="text"
                    value={model.systemPrompt ?? ''}
                    onChange={(e) =>
                      onCouncilModelChange(index, {
                        systemPrompt: e.target.value || undefined,
                      })
                    }
                    disabled={!expertCouncilEnabled}
                  />
                </div>
              </div>
              <div className="form-group">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => onCouncilModelRemove(index)}
                  disabled={!expertCouncilEnabled}
                >
                  Remove model
                </Button>
              </div>
            </div>
          ))
        )}
        <Button
          variant="ghost"
          type="button"
          onClick={onCouncilModelAdd}
          disabled={!expertCouncilEnabled}
        >
          + Add Council Model
        </Button>
      </div>

      {/* Chairman Model */}
      <div className="form-group">
        <label>Chairman Model</label>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="chairman-model-id">Model ID</label>
            <input
              id="chairman-model-id"
              type="text"
              value={expertCouncilChairmanModel.modelId}
              onChange={(e) =>
                setExpertCouncilChairmanModel((prev) => ({
                  ...prev,
                  modelId: e.target.value,
                }))
              }
              disabled={!expertCouncilEnabled}
            />
          </div>
          <div className="form-group">
            <label htmlFor="chairman-model-provider">Provider</label>
            <Select
              id="chairman-model-provider"
              value={expertCouncilChairmanModel.provider}
              onChange={(value) =>
                setExpertCouncilChairmanModel((prev) => ({
                  ...prev,
                  provider: value as ModelProvider,
                }))
              }
              disabled={!expertCouncilEnabled}
              options={providerOptions}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label htmlFor="chairman-model-name">Model name</label>
            <Select
              id="chairman-model-name"
              value={expertCouncilChairmanModel.modelName}
              onChange={(value) =>
                setExpertCouncilChairmanModel((prev) => ({
                  ...prev,
                  modelName: value,
                }))
              }
              options={MODEL_OPTIONS_BY_PROVIDER[expertCouncilChairmanModel.provider] ?? []}
              disabled={!expertCouncilEnabled}
            />
          </div>
          <div className="form-group">
            <label htmlFor="chairman-model-temp">Temperature</label>
            <input
              id="chairman-model-temp"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={expertCouncilChairmanModel.temperature ?? ''}
              onChange={(e) =>
                setExpertCouncilChairmanModel((prev) => ({
                  ...prev,
                  temperature: e.target.value ? Number(e.target.value) : undefined,
                }))
              }
              disabled={!expertCouncilEnabled}
            />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="chairman-model-max-tokens">Max tokens</label>
          <input
            id="chairman-model-max-tokens"
            type="number"
            min={1}
            value={expertCouncilChairmanModel.maxTokens ?? ''}
            onChange={(e) =>
              setExpertCouncilChairmanModel((prev) => ({
                ...prev,
                maxTokens: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
            disabled={!expertCouncilEnabled}
          />
        </div>
      </div>

      {/* Consensus & Cost */}
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="expertCouncilConsensus">Consensus threshold</label>
          <input
            id="expertCouncilConsensus"
            type="number"
            min={0}
            max={100}
            value={expertCouncilConsensusThresholdInput}
            onChange={(e) => setExpertCouncilConsensusThresholdInput(e.target.value)}
            placeholder="Optional"
            disabled={!expertCouncilEnabled}
          />
        </div>
        <div className="form-group">
          <label htmlFor="expertCouncilMaxCost">Max cost per turn ($)</label>
          <input
            id="expertCouncilMaxCost"
            type="number"
            min={0}
            step={0.01}
            value={expertCouncilMaxCostInput}
            onChange={(e) => setExpertCouncilMaxCostInput(e.target.value)}
            placeholder="Optional"
            disabled={!expertCouncilEnabled}
          />
        </div>
      </div>

      {/* Caching */}
      <div className="form-row">
        <div className="form-group">
          <label htmlFor="expertCouncilCaching">Caching</label>
          <label>
            <input
              id="expertCouncilCaching"
              type="checkbox"
              checked={expertCouncilCachingEnabled}
              onChange={(e) => setExpertCouncilCachingEnabled(e.target.checked)}
              disabled={!expertCouncilEnabled}
            />
            <span>Cache identical prompts</span>
          </label>
        </div>
        <div className="form-group">
          <label htmlFor="expertCouncilCacheHours">Cache expiration (hours)</label>
          <input
            id="expertCouncilCacheHours"
            type="number"
            min={1}
            value={expertCouncilCacheHoursInput}
            onChange={(e) => setExpertCouncilCacheHoursInput(e.target.value)}
            disabled={!expertCouncilEnabled}
          />
        </div>
      </div>
    </div>
  )
}
