import { useEffect, useMemo, useState } from 'react'
import type { PromptCategory, PromptTemplate, PromptType } from '@lifeos/agents'
import { useAuth } from '@/hooks/useAuth'
import { usePromptLibrary } from '@/hooks/usePromptLibrary'
import { PromptEditor } from '@/components/agents/PromptEditor'
import { EmptyState } from '@/components/EmptyState'

const PROMPT_TYPES: Array<PromptType | 'all'> = [
  'all',
  'agent',
  'tone-of-voice',
  'workflow',
  'tool',
  'synthesis',
]

const PROMPT_CATEGORIES: Array<PromptCategory | 'all'> = [
  'all',
  'project-management',
  'content-creation',
  'research',
  'review',
  'coordination',
  'general',
]

type EditorState =
  | { mode: 'create'; template?: Partial<PromptTemplate> }
  | { mode: 'edit'; template: PromptTemplate }

export function PromptLibraryPage() {
  const { user } = useAuth()
  const [typeFilter, setTypeFilter] = useState<PromptType | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<PromptCategory | 'all'>('all')
  const [editorState, setEditorState] = useState<EditorState | null>(null)
  const [usageStats, setUsageStats] = useState<
    Array<{ templateId: string; name: string; usageCount: number }>
  >([])

  const filters = useMemo(
    () => ({
      type: typeFilter === 'all' ? undefined : typeFilter,
      category: categoryFilter === 'all' ? undefined : categoryFilter,
    }),
    [typeFilter, categoryFilter]
  )

  const { templates, loading, loadTemplates, getUsageStats } = usePromptLibrary(filters)

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    if (!user) return
    void getUsageStats().then(setUsageStats)
  }, [getUsageStats, user])

  const sortedLeastUsed = useMemo(() => {
    return [...usageStats].sort((a, b) => a.usageCount - b.usageCount).slice(0, 5)
  }, [usageStats])

  const sortedMostUsed = useMemo(() => usageStats.slice(0, 5), [usageStats])

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Prompt Library</h1>
          <p>Browse, create, and manage reusable prompts with version history.</p>
        </div>
        <div className="page-header__actions">
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              setEditorState({
                mode: 'create',
                template: {
                  type: typeFilter === 'all' ? 'agent' : typeFilter,
                  category: categoryFilter === 'all' ? 'general' : categoryFilter,
                },
              })
            }
          >
            + New Prompt
          </button>
        </div>
      </header>

      <div className="filters">
        <div>
          <label htmlFor="promptTypeFilter">Type</label>
          <select
            id="promptTypeFilter"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as PromptType | 'all')}
          >
            {PROMPT_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="promptCategoryFilter">Category</label>
          <select
            id="promptCategoryFilter"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as PromptCategory | 'all')}
          >
            {PROMPT_CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="filter-summary">
          Showing {templates.length} prompt{templates.length === 1 ? '' : 's'}
        </div>
      </div>

      <section className="settings-panel">
        <header className="settings-panel__header">
          <div>
            <p className="section-label">Library</p>
            <h2>Prompt Templates</h2>
            <p className="settings-panel__meta">
              Filter by type and category to locate reusable prompts.
            </p>
          </div>
        </header>

        {loading ? (
          <div className="loading">Loading prompts...</div>
        ) : templates.length === 0 ? (
          <EmptyState
            label="Prompts"
            title="No prompts yet"
            description="Create your first prompt template to reuse across runs."
          />
        ) : (
          <div className="workspaces-grid">
            {templates.map((template) => (
              <div key={template.templateId} className="workspace-card">
                <div className="card-header">
                  <h3>{template.name}</h3>
                  <span className="badge">{template.type}</span>
                </div>
                <p className="description">{template.description}</p>
                <div className="card-meta">
                  <div>
                    <strong>Category:</strong> {template.category}
                  </div>
                  <div>
                    <strong>Version:</strong> v{template.version}
                  </div>
                  <div>
                    <strong>Usage:</strong> {template.usageCount}
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setEditorState({ mode: 'edit', template })}
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="settings-panel">
        <header className="settings-panel__header">
          <div>
            <p className="section-label">Analytics</p>
            <h2>Usage Statistics</h2>
            <p className="settings-panel__meta">
              Track the prompts that see the most (and least) activity.
            </p>
          </div>
        </header>

        {usageStats.length === 0 ? (
          <div className="empty-state">
            <p>No usage data yet.</p>
          </div>
        ) : (
          <div className="workspaces-grid">
            <div className="workspace-card">
              <h3>Most Used</h3>
              <ul className="list">
                {sortedMostUsed.map((entry) => (
                  <li key={entry.templateId}>
                    {entry.name} · {entry.usageCount}
                  </li>
                ))}
              </ul>
            </div>
            <div className="workspace-card">
              <h3>Least Used</h3>
              <ul className="list">
                {sortedLeastUsed.map((entry) => (
                  <li key={entry.templateId}>
                    {entry.name} · {entry.usageCount}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {editorState && user?.uid && (
        <div className="modal-overlay" onClick={() => setEditorState(null)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <PromptEditor
              userId={user.uid}
              mode={editorState.mode}
              templateId={editorState.mode === 'edit' ? editorState.template.templateId : undefined}
              initialTemplate={editorState.template}
              onClose={() => setEditorState(null)}
              onSaved={() => {
                void loadTemplates()
                void getUsageStats().then(setUsageStats)
              }}
              onDeleted={() => {
                void loadTemplates()
                void getUsageStats().then(setUsageStats)
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
