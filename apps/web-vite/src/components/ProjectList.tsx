import { useState } from 'react'
import type { CanonicalProject, CanonicalChapter, CanonicalTask } from '@/types/todo'
import { calculateWeightedProgress } from '@/lib/progress'
import { getProjectColor } from '@/config/domainColors'

interface ProjectListProps {
  projects: CanonicalProject[]
  chapters: CanonicalChapter[]
  tasks: CanonicalTask[]
  onSelectProject: (projectId: string) => void
  onSelectChapter: (chapterId: string) => void
  onSelectOtherTasks: () => void
  onClearSelection: () => void
  selectedProjectId?: string
  selectedChapterId?: string
}

export function ProjectList({
  projects,
  chapters,
  tasks,
  onSelectProject,
  onSelectChapter,
  onSelectOtherTasks,
  onClearSelection,
  selectedProjectId,
  selectedChapterId,
}: ProjectListProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  const isOtherTasksSelected = !selectedProjectId && !selectedChapterId

  const toggleProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  const handleProjectClick = (projectId: string) => {
    // If clicking the already selected project, expand/collapse it but keep it selected
    onSelectProject(projectId)
    // Auto-expand when selecting a project
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      next.add(projectId)
      return next
    })
  }

  // Calculate chapter completion stats
  const getChapterStats = (projectId: string) => {
    const projectChapters = chapters.filter((m) => m.projectId === projectId)
    const completedChapters = projectChapters.filter((chapter) => {
      const chapterTasks = tasks.filter((t) => t.chapterId === chapter.id)
      if (chapterTasks.length === 0) return false
      const hasCompletedTask = chapterTasks.some((t) => t.completed)
      const hasOpenTask = chapterTasks.some((t) => !t.completed)
      return hasCompletedTask && !hasOpenTask
    })
    return {
      completed: completedChapters.length,
      total: projectChapters.length,
    }
  }

  return (
    <>
      <div className="project-list">
        <div className="sidebar-header">
          <h3>Projects</h3>
          <div className="header-actions">
            {(selectedProjectId || selectedChapterId) && (
              <button
                className="ghost-button-small"
                onClick={onClearSelection}
                title="Clear selection"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        <ul className="project-tree">
          {projects.map((project) => {
            const projectChapters = chapters.filter((m) => m.projectId === project.id)
            const isExpanded = expandedProjects.has(project.id)
            const isSelected = selectedProjectId === project.id
            const chapterStats = getChapterStats(project.id)

            const { progress } = calculateWeightedProgress(
              tasks.filter((t) => t.projectId === project.id)
            )

            const projectColor = getProjectColor(project.color, project.domain)

            return (
              <li key={project.id} className="project-item">
                <div
                  className={`project-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => handleProjectClick(project.id)}
                >
                  <div
                    className="project-color-indicator"
                    style={{ backgroundColor: projectColor }}
                  />
                  <button
                    className="expand-toggle"
                    onClick={(e) => toggleProject(project.id, e)}
                    style={{ visibility: projectChapters.length > 0 ? 'visible' : 'hidden' }}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                  <span className="project-title">{project.title}</span>
                  <div className="project-badges">
                    {projectChapters.length > 0 && (
                      <span className="chapter-badge" title="Chapters: completed/total">
                        {chapterStats.completed}/{chapterStats.total}
                      </span>
                    )}
                    {tasks.some((t) => t.projectId === project.id) && (
                      <div
                        className="mini-progress-bar"
                        title={`${Math.round(progress)}% complete`}
                      >
                        <div className="mini-progress-fill" style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>
                </div>

                {isExpanded && projectChapters.length > 0 && (
                  <ul className="chapter-list">
                    {projectChapters.map((chapter) => (
                      <li key={chapter.id}>
                        <button
                          className={`chapter-row ${selectedChapterId === chapter.id ? 'selected' : ''}`}
                          onClick={() => onSelectChapter(chapter.id)}
                        >
                          <span className="chapter-icon">◆</span>
                          <span className="chapter-title">{chapter.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}

          {/* Other tasks item at the bottom */}
          <li className="project-item">
            <div
              className={`project-row other-tasks-row ${isOtherTasksSelected ? 'selected' : ''}`}
              onClick={onSelectOtherTasks}
            >
              <span className="project-title">Other tasks</span>
              <span className="task-count">
                {tasks.filter((t) => !t.projectId && !t.archived).length}
              </span>
            </div>
          </li>
        </ul>
      </div>
    </>
  )
}
