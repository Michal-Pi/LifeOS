import { useState } from 'react'
import type { CanonicalProject, CanonicalMilestone, CanonicalTask } from '@/types/todo'
import { calculateWeightedProgress } from '@/lib/progress'

interface ProjectListProps {
  projects: CanonicalProject[]
  milestones: CanonicalMilestone[]
  tasks: CanonicalTask[]
  onSelectProject: (projectId: string) => void
  onSelectMilestone: (milestoneId: string) => void
  onSelectOtherTasks: () => void
  onClearSelection: () => void
  selectedProjectId?: string
  selectedMilestoneId?: string
}

export function ProjectList({
  projects,
  milestones,
  tasks,
  onSelectProject,
  onSelectMilestone,
  onSelectOtherTasks,
  onClearSelection,
  selectedProjectId,
  selectedMilestoneId,
}: ProjectListProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  const isOtherTasksSelected = !selectedProjectId && !selectedMilestoneId

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

  // Calculate milestone completion stats
  const getMilestoneStats = (projectId: string) => {
    const projectMilestones = milestones.filter((m) => m.projectId === projectId)
    const completedMilestones = projectMilestones.filter((milestone) => {
      const milestoneTasks = tasks.filter((t) => t.milestoneId === milestone.id)
      if (milestoneTasks.length === 0) return false
      const hasCompletedTask = milestoneTasks.some((t) => t.completed)
      const hasOpenTask = milestoneTasks.some((t) => !t.completed)
      return hasCompletedTask && !hasOpenTask
    })
    return {
      completed: completedMilestones.length,
      total: projectMilestones.length,
    }
  }

  return (
    <div className="project-list">
      <div className="sidebar-header">
        <h3>Projects</h3>
        {(selectedProjectId || selectedMilestoneId) && (
          <button className="ghost-button-small" onClick={onClearSelection} title="Clear selection">
            Clear
          </button>
        )}
      </div>

      <ul className="project-tree">
        {projects.map((project) => {
          const projectMilestones = milestones.filter((m) => m.projectId === project.id)
          const isExpanded = expandedProjects.has(project.id)
          const isSelected = selectedProjectId === project.id
          const milestoneStats = getMilestoneStats(project.id)

          const { progress } = calculateWeightedProgress(
            tasks.filter((t) => t.projectId === project.id)
          )

          return (
            <li key={project.id} className="project-item">
              <div
                className={`project-row ${isSelected ? 'selected' : ''}`}
                onClick={() => handleProjectClick(project.id)}
              >
                <button
                  className="expand-toggle"
                  onClick={(e) => toggleProject(project.id, e)}
                  style={{ visibility: projectMilestones.length > 0 ? 'visible' : 'hidden' }}
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
                <span className="project-title">{project.title}</span>
                <div className="project-badges">
                  {projectMilestones.length > 0 && (
                    <span className="milestone-badge" title="Milestones: completed/total">
                      {milestoneStats.completed}/{milestoneStats.total}
                    </span>
                  )}
                  {tasks.some((t) => t.projectId === project.id) && (
                    <div className="mini-progress-bar" title={`${Math.round(progress)}% complete`}>
                      <div className="mini-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>
              </div>

              {isExpanded && projectMilestones.length > 0 && (
                <ul className="milestone-list">
                  {projectMilestones.map((milestone) => (
                    <li key={milestone.id}>
                      <button
                        className={`milestone-row ${selectedMilestoneId === milestone.id ? 'selected' : ''}`}
                        onClick={() => onSelectMilestone(milestone.id)}
                      >
                        <span className="milestone-icon">◆</span>
                        <span className="milestone-title">{milestone.title}</span>
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
  )
}
