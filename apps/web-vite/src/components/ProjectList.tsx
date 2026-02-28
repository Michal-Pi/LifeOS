import { useState, useMemo } from 'react'
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
  onDeleteProject?: (projectId: string) => void
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
  onDeleteProject,
  selectedProjectId,
  selectedChapterId,
}: ProjectListProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(new Set())

  const isAllTasksSelected = !selectedProjectId && !selectedChapterId

  const totalTaskCount = tasks.filter((t) => !t.archived).length

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

  const toggleDomain = (domain: string) => {
    setCollapsedDomains((prev) => {
      const next = new Set(prev)
      if (next.has(domain)) {
        next.delete(domain)
      } else {
        next.add(domain)
      }
      return next
    })
  }

  const handleProjectClick = (projectId: string) => {
    onSelectProject(projectId)
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      next.add(projectId)
      return next
    })
  }

  const handleDeleteProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onDeleteProject?.(projectId)
  }

  // Group projects by domain
  const groupedProjects = useMemo(() => {
    const groups = new Map<string, CanonicalProject[]>()
    for (const project of projects) {
      const domain = project.domain || 'Other'
      const existing = groups.get(domain) || []
      existing.push(project)
      groups.set(domain, existing)
    }
    return groups
  }, [projects])

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
          {/* All Tasks option at the top */}
          <li className="project-item">
            <div
              className={`project-row all-tasks-row ${isAllTasksSelected ? 'selected' : ''}`}
              onClick={onSelectOtherTasks}
            >
              <span className="project-title">All Tasks</span>
              <span className="task-count">{totalTaskCount}</span>
            </div>
          </li>

          {/* Projects grouped by domain */}
          {Array.from(groupedProjects.entries()).map(([domain, domainProjects]) => {
            const isDomainCollapsed = collapsedDomains.has(domain)

            return (
              <li key={domain} className="domain-group">
                <div className="domain-group__header" onClick={() => toggleDomain(domain)}>
                  <span className="domain-group__toggle">{isDomainCollapsed ? '▶' : '▼'}</span>
                  <span className="domain-group__label">{domain}</span>
                  <span className="domain-group__count">{domainProjects.length}</span>
                </div>

                {!isDomainCollapsed && (
                  <ul className="domain-group__projects">
                    {domainProjects.map((project) => {
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
                              style={{
                                visibility: projectChapters.length > 0 ? 'visible' : 'hidden',
                              }}
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
                            </div>
                            {onDeleteProject && (
                              <button
                                className="project-delete-button"
                                onClick={(e) => handleDeleteProject(project.id, e)}
                                title="Delete project"
                              >
                                ×
                              </button>
                            )}
                          </div>
                          {tasks.some((t) => t.projectId === project.id) && (
                            <div className="project-item__progress">
                              <div
                                className="project-item__progress-bar"
                                style={{ width: `${progress}%` }}
                                title={`${Math.round(progress)}% complete`}
                              />
                            </div>
                          )}

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
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
