/**
 * @fileoverview Search Tools Settings Section
 *
 * API key cards for Serper, Firecrawl, Exa, and Jina Reader with
 * reveal/hide, save, clear, and connectivity test actions.
 */

import { useState, useCallback } from 'react'
import { useSearchToolKeys, type SearchToolKeyType } from '@/hooks/useSearchToolKeys'
import type { SearchToolKeys } from '@/hooks/useSearchToolKeys'
import { testSearchToolKey as testSearchToolKeyCallable } from '@/lib/callables'
import { StatusDot } from '@/components/StatusDot'

export interface SearchToolsSectionProps {
  userId: string | undefined
  onError: (message: string) => void
}

interface SearchToolRow {
  id: SearchToolKeyType
  label: string
  saved: boolean
  placeholder: string
  helper: string
  keyField: keyof SearchToolKeys
}

function getMaskedKey(rawKey: string | undefined | null): string {
  if (!rawKey) return ''
  return `${'\u2022'.repeat(8)}${rawKey.slice(-4)}`
}

export function SearchToolsSection({ userId, onError }: SearchToolsSectionProps) {
  const {
    keys: searchToolKeys,
    isLoading: searchToolKeysLoading,
    saveKey: saveSearchToolKey,
    removeKey: removeSearchToolKey,
  } = useSearchToolKeys(userId)

  const [searchToolKeyInputs, setSearchToolKeyInputs] = useState<Record<SearchToolKeyType, string>>(
    {
      serper: '',
      firecrawl: '',
      exa: '',
      jina: '',
    }
  )
  const [searchToolKeySaving, setSearchToolKeySaving] = useState<
    Partial<Record<SearchToolKeyType, boolean>>
  >({})
  const [searchToolKeyTesting, setSearchToolKeyTesting] = useState<
    Partial<Record<SearchToolKeyType, boolean>>
  >({})
  const [searchToolKeyTestResult, setSearchToolKeyTestResult] = useState<
    Partial<Record<SearchToolKeyType, { ok: boolean; message: string }>>
  >({})
  const [revealed, setRevealed] = useState<Record<string, boolean>>({})

  const handleSaveSearchToolKey = useCallback(
    async (tool: SearchToolKeyType) => {
      const value = searchToolKeyInputs[tool]?.trim()
      if (!value) {
        onError('Please enter a key before saving.')
        return
      }
      try {
        setSearchToolKeySaving((prev) => ({ ...prev, [tool]: true }))
        await saveSearchToolKey(tool, value)
        setSearchToolKeyInputs((prev) => ({ ...prev, [tool]: '' }))
        setSearchToolKeyTestResult((prev) => ({ ...prev, [tool]: undefined }))
      } catch (err) {
        onError((err as Error).message)
      } finally {
        setSearchToolKeySaving((prev) => ({ ...prev, [tool]: false }))
      }
    },
    [searchToolKeyInputs, saveSearchToolKey, onError]
  )

  const handleRemoveSearchToolKey = useCallback(
    async (tool: SearchToolKeyType) => {
      try {
        setSearchToolKeySaving((prev) => ({ ...prev, [tool]: true }))
        await removeSearchToolKey(tool)
        setSearchToolKeyTestResult((prev) => ({ ...prev, [tool]: undefined }))
      } catch (err) {
        onError((err as Error).message)
      } finally {
        setSearchToolKeySaving((prev) => ({ ...prev, [tool]: false }))
      }
    },
    [removeSearchToolKey, onError]
  )

  const handleTestSearchToolKey = useCallback(async (tool: SearchToolKeyType) => {
    setSearchToolKeyTesting((prev) => ({ ...prev, [tool]: true }))
    setSearchToolKeyTestResult((prev) => ({ ...prev, [tool]: undefined }))
    try {
      const result = await testSearchToolKeyCallable({ toolId: tool })
      setSearchToolKeyTestResult((prev) => ({
        ...prev,
        [tool]: { ok: result.data.ok, message: result.data.message },
      }))
    } catch (err) {
      setSearchToolKeyTestResult((prev) => ({
        ...prev,
        [tool]: { ok: false, message: (err as Error).message },
      }))
    } finally {
      setSearchToolKeyTesting((prev) => ({ ...prev, [tool]: false }))
    }
  }, [])

  const searchToolRows: SearchToolRow[] = [
    {
      id: 'serper',
      label: 'Serper',
      saved: Boolean(searchToolKeys.serperKey),
      placeholder: 'your-serper-key...',
      helper: 'Fast SERP results with People Also Ask and knowledge panels.',
      keyField: 'serperKey',
    },
    {
      id: 'firecrawl',
      label: 'Firecrawl',
      saved: Boolean(searchToolKeys.firecrawlKey),
      placeholder: 'fc-...',
      helper: 'Scrape JS-heavy or blocked web pages into clean markdown.',
      keyField: 'firecrawlKey',
    },
    {
      id: 'exa',
      label: 'Exa',
      saved: Boolean(searchToolKeys.exaKey),
      placeholder: 'your-exa-key...',
      helper: 'Neural/semantic search for conceptually related content.',
      keyField: 'exaKey',
    },
    {
      id: 'jina',
      label: 'Jina Reader',
      saved: Boolean(searchToolKeys.jinaKey),
      placeholder: 'jina_...',
      helper:
        'Extract clean markdown from any URL. Free without a key; key gives higher rate limits.',
      keyField: 'jinaKey',
    },
  ]

  return (
    <section id="search-tools">
      <div className="settings-panel">
        <header className="settings-panel__header">
          <div>
            <h2 className="settings-section__title">Search Tools</h2>
            <p className="settings-panel__meta">API keys for web search and content extraction.</p>
          </div>
        </header>

        {searchToolKeysLoading && (
          <p className="settings-panel__meta">Loading search tool keys...</p>
        )}

        <div className="provider-grid">
          {searchToolRows.map((tool) => (
            <div key={tool.id} className="provider-card">
              <div className="provider-card__header">
                <div>
                  <p className="section-label">Search Tool</p>
                  <h4>{tool.label}</h4>
                </div>
                <div className="provider-card__status">
                  <StatusDot
                    status={tool.saved ? 'online' : 'offline'}
                    label={tool.saved ? 'Connected' : 'Inactive'}
                  />
                  <span>{tool.saved ? 'Connected' : 'Inactive'}</span>
                </div>
              </div>
              <p className="settings-panel__meta">{tool.helper}</p>

              {/* Masked key display */}
              <div className="api-key-field">
                <div className="api-key-field__display">
                  {searchToolKeys[tool.keyField] ? (
                    revealed[tool.id] ? (
                      searchToolKeys[tool.keyField]
                    ) : (
                      getMaskedKey(searchToolKeys[tool.keyField])
                    )
                  ) : (
                    <span className="api-key-field__empty">Not configured</span>
                  )}
                </div>
                {searchToolKeys[tool.keyField] && (
                  <button
                    type="button"
                    className="ghost-button api-key-field__reveal"
                    onClick={() => setRevealed((r) => ({ ...r, [tool.id]: !r[tool.id] }))}
                  >
                    {revealed[tool.id] ? 'Hide' : 'Reveal'}
                  </button>
                )}
              </div>

              <div className="provider-card__input">
                <input
                  type="password"
                  value={searchToolKeyInputs[tool.id]}
                  onChange={(e) =>
                    setSearchToolKeyInputs((prev) => ({
                      ...prev,
                      [tool.id]: e.target.value,
                    }))
                  }
                  placeholder={tool.saved ? 'Enter new key...' : tool.placeholder}
                  className="settings-code-input"
                />
                <div className="provider-card__actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => handleRemoveSearchToolKey(tool.id)}
                    disabled={!tool.saved || searchToolKeySaving[tool.id]}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => handleSaveSearchToolKey(tool.id)}
                    disabled={searchToolKeySaving[tool.id]}
                  >
                    Save
                  </button>
                  {tool.saved && (
                    <button
                      type="button"
                      className="ghost-button"
                      onClick={() => handleTestSearchToolKey(tool.id)}
                      disabled={searchToolKeyTesting[tool.id]}
                    >
                      {searchToolKeyTesting[tool.id] ? 'Testing...' : 'Test'}
                    </button>
                  )}
                </div>
              </div>
              {searchToolKeyTestResult[tool.id] && (
                <p
                  className={`settings-panel__meta ${searchToolKeyTestResult[tool.id]?.ok ? 'settings-panel__success' : 'settings-panel__error'}`}
                >
                  {searchToolKeyTestResult[tool.id]?.ok ? '\u2713' : '\u2717'}{' '}
                  {searchToolKeyTestResult[tool.id]?.message}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
