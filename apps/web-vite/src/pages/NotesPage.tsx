import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTodoOperations } from '@/hooks/useTodoOperations'

export function NotesPage() {
  const { user } = useAuth()
  const userId = user?.uid ?? ''
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('projectId')
  const milestoneId = searchParams.get('milestoneId')
  const { projects, milestones, loadData, loading } = useTodoOperations({ userId })

  useEffect(() => {
    if (userId) {
      void loadData({ includeTasks: false })
    }
  }, [userId, loadData])

  const linkedContext = useMemo(() => {
    const project = projectId ? projects.find(p => p.id === projectId) : undefined
    const milestone = milestoneId ? milestones.find(m => m.id === milestoneId) : undefined
    return { project, milestone }
  }, [projectId, milestoneId, projects, milestones])

  if (loading) {
    return <div className="loading-screen">Loading notes...</div>
  }

  return (
    <div className="notes-page">
      <header className="section-header">
        <h2>Notes</h2>
        <p className="section-subtitle">Capture ideas and link them to projects or milestones.</p>
      </header>

      {linkedContext.project || linkedContext.milestone ? (
        <div className="todo-panel">
          <h3>Linked Context</h3>
          {linkedContext.project && <p>Project: {linkedContext.project.title}</p>}
          {linkedContext.milestone && <p>Milestone: {linkedContext.milestone.title}</p>}
        </div>
      ) : (
        <p className="empty-state-text">Select a project or milestone to link notes.</p>
      )}
    </div>
  )
}
