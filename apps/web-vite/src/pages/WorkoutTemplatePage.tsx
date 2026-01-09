/**
 * WorkoutTemplatePage Component
 *
 * Manage workout templates - pre-defined workouts with exercises and targets.
 * Users can create templates for different contexts (Gym/Home/Road)
 * and reuse them in their training plan.
 */

import { useState, useEffect, useCallback } from 'react'
import { useWorkoutTemplates } from '@/hooks/useWorkoutTemplates'
import { TemplateFormModal } from '@/components/training/TemplateFormModal'
import type { WorkoutTemplate, WorkoutContext } from '@lifeos/training'
import { useDialog } from '@/contexts/useDialog'

const CONTEXT_LABELS: Record<WorkoutContext, string> = {
  gym: 'Gym',
  home: 'Home',
  road: 'Road',
}

const CONTEXT_OPTIONS: WorkoutContext[] = ['gym', 'home', 'road']

export function WorkoutTemplatePage() {
  const { confirm } = useDialog()
  const { templates, isLoading, listTemplates, deleteTemplate } = useWorkoutTemplates()

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedContext, setSelectedContext] = useState<WorkoutContext | 'all'>('all')
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<WorkoutTemplate | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load templates on mount
  useEffect(() => {
    const load = async () => {
      try {
        await listTemplates()
      } catch (err) {
        setError((err as Error).message)
      }
    }

    void load()
  }, [listTemplates])

  // Filter templates
  const filteredTemplates = templates.filter((template) => {
    const matchesSearch = template.title.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesContext = selectedContext === 'all' || template.context === selectedContext
    return matchesSearch && matchesContext
  })

  // Sort by title
  const sortedTemplates = [...filteredTemplates].sort((a, b) => a.title.localeCompare(b.title))

  const handleAdd = useCallback(() => {
    setEditingTemplate(null)
    setShowFormModal(true)
  }, [])

  const handleEdit = useCallback((template: WorkoutTemplate) => {
    setEditingTemplate(template)
    setShowFormModal(true)
  }, [])

  const handleDelete = useCallback(
    async (templateId: string) => {
      const confirmed = await confirm({
        title: 'Delete template',
        description: 'Delete this template? This cannot be undone.',
        confirmLabel: 'Delete',
        confirmVariant: 'danger',
      })
      if (!confirmed) return

      try {
        await deleteTemplate(templateId as never)
        setError(null)
      } catch (err) {
        setError((err as Error).message)
      }
    },
    [confirm, deleteTemplate]
  )

  const handleCloseModal = useCallback(() => {
    setShowFormModal(false)
    setEditingTemplate(null)
  }, [])

  const handleSaveModal = useCallback(async () => {
    // Reload templates after save
    await listTemplates()
    setShowFormModal(false)
    setEditingTemplate(null)
  }, [listTemplates])

  return (
    <div className="template-page">
      <header className="template-header">
        <div>
          <p className="section-label">Training</p>
          <h1>Workout Templates</h1>
          <p className="template-meta">
            Create reusable workout templates. {sortedTemplates.length} templates.
          </p>
        </div>
        <button className="primary-button" onClick={handleAdd} disabled={isLoading}>
          + Create Template
        </button>
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Search and Filter */}
      <div className="template-filters">
        <div className="search-box">
          <input
            type="text"
            className="search-input"
            placeholder="Search templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="category-filters">
          <button
            className={`category-filter-button ${selectedContext === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedContext('all')}
          >
            All
          </button>
          {CONTEXT_OPTIONS.map((ctx) => (
            <button
              key={ctx}
              className={`category-filter-button ${selectedContext === ctx ? 'active' : ''}`}
              onClick={() => setSelectedContext(ctx)}
            >
              {CONTEXT_LABELS[ctx]}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid */}
      {isLoading && templates.length === 0 ? (
        <div className="template-loading">
          <p>Loading templates...</p>
        </div>
      ) : sortedTemplates.length === 0 ? (
        <div className="empty-state">
          <p>
            {searchQuery || selectedContext !== 'all'
              ? 'No templates match your filters.'
              : 'No templates yet. Create your first workout template!'}
          </p>
        </div>
      ) : (
        <div className="template-grid">
          {sortedTemplates.map((template) => (
            <div key={template.templateId} className="template-card">
              <div className="template-card-header">
                <h3>{template.title}</h3>
                <span className="template-context-badge">{CONTEXT_LABELS[template.context]}</span>
              </div>

              <div className="template-card-body">
                <div className="template-exercises-count">
                  {template.items.length} exercise{template.items.length !== 1 ? 's' : ''}
                </div>

                {template.items.length > 0 && (
                  <div className="template-exercises-preview">
                    {template.items.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="template-exercise-item">
                        • {item.displayName || item.exerciseId}
                      </div>
                    ))}
                    {template.items.length > 3 && (
                      <div className="template-exercise-more">
                        +{template.items.length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="template-card-footer">
                <button
                  className="edit-button-small"
                  onClick={() => handleEdit(template)}
                  title="Edit template"
                >
                  Edit
                </button>
                <button
                  className="delete-button-small"
                  onClick={() => handleDelete(template.templateId)}
                  title="Delete template"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template Form Modal */}
      <TemplateFormModal
        template={editingTemplate}
        isOpen={showFormModal}
        onClose={handleCloseModal}
        onSave={handleSaveModal}
      />
    </div>
  )
}
