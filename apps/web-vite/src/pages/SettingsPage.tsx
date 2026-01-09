/**
 * @fileoverview Settings Page - Configuration Control Center
 *
 * This component provides a structured control panel for provider keys,
 * agent memory defaults, quotes, and system sync settings.
 */

import type { Quote } from '@lifeos/core'
import { getDefaultQuotes } from '@lifeos/core'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  createFirestoreQuoteRepository,
  type SortBy,
  type SortOrder,
} from '@/adapters/firestoreQuoteRepository'
import { useAuth } from '@/hooks/useAuth'
import { useTheme } from '@/contexts/useTheme'
import { useAiProviderKeys, type AiProviderKeyType } from '@/hooks/useAiProviderKeys'
import { useAgentMemorySettings } from '@/hooks/useAgentMemorySettings'
import { SystemStatus } from '@/components/SystemStatus'
import { CalendarSettingsPanel } from '@/components/CalendarSettingsPanel'
import { EmptyState } from '@/components/EmptyState'
import { StatusDot } from '@/components/StatusDot'
import { Menu, MenuItem } from '@/components/Menu'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { SegmentedControl } from '@/components/SegmentedControl'

const quoteRepository = createFirestoreQuoteRepository()
const QUOTES_PER_PAGE = 50

export function SettingsPage() {
  const { user } = useAuth()
  const { mode, autoMode, schedule, setMode, setAutoMode, setSchedule } = useTheme()
  const userId = user?.uid ?? ''
  const {
    keys: providerKeys,
    isLoading: providerKeysLoading,
    error: providerKeysError,
    saveKey,
    removeKey,
  } = useAiProviderKeys(user?.uid)
  const {
    settings: memorySettings,
    isLoading: memoryLoading,
    error: memoryError,
    saveMemoryLimit,
    clearMemoryLimit,
  } = useAgentMemorySettings(user?.uid)

  const [quotes, setQuotes] = useState<Quote[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const sortBy: SortBy = 'addedAt'
  const sortOrder: SortOrder = 'desc'
  const [loading, setLoading] = useState(true)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [newQuoteText, setNewQuoteText] = useState('')
  const [newQuoteAuthor, setNewQuoteAuthor] = useState('')
  const [quoteSearch, setQuoteSearch] = useState('')
  const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null)
  const [editQuoteText, setEditQuoteText] = useState('')
  const [editQuoteAuthor, setEditQuoteAuthor] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [deleteQuoteId, setDeleteQuoteId] = useState<string | null>(null)
  const [confirmResetOpen, setConfirmResetOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyInputs, setKeyInputs] = useState({
    openai: '',
    anthropic: '',
    google: '',
    xai: '',
  })
  const [keySaving, setKeySaving] = useState<Partial<Record<AiProviderKeyType, boolean>>>({})
  const [memoryLimitInput, setMemoryLimitInput] = useState('')
  const [memorySaving, setMemorySaving] = useState(false)
  const [pinnedQuoteIds, setPinnedQuoteIds] = useState<string[]>([])
  const effectiveMemoryLimit = memorySettings.memoryMessageLimit ?? 50

  const pinnedStorageKey = userId ? `lifeos:quotes:pinned:${userId}` : 'lifeos:quotes:pinned:anon'

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = window.localStorage.getItem(pinnedStorageKey)
    if (!stored) {
      setPinnedQuoteIds([])
      return
    }
    try {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        setPinnedQuoteIds(parsed.filter((value) => typeof value === 'string'))
      } else {
        setPinnedQuoteIds([])
      }
    } catch {
      setPinnedQuoteIds([])
    }
  }, [pinnedStorageKey])

  const togglePinnedQuote = useCallback(
    (quoteId: string) => {
      setPinnedQuoteIds((prev) => {
        const nextSet = new Set(prev)
        if (nextSet.has(quoteId)) {
          nextSet.delete(quoteId)
        } else {
          nextSet.add(quoteId)
        }
        const next = Array.from(nextSet)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(pinnedStorageKey, JSON.stringify(next))
        }
        return next
      })
      setOpenMenuId(null)
    },
    [pinnedStorageKey]
  )

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!openMenuId) return
      const target = event.target as HTMLElement
      if (!target.closest('.quote-card__actions')) {
        setOpenMenuId(null)
      }
    }

    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [openMenuId])

  const handleSaveKey = useCallback(
    async (provider: AiProviderKeyType) => {
      const value = keyInputs[provider]?.trim()
      if (!value) {
        setError('Please enter a key before saving.')
        return
      }

      try {
        setKeySaving((prev) => ({ ...prev, [provider]: true }))
        await saveKey(provider, value)
        setKeyInputs((prev) => ({ ...prev, [provider]: '' }))
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setKeySaving((prev) => ({ ...prev, [provider]: false }))
      }
    },
    [keyInputs, saveKey]
  )

  const handleRemoveKey = useCallback(
    async (provider: AiProviderKeyType) => {
      try {
        setKeySaving((prev) => ({ ...prev, [provider]: true }))
        await removeKey(provider)
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setKeySaving((prev) => ({ ...prev, [provider]: false }))
      }
    },
    [removeKey]
  )

  useEffect(() => {
    if (memorySettings.memoryMessageLimit) {
      setMemoryLimitInput(String(memorySettings.memoryMessageLimit))
    } else {
      setMemoryLimitInput('')
    }
  }, [memorySettings.memoryMessageLimit])

  const handleSaveMemoryLimit = useCallback(async () => {
    const parsed = Number.parseInt(memoryLimitInput, 10)
    if (Number.isNaN(parsed) || parsed <= 0 || parsed > 200) {
      setError('Memory span must be a number between 1 and 200.')
      return
    }

    try {
      setMemorySaving(true)
      await saveMemoryLimit(parsed)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setMemorySaving(false)
    }
  }, [memoryLimitInput, saveMemoryLimit])

  const handleClearMemoryLimit = useCallback(async () => {
    try {
      setMemorySaving(true)
      await clearMemoryLimit()
      setMemoryLimitInput('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setMemorySaving(false)
    }
  }, [clearMemoryLimit])

  const loadQuotes = useCallback(async () => {
    try {
      setLoading(true)
      const offset = page * QUOTES_PER_PAGE

      const result = await quoteRepository.getQuotesPaginated(
        userId,
        QUOTES_PER_PAGE,
        offset,
        sortBy,
        sortOrder
      )

      if (result.total === 0 && page === 0) {
        const defaults = getDefaultQuotes()
        await quoteRepository.saveQuotes(userId, defaults)
        const newResult = await quoteRepository.getQuotesPaginated(
          userId,
          QUOTES_PER_PAGE,
          0,
          sortBy,
          sortOrder
        )
        setQuotes(newResult.quotes)
        setTotal(newResult.total)
      } else {
        setQuotes(result.quotes)
        setTotal(result.total)
      }

      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [userId, page, sortBy, sortOrder])

  useEffect(() => {
    if (userId && userId.trim().length > 0) {
      void loadQuotes()
    }
  }, [userId, loadQuotes])

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage)
  }, [])

  const handleDeleteRequest = useCallback((quoteId: string) => {
    setDeleteQuoteId(quoteId)
    setOpenMenuId(null)
  }, [])

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteQuoteId) return

    try {
      await quoteRepository.deleteQuote(userId, deleteQuoteId)
      await loadQuotes()
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setDeleteQuoteId(null)
    }
  }, [deleteQuoteId, userId, loadQuotes])

  const handleStartAdd = useCallback(() => {
    setIsAddingNew(true)
    setNewQuoteText('')
    setNewQuoteAuthor('')
  }, [])

  const handleCancelAdd = useCallback(() => {
    setIsAddingNew(false)
    setNewQuoteText('')
    setNewQuoteAuthor('')
  }, [])

  const handleSaveNew = useCallback(async () => {
    if (!newQuoteText.trim()) {
      setError('Quote text is required')
      return
    }

    if (total >= 1000) {
      setError('Maximum of 1000 quotes reached')
      return
    }

    try {
      await quoteRepository.addQuote(userId, {
        text: newQuoteText.trim(),
        author: newQuoteAuthor.trim(),
      })

      setIsAddingNew(false)
      setNewQuoteText('')
      setNewQuoteAuthor('')
      setPage(0)
      await loadQuotes()
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [newQuoteText, newQuoteAuthor, total, userId, loadQuotes])

  const handleStartEdit = useCallback((quote: Quote) => {
    setEditingQuoteId(quote.id)
    setEditQuoteText(quote.text)
    setEditQuoteAuthor(quote.author)
    setOpenMenuId(null)
  }, [])

  const handleCancelEdit = useCallback(() => {
    setEditingQuoteId(null)
    setEditQuoteText('')
    setEditQuoteAuthor('')
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editingQuoteId) return
    if (!editQuoteText.trim()) {
      setError('Quote text is required')
      return
    }

    try {
      await quoteRepository.updateQuote(userId, editingQuoteId, {
        text: editQuoteText.trim(),
        author: editQuoteAuthor.trim(),
      })
      await loadQuotes()
      handleCancelEdit()
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [editingQuoteId, editQuoteText, editQuoteAuthor, userId, loadQuotes, handleCancelEdit])

  const handleResetToDefaults = useCallback(async () => {
    try {
      const defaults = getDefaultQuotes()
      await quoteRepository.saveQuotes(userId, defaults)
      setPage(0)
      await loadQuotes()
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setConfirmResetOpen(false)
    }
  }, [userId, loadQuotes])

  const totalPages = Math.ceil(total / QUOTES_PER_PAGE)
  const hasMore = page < totalPages - 1
  const providerRows: Array<{
    id: AiProviderKeyType
    label: string
    saved: boolean
    placeholder: string
    helper: string
  }> = [
    {
      id: 'openai',
      label: 'OpenAI',
      saved: Boolean(providerKeys.openaiKey),
      placeholder: 'sk-...',
      helper: 'Connect OpenAI to power everyday tasks and drafts.',
    },
    {
      id: 'anthropic',
      label: 'Anthropic',
      saved: Boolean(providerKeys.anthropicKey),
      placeholder: 'sk-ant-...',
      helper: 'Use Claude for long-form reasoning and deep context runs.',
    },
    {
      id: 'google',
      label: 'Google',
      saved: Boolean(providerKeys.googleKey),
      placeholder: 'AI...',
      helper: 'Enable Gemini for search-grounded answers and summaries.',
    },
    {
      id: 'xai',
      label: 'xAI (Grok)',
      saved: Boolean(providerKeys.xaiKey),
      placeholder: 'xai-...',
      helper: 'Bring Grok online for real-time awareness checks.',
    },
  ]

  const pinnedSet = useMemo(() => new Set(pinnedQuoteIds), [pinnedQuoteIds])
  const filteredQuotes = useMemo(() => {
    const query = quoteSearch.trim().toLowerCase()
    if (!query) return quotes
    return quotes.filter((quote) => {
      const textMatch = quote.text.toLowerCase().includes(query)
      const authorMatch = quote.author?.toLowerCase().includes(query)
      return textMatch || authorMatch
    })
  }, [quoteSearch, quotes])

  const pinnedQuotes = filteredQuotes.filter((quote) => pinnedSet.has(quote.id))
  const unpinnedQuotes = filteredQuotes.filter((quote) => !pinnedSet.has(quote.id))

  const memorySpanValue = Number.parseInt(memoryLimitInput, 10)
  const memorySpanDisplay = Number.isNaN(memorySpanValue) ? effectiveMemoryLimit : memorySpanValue
  const memorySpanStatus = memorySettings.memoryMessageLimit ? 'online' : 'idle'
  const isMemoryInputEmpty = memoryLimitInput.trim().length === 0

  return (
    <div className="page-container settings-page">
      <header className="settings-header">
        <div>
          <p className="section-label">Control Center</p>
          <h1>Settings</h1>
          <p className="settings-meta">
            Tune intelligence, defaults, experience, and sync without breaking focus.
          </p>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="settings-sections">
        <section className="settings-section">
          <header className="settings-section__header">
            <div>
              <p className="section-label">Intelligence</p>
              <h2>Intelligence</h2>
              <p className="settings-section__meta">
                Connect providers and define how much context your agents remember by default.
              </p>
            </div>
          </header>

          <div className="settings-section__grid">
            <section className="settings-panel">
              <header className="settings-panel__header">
                <div>
                  <p className="section-label">Appearance</p>
                  <h3>Theme Mode</h3>
                  <p className="settings-panel__meta">
                    Choose a theme or follow system settings. Auto can use OS or a custom schedule.
                  </p>
                </div>
              </header>
              <div className="settings-panel__content theme-controls">
                <div className="theme-control-row">
                  <SegmentedControl
                    value={mode}
                    onChange={(value) => setMode(value as 'light' | 'dark' | 'auto')}
                    options={[
                      { value: 'light', label: 'Light' },
                      { value: 'dark', label: 'Dark' },
                      { value: 'auto', label: 'Auto' },
                    ]}
                  />
                </div>
                {mode === 'auto' && (
                  <div className="theme-auto-controls">
                    <div className="theme-control-row">
                      <SegmentedControl
                        value={autoMode}
                        onChange={(value) => setAutoMode(value as 'system' | 'schedule')}
                        options={[
                          { value: 'system', label: 'Follow OS' },
                          { value: 'schedule', label: 'Scheduled' },
                        ]}
                      />
                    </div>
                    {autoMode === 'schedule' && (
                      <div className="theme-schedule-grid">
                        <div className="form-group">
                          <label htmlFor="theme-schedule-start">Dark mode starts</label>
                          <input
                            id="theme-schedule-start"
                            type="time"
                            value={schedule.start}
                            onChange={(event) =>
                              setSchedule({ ...schedule, start: event.target.value })
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label htmlFor="theme-schedule-end">Dark mode ends</label>
                          <input
                            id="theme-schedule-end"
                            type="time"
                            value={schedule.end}
                            onChange={(event) =>
                              setSchedule({ ...schedule, end: event.target.value })
                            }
                          />
                        </div>
                      </div>
                    )}
                    {autoMode === 'schedule' && (!schedule.start || !schedule.end) && (
                      <p className="settings-panel__meta theme-schedule-hint">
                        Set both start and end times to enable scheduled switching.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </section>
            <section className="settings-panel">
              <header className="settings-panel__header">
                <div>
                  <p className="section-label">AI Providers</p>
                  <h3>Provider Keys</h3>
                  <p className="settings-panel__meta">
                    Keys live per account. Connect only what you plan to use.
                  </p>
                </div>
              </header>

              {providerKeysError && <p className="settings-panel__error">⚠ {providerKeysError}</p>}
              {providerKeysLoading && <p className="settings-panel__meta">Loading keys…</p>}

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
                    <div className="provider-card__input">
                      <input
                        type="password"
                        value={keyInputs[provider.id]}
                        onChange={(e) =>
                          setKeyInputs((prev) => ({ ...prev, [provider.id]: e.target.value }))
                        }
                        placeholder={provider.saved ? '••••••••••••' : provider.placeholder}
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
            </section>

            <section className="settings-panel">
              <header className="settings-panel__header">
                <div>
                  <p className="section-label">Agent Memory</p>
                  <h3>Memory Span</h3>
                  <p className="settings-panel__meta">
                    Define how many recent messages agents should remember when resuming work.
                  </p>
                </div>
              </header>

              {memoryError && <p className="settings-panel__error">⚠ {memoryError}</p>}
              {memoryLoading && <p className="settings-panel__meta">Loading memory settings…</p>}

              <div className="memory-panel">
                <div className="memory-panel__header">
                  <div>
                    <p className="section-label">Default Span</p>
                    <h4>{memorySpanDisplay} messages</h4>
                  </div>
                  <div className="memory-panel__status">
                    <StatusDot status={memorySpanStatus} label="Memory span status" />
                    <span>{memorySettings.memoryMessageLimit ? 'Custom' : 'System default'}</span>
                  </div>
                </div>

                <div className="memory-panel__controls">
                  <input
                    type="range"
                    min={1}
                    max={200}
                    value={memorySpanDisplay}
                    onChange={(e) => setMemoryLimitInput(e.target.value)}
                    className="memory-range"
                  />
                  <div className="memory-panel__inputs">
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={memoryLimitInput}
                      onChange={(e) => setMemoryLimitInput(e.target.value)}
                      placeholder="e.g., 50"
                      className="settings-code-input"
                    />
                    <div className="provider-card__actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void handleClearMemoryLimit()}
                        disabled={!memorySettings.memoryMessageLimit || memorySaving}
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => void handleSaveMemoryLimit()}
                        disabled={memorySaving || isMemoryInputEmpty}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>

                <details className="settings-accordion">
                  <summary>Advanced context rules</summary>
                  <p>
                    Resolution order: run override → workspace override → global default → built-in
                    default (50). Keep the span lean to reduce drift.
                  </p>
                </details>
              </div>
            </section>
          </div>
        </section>

        <section className="settings-section">
          <header className="settings-section__header">
            <div>
              <p className="section-label">Behavior</p>
              <h2>Behavior</h2>
              <p className="settings-section__meta">
                Defaults shape how tasks, routines, and workspaces behave out of the box.
              </p>
            </div>
          </header>

          <div className="settings-section__grid">
            <section className="settings-panel">
              <header className="settings-panel__header">
                <div>
                  <p className="section-label">Defaults</p>
                  <h3>Workspace Defaults</h3>
                  <p className="settings-panel__meta">
                    Set baseline timing, review cadence, and focus blocks in each workspace.
                  </p>
                </div>
              </header>
              <div className="settings-panel__actions">
                <Link to="/workspaces" className="ghost-button">
                  Open Workspaces
                </Link>
              </div>
            </section>
          </div>
        </section>

        <section className="settings-section">
          <header className="settings-section__header">
            <div>
              <p className="section-label">Experience</p>
              <h2>Experience</h2>
              <p className="settings-section__meta">
                Shape the tone of the system with quotes and daily prompts.
              </p>
            </div>
          </header>

          <div className="settings-section__grid">
            <section className="settings-panel">
              <header className="settings-panel__header">
                <div>
                  <p className="section-label">Quotes</p>
                  <h3>Daily Quotes</h3>
                  <p className="settings-panel__meta">
                    Keep a small set of quotes that reset focus and intention.
                  </p>
                </div>
                <div className="settings-panel__actions">
                  <button className="ghost-button" onClick={() => setConfirmResetOpen(true)}>
                    Reset to Defaults
                  </button>
                  <button
                    className="primary-button"
                    onClick={handleStartAdd}
                    disabled={loading || total >= 1000 || isAddingNew}
                  >
                    + Add Quote
                  </button>
                </div>
              </header>

              <div className="quote-controls">
                <input
                  type="text"
                  className="quote-search"
                  placeholder="Search quotes or authors…"
                  value={quoteSearch}
                  onChange={(e) => setQuoteSearch(e.target.value)}
                />
                <div className="quote-count">
                  <span>{total} total</span>
                  <span>•</span>
                  <span>{pinnedQuotes.length} pinned</span>
                </div>
              </div>

              {loading && page === 0 ? (
                <div className="settings-loading">
                  <p>Loading quotes…</p>
                </div>
              ) : total === 0 ? (
                <EmptyState
                  label="Quotes"
                  title="System idle"
                  description="Quotes shape the tone of your day. Add one to guide focus and reset attention."
                  hint="Tip: pin the ones you want to see more often."
                  actionLabel="Add Quote"
                  onAction={handleStartAdd}
                />
              ) : (
                <>
                  {isAddingNew && (
                    <div className="quote-add-form">
                      <h3>Add New Quote</h3>
                      <div className="form-group">
                        <label htmlFor="new-quote-text">Quote Text *</label>
                        <textarea
                          id="new-quote-text"
                          className="quote-textarea"
                          value={newQuoteText}
                          onChange={(e) => setNewQuoteText(e.target.value)}
                          placeholder="Enter quote text..."
                          rows={3}
                          maxLength={500}
                          autoFocus
                        />
                        <span className="char-count">{newQuoteText.length}/500</span>
                      </div>
                      <div className="form-group">
                        <label htmlFor="new-quote-author">Author (optional)</label>
                        <input
                          type="text"
                          id="new-quote-author"
                          className="quote-input"
                          value={newQuoteAuthor}
                          onChange={(e) => setNewQuoteAuthor(e.target.value)}
                          placeholder="Author name (leave blank if unknown)..."
                          maxLength={100}
                        />
                      </div>
                      <div className="form-actions">
                        <button className="ghost-button" onClick={handleCancelAdd}>
                          Cancel
                        </button>
                        <button
                          className="primary-button"
                          onClick={handleSaveNew}
                          disabled={!newQuoteText.trim()}
                        >
                          Save Quote
                        </button>
                      </div>
                    </div>
                  )}

                  {filteredQuotes.length === 0 ? (
                    <div className="settings-empty">
                      <h4>System idle</h4>
                      <p>No quotes match this filter. Refine the search or add a new one.</p>
                      <div className="settings-panel__actions">
                        <button className="ghost-button" onClick={() => setQuoteSearch('')}>
                          Clear Search
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="quote-list">
                      {pinnedQuotes.length > 0 && (
                        <div className="quote-group">
                          <p className="section-label">Pinned</p>
                          {pinnedQuotes.map((quote) => (
                            <article
                              key={quote.id}
                              className="quote-card"
                              title={`Added ${quote.addedAt}`}
                            >
                              <div className="quote-card__content">
                                <p className="quote-text">“{quote.text}”</p>
                                <p className="quote-author">
                                  {quote.author ? quote.author : 'Anonymous'}
                                </p>
                              </div>
                              <div className="quote-card__actions">
                                <button
                                  type="button"
                                  className="quote-menu-button"
                                  onClick={() =>
                                    setOpenMenuId((prev) => (prev === quote.id ? null : quote.id))
                                  }
                                  aria-label="Quote actions"
                                >
                                  ⋯
                                </button>
                                {openMenuId === quote.id && (
                                  <Menu>
                                    <MenuItem onSelect={() => handleStartEdit(quote)}>
                                      Edit
                                    </MenuItem>
                                    <MenuItem onSelect={() => togglePinnedQuote(quote.id)}>
                                      Unpin
                                    </MenuItem>
                                    <MenuItem onSelect={() => handleDeleteRequest(quote.id)}>
                                      Delete
                                    </MenuItem>
                                  </Menu>
                                )}
                              </div>
                              {editingQuoteId === quote.id && (
                                <div className="quote-edit-form">
                                  <div className="form-group">
                                    <label htmlFor={`edit-quote-text-${quote.id}`}>Quote</label>
                                    <textarea
                                      id={`edit-quote-text-${quote.id}`}
                                      className="quote-textarea"
                                      value={editQuoteText}
                                      onChange={(e) => setEditQuoteText(e.target.value)}
                                      rows={3}
                                    />
                                  </div>
                                  <div className="form-group">
                                    <label htmlFor={`edit-quote-author-${quote.id}`}>Author</label>
                                    <input
                                      type="text"
                                      id={`edit-quote-author-${quote.id}`}
                                      className="quote-input"
                                      value={editQuoteAuthor}
                                      onChange={(e) => setEditQuoteAuthor(e.target.value)}
                                    />
                                  </div>
                                  <div className="form-actions">
                                    <button className="ghost-button" onClick={handleCancelEdit}>
                                      Cancel
                                    </button>
                                    <button className="primary-button" onClick={handleSaveEdit}>
                                      Save Changes
                                    </button>
                                  </div>
                                </div>
                              )}
                            </article>
                          ))}
                        </div>
                      )}

                      <div className="quote-group">
                        {pinnedQuotes.length > 0 && <p className="section-label">All Quotes</p>}
                        {unpinnedQuotes.map((quote) => (
                          <article
                            key={quote.id}
                            className="quote-card"
                            title={`Added ${quote.addedAt}`}
                          >
                            <div className="quote-card__content">
                              <p className="quote-text">“{quote.text}”</p>
                              <p className="quote-author">
                                {quote.author ? quote.author : 'Anonymous'}
                              </p>
                            </div>
                            <div className="quote-card__actions">
                              <button
                                type="button"
                                className="quote-menu-button"
                                onClick={() =>
                                  setOpenMenuId((prev) => (prev === quote.id ? null : quote.id))
                                }
                                aria-label="Quote actions"
                              >
                                ⋯
                              </button>
                              {openMenuId === quote.id && (
                                <Menu>
                                  <MenuItem onSelect={() => handleStartEdit(quote)}>Edit</MenuItem>
                                  <MenuItem onSelect={() => togglePinnedQuote(quote.id)}>
                                    Pin
                                  </MenuItem>
                                  <MenuItem onSelect={() => handleDeleteRequest(quote.id)}>
                                    Delete
                                  </MenuItem>
                                </Menu>
                              )}
                            </div>
                            {editingQuoteId === quote.id && (
                              <div className="quote-edit-form">
                                <div className="form-group">
                                  <label htmlFor={`edit-quote-text-${quote.id}`}>Quote</label>
                                  <textarea
                                    id={`edit-quote-text-${quote.id}`}
                                    className="quote-textarea"
                                    value={editQuoteText}
                                    onChange={(e) => setEditQuoteText(e.target.value)}
                                    rows={3}
                                  />
                                </div>
                                <div className="form-group">
                                  <label htmlFor={`edit-quote-author-${quote.id}`}>Author</label>
                                  <input
                                    type="text"
                                    id={`edit-quote-author-${quote.id}`}
                                    className="quote-input"
                                    value={editQuoteAuthor}
                                    onChange={(e) => setEditQuoteAuthor(e.target.value)}
                                  />
                                </div>
                                <div className="form-actions">
                                  <button className="ghost-button" onClick={handleCancelEdit}>
                                    Cancel
                                  </button>
                                  <button className="primary-button" onClick={handleSaveEdit}>
                                    Save Changes
                                  </button>
                                </div>
                              </div>
                            )}
                          </article>
                        ))}
                      </div>
                    </div>
                  )}

                  {totalPages > 1 && (
                    <div className="pagination">
                      <button
                        className="ghost-button"
                        onClick={() => handlePageChange(page - 1)}
                        disabled={page === 0 || loading}
                      >
                        ← Previous
                      </button>
                      <span className="page-info">
                        Page {page + 1} of {totalPages} ({total} total quotes)
                      </span>
                      <button
                        className="ghost-button"
                        onClick={() => handlePageChange(page + 1)}
                        disabled={!hasMore || loading}
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </section>

        <section className="settings-section">
          <header className="settings-section__header">
            <div>
              <p className="section-label">System</p>
              <h2>System</h2>
              <p className="settings-section__meta">
                Monitor sync health and keep calendars aligned.
              </p>
            </div>
          </header>

          <div className="settings-section__grid">
            <SystemStatus />
            <CalendarSettingsPanel />
          </div>
        </section>
      </div>

      <ConfirmDialog
        isOpen={Boolean(deleteQuoteId)}
        title="Delete this quote?"
        description="This removes the quote from your daily rotation. You can re-add it later."
        confirmLabel="Delete"
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setDeleteQuoteId(null)}
      />

      <ConfirmDialog
        isOpen={confirmResetOpen}
        title="Reset to default quotes?"
        description="This replaces your custom quotes with the default library."
        confirmLabel="Reset"
        onConfirm={() => void handleResetToDefaults()}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </div>
  )
}
