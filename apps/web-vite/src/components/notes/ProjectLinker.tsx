/**
 * ProjectLinkerModal Component
 *
 * Modal dialog for linking and unlinking projects and chapters to/from a note.
 * Uses design system Select component for project and chapter selection.
 */

import { useState, useEffect } from 'react'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { useAuth } from '@/hooks/useAuth'
import { Select } from '@/components/Select'
import '@/styles/components/ProjectLinkerModal.css'

export interface ProjectLinkerProps {
  isOpen: boolean
  onClose: () => void
  linkedProjectIds: string[]
  linkedChapterIds?: string[]
  onProjectsChange: (projectIds: string[]) => void
  onChaptersChange?: (chapterIds: string[]) => void
  className?: string
}

export function ProjectLinker({
  isOpen,
  onClose,
  linkedProjectIds,
  linkedChapterIds = [],
  onProjectsChange,
  onChaptersChange,
}: ProjectLinkerProps) {
  const { user } = useAuth()
  const { projects, chapters, loading, loadData } = useTodoOperations({ userId: user?.uid || '' })
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [selectedChapterId, setSelectedChapterId] = useState('')

  // Load projects and chapters when modal opens
  useEffect(() => {
    if (isOpen && user?.uid) {
      void loadData({ includeTasks: false })
    }
  }, [isOpen, user?.uid, loadData])

  // Reset chapter selection when project changes
  useEffect(() => {
    queueMicrotask(() => setSelectedChapterId(''))
  }, [selectedProjectId])

  // Get linked projects
  const linkedProjects = projects.filter((p) => linkedProjectIds.includes(p.id))

  // Get available projects (not yet linked)
  const availableProjects = projects.filter((p) => !linkedProjectIds.includes(p.id))

  // Get chapters for the selected project
  const chaptersForSelected = selectedProjectId
    ? chapters.filter((c) => c.projectId === selectedProjectId)
    : []

  const handleAddProject = () => {
    if (selectedProjectId && !linkedProjectIds.includes(selectedProjectId)) {
      onProjectsChange([...linkedProjectIds, selectedProjectId])
      // Also link the selected chapter if one was picked
      if (selectedChapterId && !linkedChapterIds.includes(selectedChapterId) && onChaptersChange) {
        onChaptersChange([...linkedChapterIds, selectedChapterId])
      }
      setSelectedProjectId('')
      setSelectedChapterId('')
    }
  }

  const handleRemoveProject = (projectId: string) => {
    onProjectsChange(linkedProjectIds.filter((id) => id !== projectId))
    // Also remove any chapters belonging to this project
    if (onChaptersChange) {
      const projectChapterIds = chapters
        .filter((c) => c.projectId === projectId)
        .map((c) => c.id)
      onChaptersChange(linkedChapterIds.filter((id) => !projectChapterIds.includes(id)))
    }
  }

  const handleToggleChapter = (chapterId: string) => {
    if (!onChaptersChange) return
    if (linkedChapterIds.includes(chapterId)) {
      onChaptersChange(linkedChapterIds.filter((id) => id !== chapterId))
    } else {
      onChaptersChange([...linkedChapterIds, chapterId])
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content project-linker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Link to Projects</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            &times;
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
                  {chaptersForSelected.length > 0 && (
                    <div className="linker-chapter-select">
                      <Select
                        id="chapter-select"
                        value={selectedChapterId}
                        onChange={setSelectedChapterId}
                        placeholder="(Optional) Select a chapter..."
                        options={chaptersForSelected.map((ch) => ({
                          value: ch.id,
                          label: ch.title,
                        }))}
                      />
                    </div>
                  )}
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
                    {linkedProjects.map((project) => {
                      const projectChapters = chapters.filter(
                        (c) => c.projectId === project.id
                      )
                      return (
                        <div key={project.id} className="linker-item">
                          <div className="linker-item-info">
                            <span className="linker-item-title">{project.title}</span>
                            {project.description && (
                              <span className="linker-item-desc">{project.description}</span>
                            )}
                            {projectChapters.length > 0 && (
                              <div className="linker-item-chapters">
                                {projectChapters.map((ch) => {
                                  const isLinked = linkedChapterIds.includes(ch.id)
                                  return (
                                    <button
                                      key={ch.id}
                                      type="button"
                                      className={`linker-chapter-tag ${isLinked ? 'linker-chapter-tag--active' : ''}`}
                                      onClick={() => handleToggleChapter(ch.id)}
                                      title={isLinked ? `Unlink ${ch.title}` : `Link ${ch.title}`}
                                    >
                                      {ch.title}
                                    </button>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveProject(project.id)}
                            className="linker-item-remove"
                            aria-label={`Unlink ${project.title}`}
                            title="Unlink project"
                          >
                            &times;
                          </button>
                        </div>
                      )
                    })}
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
