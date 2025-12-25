import { useState } from 'react'
import type { CanonicalProject, CanonicalMilestone, CanonicalTask } from '@/types/todo'
import { calculateWeightedProgress } from '@/lib/progress'

interface ProjectListProps {
  projects: CanonicalProject[]
  milestones: CanonicalMilestone[]
  tasks: CanonicalTask[]
  onSelectProject: (project: CanonicalProject) => void
  onSelectMilestone: (milestone: CanonicalMilestone) => void
  selectedProjectId?: string
  selectedMilestoneId?: string
}

export function ProjectList({
  projects,
  milestones,
  tasks,
  onSelectProject,
  onSelectMilestone,
  selectedProjectId,
  selectedMilestoneId
}: ProjectListProps) {
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())

  const toggleProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  return (
    <div className="project-list">
      <h3 className="section-label">Projects</h3>
      {projects.length === 0 ? (
        <p className="empty-state-text">No projects yet</p>
      ) : (
        <ul className="project-tree">
          {projects.map(project => {
            const projectMilestones = milestones.filter(m => m.projectId === project.id)
            const isExpanded = expandedProjects.has(project.id)
            const isSelected = selectedProjectId === project.id
            
            const { progress } = calculateWeightedProgress(tasks.filter(t => t.projectId === project.id))

            return (
              <li key={project.id} className="project-item">
                <div 
                  className={`project-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectProject(project)}
                >
                  <button 
                    className="expand-toggle"
                    onClick={(e) => toggleProject(project.id, e)}
                    style={{ visibility: projectMilestones.length > 0 ? 'visible' : 'hidden' }}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                  <span className="project-title">{project.title}</span>
                  {tasks.some(t => t.projectId === project.id) && (
                    <div className="mini-progress-bar" title={`${Math.round(progress)}% complete`}>
                      <div className="mini-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>

                {isExpanded && projectMilestones.length > 0 && (
                  <ul className="milestone-list">
                    {projectMilestones.map(milestone => (
                      <li key={milestone.id}>
                        <button
                          className={`milestone-row ${selectedMilestoneId === milestone.id ? 'selected' : ''}`}
                          onClick={() => onSelectMilestone(milestone)}
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
        </ul>
      )}
    </div>
  )
}