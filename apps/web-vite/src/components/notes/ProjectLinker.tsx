/**
 * ProjectLinkerModal Component
 *
 * Modal dialog for linking and unlinking projects to/from a note.
 * Uses design system Select component for project selection.
 */

import { useState } from 'react'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { useAuth } from '@/hooks/useAuth'
import { Select } from '@/components/Select'
import '@/styles/components/ProjectLinkerModal.css'

export interface ProjectLinkerProps {
  isOpen: boolean
  onClose: () => void
  linkedProjectIds: string[]
  onProjectsChange: (projectIds: string[]) => void
}

export function ProjectLinker({
  isOpen,
  onClose,
  linkedProjectIds,
  onProjectsChange,
}: ProjectLinkerProps) {
  const { user } = useAuth()
  const { projects, loading } = useTodoOperations({ userId: user?.uid || '' })
  const [selectedProjectId, setSelectedProjectId] = useState('')

  // Get linked projects
  const linkedProjects = projects.filter((p) => linkedProjectIds.includes(p.id))

  // Get available projects (not yet linked)
  const availableProjects = projects.filter((p) => !linkedProjectIds.includes(p.id))

  const handleAddProject = () => {
    if (selectedProjectId && !linkedProjectIds.includes(selectedProjectId)) {
      onProjectsChange([...linkedProjectIds, selectedProjectId])
      setSelectedProjectId('')
    }
  }

  const handleRemoveProject = (projectId: string) => {
    onProjectsChange(linkedProjectIds.filter((id) => id !== projectId))
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content project-linker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Link to Projects</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="linker-loading">Loading projects...</div>
          ) : (
            <>
              {/* Add Project Section */}
              {availableProjects.length > 0 ? (
                <div className="linker-add-section">
                  <label htmlFor="project-select" className="linker-label">
                    Add a project link
                  </label>
                  <div className="linker-add-row">
                    <Select
                      id="project-select"
                      value={selectedProjectId}
                      onChange={setSelectedProjectId}
                      placeholder="Select a project..."
                      options={availableProjects.map((p) => ({
                        value: p.id,
                        label: p.title,
                      }))}
                    />
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleAddProject}
                      disabled={!selectedProjectId}
                    >
                      Link
                    </button>
                  </div>
                </div>
              ) : linkedProjects.length === 0 ? (
                <p className="linker-empty-hint">
                  No projects available. Create a project first to link notes.
                </p>
              ) : null}

              {/* Linked Projects List */}
              <div className="linker-linked-section">
                <label className="linker-label">Linked projects</label>
                {linkedProjects.length > 0 ? (
                  <div className="linker-list">
                    {linkedProjects.map((project) => (
                      <div key={project.id} className="linker-item">
                        <div className="linker-item-info">
                          <span className="linker-item-title">{project.title}</span>
                          {project.description && (
                            <span className="linker-item-desc">{project.description}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveProject(project.id)}
                          className="linker-item-remove"
                          aria-label={`Unlink ${project.title}`}
                          title="Unlink project"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="linker-empty">No projects linked to this note.</p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
