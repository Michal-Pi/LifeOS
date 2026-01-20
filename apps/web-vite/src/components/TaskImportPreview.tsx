/**
 * Task Import Preview Component
 *
 * Displays a preview of parsed tasks before import.
 */

import type { ParsedTask } from '@/lib/taskMarkdownParser'

interface TaskImportPreviewProps {
  tasks: ParsedTask[]
}

export function TaskImportPreview({ tasks }: TaskImportPreviewProps) {
  const formatTime = (minutes: number): string => {
    if (minutes === 0) return '0m'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins}m`
    if (mins === 0) return `${hours}h`
    return `${hours}h ${mins}m`
  }

  return (
    <div className="task-import-preview">
      {/* Summary */}
      <div className="preview-summary">
        <div className="summary-stat">
          <span className="stat-label">Tasks to Create</span>
          <span className="stat-value">{tasks.length}</span>
        </div>
      </div>

      {/* Tasks List */}
      <div className="preview-section">
        <h3 className="section-title">Preview ({tasks.length} tasks)</h3>
        <ul className="tasks-list">
          {tasks.map((task, taskIdx) => (
            <li key={taskIdx} className="task-item">
              <div className="task-header">
                <span className="task-title">{task.title || '(No title)'}</span>
              </div>
              <div className="task-metadata">
                {task.domain && (
                  <span className="task-tag domain">Domain: {task.domain}</span>
                )}
                {task.project && (
                  <span className="task-tag project">Project: {task.project}</span>
                )}
                {task.chapter && (
                  <span className="task-tag chapter">Chapter: {task.chapter}</span>
                )}
                {task.importance && (
                  <span className="task-tag importance">Importance: {task.importance}</span>
                )}
                {task.urgency && (
                  <span className="task-tag urgency">Urgency: {task.urgency}</span>
                )}
                {task.due && <span className="task-tag due">Due: {task.due}</span>}
                {task.estimate && (
                  <span className="task-tag estimate">Estimate: {formatTime(task.estimate)}</span>
                )}
              </div>
              {task.description && (
                <div className="task-description">
                  {task.description.length > 100
                    ? `${task.description.substring(0, 100)}...`
                    : task.description}
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      <style>{`
        .task-import-preview {
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

        .task-header {
          margin-bottom: 0.5rem;
        }

        .task-title {
          display: block;
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
