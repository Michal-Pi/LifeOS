import { useState } from 'react'
import { useModelSettings } from '@/hooks/useModelSettings'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/Select'
import { MODEL_PRICING } from '@lifeos/agents'
import type { ModelProvider, ProviderModelConfig } from '@lifeos/agents'
import '@/styles/pages/ModelSettingsPage.css'

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  xai: 'xAI (Grok)',
}

const PROVIDER_DESCRIPTIONS: Record<ModelProvider, string> = {
  openai: 'GPT models for general-purpose tasks with strong reasoning',
  anthropic: 'Claude models known for long context and thoughtful responses',
  google: 'Gemini models offering cost-effective multimodal capabilities',
  xai: 'Grok models with real-time data and frontier reasoning',
}

function formatCost(modelName: string): string {
  const pricing = MODEL_PRICING[modelName]
  if (!pricing) return 'Pricing not available'
  return `$${pricing.input}/$${pricing.output} per 1M tokens`
}

interface ProviderCardProps {
  provider: ModelProvider
  config: ProviderModelConfig
  onUpdate: (config: ProviderModelConfig) => Promise<void>
}

function ProviderCard({ provider, config, onUpdate }: ProviderCardProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [localConfig, setLocalConfig] = useState(config)
  const [hasChanges, setHasChanges] = useState(false)

  const handleModelChange = (newModel: string) => {
    setLocalConfig((prev) => ({ ...prev, defaultModel: newModel }))
    setHasChanges(true)
  }

  const handleEnabledChange = () => {
    setLocalConfig((prev) => ({ ...prev, enabled: !prev.enabled }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onUpdate(localConfig)
      setHasChanges(false)
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setLocalConfig(config)
    setHasChanges(false)
  }

  return (
    <div className={`provider-card ${!localConfig.enabled ? 'disabled' : ''}`}>
      <div className="provider-header">
        <div className="provider-info">
          <h3>{PROVIDER_LABELS[provider]}</h3>
          <p className="provider-description">{PROVIDER_DESCRIPTIONS[provider]}</p>
        </div>
        <label className="toggle-switch">
          <input type="checkbox" checked={localConfig.enabled} onChange={handleEnabledChange} />
          <span className="toggle-slider"></span>
        </label>
      </div>

      {localConfig.enabled && (
        <div className="provider-body">
          <div className="form-group">
            <label>Default Model</label>
            <Select
              value={localConfig.defaultModel}
              onValueChange={handleModelChange}
              disabled={isSaving}
            >
              {localConfig.availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </Select>
            <span className="model-pricing">{formatCost(localConfig.defaultModel)}</span>
          </div>

          {localConfig.lastUpdatedMs && (
            <div className="last-updated">
              Last updated: {new Date(localConfig.lastUpdatedMs).toLocaleString()}
            </div>
          )}

          {hasChanges && (
            <div className="actions">
              <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function ModelSettingsPage() {
  const { settings, isLoading, error, updateProviderConfig, resetToDefaults } = useModelSettings()
  const [isResetting, setIsResetting] = useState(false)

  const handleReset = async () => {
    if (!confirm('Reset all model settings to defaults? This cannot be undone.')) {
      return
    }
    setIsResetting(true)
    try {
      await resetToDefaults()
    } catch (err) {
      console.error('Failed to reset:', err)
    } finally {
      setIsResetting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="model-settings-page">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading model settings...</p>
        </div>
      </div>
    )
  }

  if (error || !settings) {
    return (
      <div className="model-settings-page">
        <div className="error-state">
          <h2>Failed to load settings</h2>
          <p>{error?.message || 'An unknown error occurred'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="model-settings-page">
      <div className="page-header">
        <div>
          <h1>Model Settings</h1>
          <p className="page-description">
            Configure default models for each AI provider. These settings apply when creating new
            agents and workspaces.
          </p>
        </div>
        <Button variant="ghost" onClick={handleReset} disabled={isResetting}>
          {isResetting ? 'Resetting...' : 'Reset to Defaults'}
        </Button>
      </div>

      <div className="providers-grid">
        {(Object.keys(settings.providers) as ModelProvider[]).map((provider) => (
          <ProviderCard
            key={provider}
            provider={provider}
            config={settings.providers[provider]}
            onUpdate={(config) => updateProviderConfig(provider, config)}
          />
        ))}
      </div>

      <div className="info-card">
        <h3>💡 About Model Settings</h3>
        <ul>
          <li>
            <strong>Default Models</strong> are used when creating new agents or workspaces
          </li>
          <li>
            <strong>Existing agents</strong> will continue to use their configured models
          </li>
          <li>
            <strong>Pricing</strong> is shown in USD per million input/output tokens
          </li>
          <li>
            <strong>Disabled providers</strong> won't appear in model selection dropdowns
          </li>
        </ul>
      </div>
    </div>
  )
}
