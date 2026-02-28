import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PromptCategory, PromptTemplate, PromptType } from '@lifeos/agents'
import { useAuth } from '@/hooks/useAuth'
import { usePromptLibrary } from '@/hooks/usePromptLibrary'
import { PromptEditor } from '@/components/agents/PromptEditor'
import { PromptCard } from '@/components/agents/PromptCard'
import { EmptyState } from '@/components/EmptyState'
import { SegmentedControl } from '@/components/SegmentedControl'
import { useDialog } from '@/contexts/useDialog'
import './PromptLibraryPage.css'

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

const TYPE_DISPLAY_LABELS: Record<PromptType, string> = {
  agent: 'Agent',
  tool: 'Tool',
  workflow: 'Workflow',
  synthesis: 'Synthesis',
  'tone-of-voice': 'Tone of Voice',
}

const CATEGORY_DISPLAY_LABELS: Record<PromptCategory, string> = {
  'project-management': 'Project Mgmt',
  'content-creation': 'Content',
  research: 'Research',
  review: 'Review',
  coordination: 'Coordination',
  general: 'General',
}

type EditorState =
  | { mode: 'create'; template?: Partial<PromptTemplate> }
  | { mode: 'edit'; template: PromptTemplate }

export function PromptLibraryPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { confirm } = useDialog()
  const [typeFilter, setTypeFilter] = useState<PromptType | 'all'>('all')
  const [categoryFilter, setCategoryFilter] = useState<PromptCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
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

  const { templates, loading, loadTemplates, deleteTemplate, getUsageStats } =
    usePromptLibrary(filters)

  useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  useEffect(() => {
    if (!user) return
    void getUsageStats().then(setUsageStats)
  }, [getUsageStats, user])

  const displayedTemplates = useMemo(() => {
    if (!searchQuery.trim()) return templates
    const q = searchQuery.toLowerCase()
    return templates.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(q))
    )
  }, [templates, searchQuery])

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
          <SegmentedControl
            value="prompts"
            onChange={(value) => navigate(value === 'agents' ? '/agents' : '/agents/prompts')}
            options={[
              { value: 'agents', label: 'Agents' },
              { value: 'prompts', label: 'Prompts' },
            ]}
          />
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

      <div className="prompt-filters">
        <div className="prompt-filters__search">
          <input
            type="text"
            className="prompt-filters__search-input"
            placeholder="Search prompts by name, description, or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <span className="prompt-filters__count">
            {displayedTemplates.length} prompt{displayedTemplates.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="prompt-filters__row">
          <span className="prompt-filters__label">Type</span>
          <div className="prompt-filters__chips">
            {PROMPT_TYPES.map((type) => (
              <button
                key={type}
                className={`filter-chip ${typeFilter === type ? 'filter-chip--active' : ''}`}
                onClick={() => setTypeFilter(type)}
              >
                {type === 'all' ? 'All Types' : TYPE_DISPLAY_LABELS[type]}
              </button>
            ))}
          </div>
        </div>
        <div className="prompt-filters__row">
          <span className="prompt-filters__label">Category</span>
          <div className="prompt-filters__chips">
            {PROMPT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                className={`filter-chip ${categoryFilter === cat ? 'filter-chip--active' : ''}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat === 'all' ? 'All Categories' : CATEGORY_DISPLAY_LABELS[cat]}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`prompt-library-layout ${editorState ? 'prompt-library-layout--panel-open' : ''}`}
      >
        <div className="prompt-library-main">
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
            ) : displayedTemplates.length === 0 ? (
              <EmptyState
                label="Prompts"
                title="No prompts yet"
                description="Create your first prompt template to reuse across runs."
              />
            ) : (
              <div className="prompts-grid">
                {displayedTemplates.map((template) => (
                  <PromptCard
                    key={template.templateId}
                    template={template}
                    onClick={(t) => setEditorState({ mode: 'edit', template: t })}
                    onEdit={(t) => setEditorState({ mode: 'edit', template: t })}
                    onDelete={async (t) => {
                      const confirmed = await confirm({
                        title: 'Delete prompt',
                        description: `Delete prompt "${t.name}"? This action cannot be undone.`,
                        confirmLabel: 'Delete',
                        confirmVariant: 'danger',
                      })
                      if (confirmed) {
                        void deleteTemplate(t.templateId)
                      }
                    }}
                  />
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
              <div className="workflows-grid">
                <div className="workflow-card">
                  <h3>Most Used</h3>
                  <ul className="list">
                    {sortedMostUsed.map((entry) => (
                      <li key={entry.templateId}>
                        {entry.name} · {entry.usageCount}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="workflow-card">
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
        </div>

        {editorState && user?.uid && (
          <aside className="prompt-preview-panel">
            <div className="prompt-preview-panel__header">
              <h3>{editorState.mode === 'edit' ? 'Edit Prompt' : 'New Prompt'}</h3>
              <button
                className="ghost-button"
                onClick={() => setEditorState(null)}
                aria-label="Close panel"
              >
                &times;
              </button>
            </div>
            <div className="prompt-preview-panel__body">
              <PromptEditor
                userId={user.uid}
                mode={editorState.mode}
                templateId={
                  editorState.mode === 'edit' ? editorState.template.templateId : undefined
                }
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
            {editorState.mode === 'edit' && (
              <div className="prompt-preview-panel__actions">
                <button
                  className="primary-button"
                  onClick={() => {
                    navigate(`/workflows?promptId=${editorState.template.templateId}`)
                  }}
                >
                  Use in Workflow
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
