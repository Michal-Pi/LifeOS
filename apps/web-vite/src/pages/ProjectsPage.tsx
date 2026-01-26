import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { calculateWeightedProgress } from '@/lib/progress'
import { MarkdownImportModal } from '@/components/MarkdownImportModal'

function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

export function ProjectsPage() {
  const { user } = useAuth()
  const userId = user?.uid ?? ''
  const { projects, tasks, loadData, loading } = useTodoOperations({ userId })
  const [showImportModal, setShowImportModal] = useState(false)

  useEffect(() => {
    if (userId) {
      void loadData()
    }
  }, [userId, loadData])

  const timeByProject = useMemo(() => {
    const totals = new Map<string, number>()
    tasks
      .filter((task) => task.completed && task.allocatedTimeMinutes && task.projectId)
      .forEach((task) => {
        const current = totals.get(task.projectId as string) ?? 0
        totals.set(task.projectId as string, current + (task.allocatedTimeMinutes ?? 0))
      })
    return totals
  }, [tasks])

  if (loading) {
    return <div className="loading-screen">Loading project insights...</div>
  }

  return (
    <>
      <div className="projects-page">
        <header className="section-header">
          <div>
            <h2>Project Insights</h2>
            <p className="section-subtitle">Progress and time allocation across active projects.</p>
          </div>
          <button className="primary-button" onClick={() => setShowImportModal(true)}>
            Import from Markdown
          </button>
        </header>

        {projects.length === 0 ? (
          <div className="empty-state">
            <p className="empty-state-text">System idle. Create a project from the Planner page.</p>
            <button className="primary-button" onClick={() => setShowImportModal(true)}>
              Import Project from Markdown
            </button>
          </div>
        ) : (
          <div className="project-review-grid">
            {projects.map((project) => {
              const { progress } = calculateWeightedProgress(
                tasks.filter((task) => task.projectId === project.id)
              )
              const minutes = timeByProject.get(project.id) ?? 0
              return (
                <div key={project.id} className="project-review-card">
                  <h4>{project.title}</h4>
                  <div className="progress-bar-container">
                    <div className="progress-bar" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="progress-text">{progress}% complete</span>
                  <div className="project-metric">
                    <span className="metric-label">Time spent</span>
                    <span className="metric-value">{formatMinutes(minutes)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <MarkdownImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onImportComplete={() => {
          setShowImportModal(false)
          void loadData()
        }}
      />
    </>
  )
}
