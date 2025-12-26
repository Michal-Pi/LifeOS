/**
 * ProjectLinker Component
 *
 * Allows linking and unlinking projects to/from a note.
 * Displays currently linked projects with remove buttons.
 * Provides a dropdown to add new project links.
 */

import { useState } from 'react'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { useAuth } from '@/hooks/useAuth'

export interface ProjectLinkerProps {
  linkedProjectIds: string[]
  onProjectsChange: (projectIds: string[]) => void
  className?: string
}

export function ProjectLinker({ linkedProjectIds, onProjectsChange, className = '' }: ProjectLinkerProps) {
  const { user } = useAuth()
  const { projects, loading } = useTodoOperations({ userId: user?.uid || '' })
  const [showDropdown, setShowDropdown] = useState(false)

  // Get linked projects
  const linkedProjects = projects.filter((p) => linkedProjectIds.includes(p.id))

  // Get available projects (not yet linked)
  const availableProjects = projects.filter((p) => !linkedProjectIds.includes(p.id))

  const handleAddProject = (projectId: string) => {
    if (!linkedProjectIds.includes(projectId)) {
      onProjectsChange([...linkedProjectIds, projectId])
    }
    setShowDropdown(false)
  }

  const handleRemoveProject = (projectId: string) => {
    onProjectsChange(linkedProjectIds.filter((id) => id !== projectId))
  }

  if (loading) {
    return <div className={`project-linker ${className}`}>Loading projects...</div>
  }

  return (
    <div className={`project-linker ${className}`}>
      <div className="linker-header">
        <h3>Linked Projects</h3>
        {availableProjects.length > 0 && (
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="btn-add"
            aria-label="Add project link"
          >
            + Link Project
          </button>
        )}
      </div>

      {/* Linked Projects List */}
      {linkedProjects.length > 0 ? (
        <div className="linked-list">
          {linkedProjects.map((project) => (
            <div key={project.id} className="linked-item">
              <div className="project-info">
                <span className="project-icon">📁</span>
                <div className="project-details">
                  <span className="project-title">{project.title}</span>
                  {project.description && (
                    <span className="project-description">{project.description}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleRemoveProject(project.id)}
                className="btn-remove"
                aria-label={`Remove ${project.title}`}
                title="Unlink project"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-state">No projects linked yet.</p>
      )}

      {/* Dropdown to Add Projects */}
      {showDropdown && availableProjects.length > 0 && (
        <div className="dropdown">
          <div className="dropdown-header">
            <span>Select a project to link</span>
            <button onClick={() => setShowDropdown(false)} className="btn-close" aria-label="Close">
              ×
            </button>
          </div>
          <div className="dropdown-list">
            {availableProjects.map((project) => (
              <div
                key={project.id}
                className="dropdown-item"
                onClick={() => handleAddProject(project.id)}
              >
                <span className="project-icon">📁</span>
                <div className="project-details">
                  <span className="project-title">{project.title}</span>
                  {project.description && (
                    <span className="project-description">{project.description}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .project-linker {
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--background);
        }

        .linker-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }

        .linker-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: var(--foreground);
        }

        .btn-add {
          padding: 6px 12px;
          background: var(--primary);
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          font-weight: 500;
        }

        .btn-add:hover {
          opacity: 0.9;
        }

        .linked-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .linked-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: var(--muted);
          border-radius: 6px;
        }

        .project-info {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .project-icon {
          font-size: 16px;
        }

        .project-details {
          display: flex;
          flex-direction: column;
          gap: 2px;
          flex: 1;
        }

        .project-title {
          font-size: 14px;
          font-weight: 500;
          color: var(--foreground);
        }

        .project-description {
          font-size: 12px;
          color: var(--muted-foreground);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .btn-remove {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: none;
          background: rgba(0, 0, 0, 0.1);
          color: var(--foreground);
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-remove:hover {
          background: var(--destructive);
          color: white;
        }

        .empty-state {
          margin: 0;
          padding: 16px;
          text-align: center;
          color: var(--muted-foreground);
          font-size: 14px;
        }

        .dropdown {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 8px;
          background: var(--background);
          border: 1px solid var(--border);
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 10;
          max-height: 300px;
          overflow-y: auto;
        }

        .dropdown-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          border-bottom: 1px solid var(--border);
          font-size: 14px;
          font-weight: 500;
        }

        .btn-close {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          border: none;
          background: transparent;
          color: var(--foreground);
          cursor: pointer;
          font-size: 20px;
          line-height: 1;
        }

        .btn-close:hover {
          background: var(--muted);
        }

        .dropdown-list {
          padding: 4px;
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          cursor: pointer;
          border-radius: 4px;
        }

        .dropdown-item:hover {
          background: var(--muted);
        }
      `}</style>
    </div>
  )
}
