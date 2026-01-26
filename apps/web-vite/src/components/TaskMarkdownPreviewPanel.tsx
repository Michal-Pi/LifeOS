/**
 * Task Markdown Preview Panel Component
 *
 * Displays a preview of parsed tasks before import.
 */

import type { ParsedTask } from '@/lib/taskMarkdownParser'

interface TaskMarkdownPreviewPanelProps {
  tasks: ParsedTask[]
}

export function TaskMarkdownPreviewPanel({ tasks }: TaskMarkdownPreviewPanelProps) {
  const totalTime = tasks.map((task) => task.estimate || 0).reduce((sum, time) => sum + time, 0)

  const formatTime = (minutes: number): string => {
    if (minutes === 0) return '0m'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins}m`
    if (mins === 0) return `${hours}h`
    return `${hours}h ${mins}m`
  }

  return (
    <div className="task-markdown-preview-panel">
      {/* Summary Stats */}
      <div className="preview-summary">
        <div className="summary-stat">
          <span className="stat-label">Tasks</span>
          <span className="stat-value">{tasks.length}</span>
        </div>
        {totalTime > 0 && (
          <div className="summary-stat">
            <span className="stat-label">Total Time</span>
            <span className="stat-value">{formatTime(totalTime)}</span>
          </div>
        )}
      </div>

      {/* Tasks List */}
      <div className="preview-section">
        <h3 className="section-title">Tasks ({tasks.length})</h3>
        <ul className="tasks-list">
          {tasks.map((task, taskIdx) => (
            <li key={taskIdx} className="task-item">
              <span className="task-title">{task.title || '(No title)'}</span>
              <div className="task-metadata">
                {task.domain && <span className="task-tag domain">domain: {task.domain}</span>}
                {task.project && <span className="task-tag project">project: {task.project}</span>}
                {task.chapter && <span className="task-tag chapter">chapter: {task.chapter}</span>}
                {task.urgency && <span className="task-tag urgency">urgency: {task.urgency}</span>}
                {task.importance && (
                  <span className="task-tag importance">importance: {task.importance}</span>
                )}
                {task.due && <span className="task-tag due">due: {task.due}</span>}
                {task.estimate && (
                  <span className="task-tag estimate">estimate: {formatTime(task.estimate)}</span>
                )}
              </div>
              {task.description && <div className="task-description">{task.description}</div>}
            </li>
          ))}
        </ul>
      </div>

      <style>{`
        .task-markdown-preview-panel {
          max-height: 60vh;
          overflow-y: auto;
          padding: 1rem;
          background: var(--background-secondary);
          border-radius: 8px;
          border: 1px solid var(--border);
        }

        .preview-summary {
          display: flex;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border);
        }

        .summary-stat {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .stat-label {
          font-size: 0.75rem;
          color: var(--muted-foreground);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stat-value {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .preview-section {
          margin-bottom: 1.5rem;
        }

        .section-title {
          margin: 0 0 0.75rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--foreground);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .tasks-list {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .task-item {
          padding: 0.75rem;
          margin-bottom: 0.5rem;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 6px;
        }

        .task-title {
          display: block;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--foreground);
        }

        .task-metadata {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 0.5rem;
        }

        .task-tag {
          padding: 0.125rem 0.5rem;
          font-size: 0.75rem;
          border-radius: 4px;
          background: var(--muted);
          color: var(--muted-foreground);
        }

        .task-description {
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid var(--border);
          font-size: 0.8125rem;
          color: var(--muted-foreground);
          white-space: pre-line;
          line-height: 1.5;
        }
      `}</style>
    </div>
  )
}
