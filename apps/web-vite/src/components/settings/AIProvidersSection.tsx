/**
 * @fileoverview AI Providers Settings Section
 *
 * Provider key cards for OpenAI, Anthropic, Google, and xAI with
 * reveal/hide toggle, save, and clear actions. Includes links to
 * Model Settings and AI Tool Settings sub-pages.
 */

import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useAiProviderKeys, type AiProviderKeyType } from '@/hooks/useAiProviderKeys'
import type { AiProviderKeys } from '@/hooks/useAiProviderKeys'
import { StatusDot } from '@/components/StatusDot'

export interface AIProvidersSectionProps {
  userId: string | undefined
  onError: (message: string) => void
}

interface ProviderRow {
  id: AiProviderKeyType
  label: string
  saved: boolean
  placeholder: string
  helper: string
  keyField: keyof AiProviderKeys
}

function getMaskedKey(rawKey: string | undefined | null): string {
  if (!rawKey) return ''
  return `${'\u2022'.repeat(8)}${rawKey.slice(-4)}`
}

export function AIProvidersSection({ userId, onError }: AIProvidersSectionProps) {
  const {
    keys: providerKeys,
    isLoading: providerKeysLoading,
    error: providerKeysError,
    saveKey,
    removeKey,
  } = useAiProviderKeys(userId)

  const [keyInputs, setKeyInputs] = useState({
    openai: '',
    anthropic: '',
    google: '',
    xai: '',
  })
  const [keySaving, setKeySaving] = useState<Partial<Record<AiProviderKeyType, boolean>>>({})
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  const handleSaveKey = useCallback(
    async (provider: AiProviderKeyType) => {
      const value = keyInputs[provider]?.trim()
      if (!value) {
        onError('Please enter a key before saving.')
        return
      }

      try {
        setKeySaving((prev) => ({ ...prev, [provider]: true }))
        await saveKey(provider, value)
        setKeyInputs((prev) => ({ ...prev, [provider]: '' }))
      } catch (err) {
        onError((err as Error).message)
      } finally {
        setKeySaving((prev) => ({ ...prev, [provider]: false }))
      }
    },
    [keyInputs, saveKey, onError]
  )

  const handleRemoveKey = useCallback(
    async (provider: AiProviderKeyType) => {
      try {
        setKeySaving((prev) => ({ ...prev, [provider]: true }))
        await removeKey(provider)
      } catch (err) {
        onError((err as Error).message)
      } finally {
        setKeySaving((prev) => ({ ...prev, [provider]: false }))
      }
    },
    [removeKey, onError]
  )

  const providerRows: ProviderRow[] = [
    {
      id: 'openai',
      label: 'OpenAI',
      saved: Boolean(providerKeys.openaiKey),
      placeholder: 'sk-...',
      helper: 'Connect OpenAI to power everyday tasks and drafts.',
      keyField: 'openaiKey',
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      saved: Boolean(providerKeys.anthropicKey),
      placeholder: 'sk-ant-...',
      helper: 'Use Claude for long-form reasoning and deep context runs.',
      keyField: 'anthropicKey',
    },
    {
      id: 'google',
      label: 'Google',
      saved: Boolean(providerKeys.googleKey),
      placeholder: 'AI...',
      helper: 'Enable Gemini for search-grounded answers and summaries.',
      keyField: 'googleKey',
    },
    {
      id: 'xai',
      label: 'xAI (Grok)',
      saved: Boolean(providerKeys.xaiKey),
      placeholder: 'xai-...',
      helper: 'Bring Grok online for real-time awareness checks.',
      keyField: 'xaiKey',
    },
  ]

  return (
    <section id="ai-providers">
      <h2 className="settings-section__title">AI Providers</h2>
      <p className="settings-section__description">Configure API keys for AI model providers.</p>

      {providerKeysError && <p className="settings-panel__error">&#x26A0; {providerKeysError}</p>}
      {providerKeysLoading && <p className="settings-panel__meta">Loading keys...</p>}

      <div className="provider-grid">
        {providerRows.map((provider) => (
          <div key={provider.id} className="provider-card">
            <div className="provider-card__header">
              <div>
                <p className="section-label">Provider</p>
                <h4>{provider.label}</h4>
              </div>
              <div className="provider-card__status">
                <StatusDot
                  status={provider.saved ? 'online' : 'offline'}
                  label={provider.saved ? 'Connected' : 'Inactive'}
                />
                <span>{provider.saved ? 'Connected' : 'Inactive'}</span>
              </div>
            </div>
            <p className="settings-panel__meta">{provider.helper}</p>

            {/* Masked key display */}
            <div className="api-key-field">
              <div className="api-key-field__display">
                {providerKeys[provider.keyField] ? (
                  revealed[provider.id] ? (
                    providerKeys[provider.keyField]
                  ) : (
                    getMaskedKey(providerKeys[provider.keyField])
                  )
                ) : (
                  <span className="api-key-field__empty">Not configured</span>
                )}
              </div>
              {providerKeys[provider.keyField] && (
                <button
                  type="button"
                  className="ghost-button api-key-field__reveal"
                  onClick={() => setRevealed((r) => ({ ...r, [provider.id]: !r[provider.id] }))}
                >
                  {revealed[provider.id] ? 'Hide' : 'Reveal'}
                </button>
              )}
            </div>

            <div className="provider-card__input">
              <input
                type="password"
                value={keyInputs[provider.id]}
                onChange={(e) =>
                  setKeyInputs((prev) => ({ ...prev, [provider.id]: e.target.value }))
                }
                placeholder={provider.saved ? 'Enter new key...' : provider.placeholder}
                className="settings-code-input"
              />
              <div className="provider-card__actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => handleRemoveKey(provider.id)}
                  disabled={!provider.saved || keySaving[provider.id]}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => handleSaveKey(provider.id)}
                  disabled={keySaving[provider.id]}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="settings-links">
        <Link to="/settings/models" className="settings-link-card">
          <div className="settings-link-card__content">
            <h4>Model Settings</h4>
            <p>Configure which AI models to use for each provider</p>
          </div>
          <span className="settings-link-card__arrow">&rarr;</span>
        </Link>
        <Link to="/settings/ai-tools" className="settings-link-card">
          <div className="settings-link-card__content">
            <h4>AI Tool Settings</h4>
            <p>Customize system prompts and parameters for AI tools</p>
          </div>
          <span className="settings-link-card__arrow">&rarr;</span>
        </Link>
      </div>
    </section>
  )
}
