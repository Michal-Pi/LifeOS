/**
 * Markdown Preview Panel Component
 *
 * Displays a hierarchical preview of the parsed project structure
 * before creation.
 */

import type { ParsedProject } from '@/lib/markdownParser'

interface MarkdownPreviewPanelProps {
  project: ParsedProject
}

export function MarkdownPreviewPanel({ project }: MarkdownPreviewPanelProps) {
  const totalTasks =
    project.directTasks.length + project.chapters.reduce((sum, ch) => sum + ch.tasks.length, 0)

  const totalTime = [...project.directTasks, ...project.chapters.flatMap((ch) => ch.tasks)]
    .map((task) => task.estimate || 0)
    .reduce((sum, time) => sum + time, 0)

  const formatTime = (minutes: number): string => {
    if (minutes === 0) return '0m'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins}m`
    if (mins === 0) return `${hours}h`
    return `${hours}h ${mins}m`
  }

  return (
    <div className="markdown-preview-panel">
      {/* Summary Stats */}
      <div className="preview-summary">
        <div className="summary-stat">
          <span className="stat-label">Project</span>
          <span className="stat-value">1</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Chapters</span>
          <span className="stat-value">{project.chapters.length}</span>
        </div>
        <div className="summary-stat">
          <span className="stat-label">Tasks</span>
          <span className="stat-value">{totalTasks}</span>
        </div>
        {totalTime > 0 && (
          <div className="summary-stat">
            <span className="stat-label">Total Time</span>
            <span className="stat-value">{formatTime(totalTime)}</span>
          </div>
        )}
      </div>

      {/* Project Details */}
      <div className="preview-section">
        <h3 className="section-title">Project</h3>
        <div className="project-preview">
          <div className="preview-item">
            <span className="item-label">Title:</span>
            <span className="item-value">{project.title}</span>
          </div>
          {project.domain && (
            <div className="preview-item">
              <span className="item-label">Domain:</span>
              <span className="item-value">{project.domain}</span>
            </div>
          )}
          {project.color && (
            <div className="preview-item">
              <span className="item-label">Color:</span>
              <span className="item-value color-preview" style={{ backgroundColor: project.color }}>
                {project.color}
              </span>
            </div>
          )}
          {project.objective && (
            <div className="preview-item">
              <span className="item-label">Objective:</span>
              <span className="item-value">{project.objective}</span>
            </div>
          )}
          {project.keyResults && project.keyResults.length > 0 && (
            <div className="preview-item">
              <span className="item-label">Key Results:</span>
              <ul className="key-results-list">
                {project.keyResults.map((kr, idx) => (
                  <li key={idx}>{kr}</li>
                ))}
              </ul>
            </div>
          )}
          {project.description && (
            <div className="preview-item">
              <span className="item-label">Description:</span>
              <div className="item-value description-text">{project.description}</div>
            </div>
          )}
        </div>
      </div>

      {/* Chapters */}
      {project.chapters.length > 0 && (
        <div className="preview-section">
          <h3 className="section-title">Chapters ({project.chapters.length})</h3>
          {project.chapters.map((chapter, chapterIdx) => (
            <div key={chapterIdx} className="chapter-preview">
              <h4 className="chapter-title">{chapter.title}</h4>
              {chapter.objective && (
                <div className="preview-item">
                  <span className="item-label">Objective:</span>
                  <span className="item-value">{chapter.objective}</span>
                </div>
              )}
              {chapter.deadline && (
                <div className="preview-item">
                  <span className="item-label">Deadline:</span>
                  <span className="item-value">{chapter.deadline}</span>
                </div>
              )}
              {chapter.keyResults && chapter.keyResults.length > 0 && (
                <div className="preview-item">
                  <span className="item-label">Key Results:</span>
                  <ul className="key-results-list">
                    {chapter.keyResults.map((kr, idx) => (
                      <li key={idx}>{kr}</li>
                    ))}
                  </ul>
                </div>
              )}
              {chapter.description && (
                <div className="preview-item">
                  <span className="item-label">Description:</span>
                  <div className="item-value description-text">{chapter.description}</div>
                </div>
              )}
              {chapter.tasks.length > 0 && (
                <div className="tasks-preview">
                  <span className="tasks-label">Tasks ({chapter.tasks.length}):</span>
                  <ul className="tasks-list">
                    {chapter.tasks.map((task, taskIdx) => (
                      <li key={taskIdx} className="task-item">
                        <span className="task-title">{task.title}</span>
                        <div className="task-metadata">
                          {task.urgency && (
                            <span className="task-tag urgency">urgency: {task.urgency}</span>
                          )}
                          {task.importance && (
                            <span className="task-tag importance">
                              importance: {task.importance}
                            </span>
                          )}
                          {task.due && <span className="task-tag due">due: {task.due}</span>}
                          {task.estimate && (
                            <span className="task-tag estimate">
                              estimate: {formatTime(task.estimate)}
                            </span>
                          )}
                        </div>
                        {task.description && (
                          <div className="task-description">{task.description}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Direct Tasks */}
      {project.directTasks.length > 0 && (
        <div className="preview-section">
          <h3 className="section-title">Direct Project Tasks ({project.directTasks.length})</h3>
          <ul className="tasks-list">
            {project.directTasks.map((task, taskIdx) => (
              <li key={taskIdx} className="task-item">
                <span className="task-title">{task.title}</span>
                <div className="task-metadata">
                  {task.urgency && (
                    <span className="task-tag urgency">urgency: {task.urgency}</span>
                  )}
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
      )}

      <style>{`
        .markdown-preview-panel {
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

        .project-preview,
        .chapter-preview {
          padding: 1rem;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
        }

        .chapter-preview {
          margin-bottom: 1rem;
        }

        .chapter-title {
          margin: 0 0 0.75rem 0;
          font-size: 1rem;
          font-weight: 600;
          color: var(--foreground);
        }

        .preview-item {
          margin-bottom: 0.75rem;
        }

        .preview-item:last-child {
          margin-bottom: 0;
        }

        .item-label {
          display: inline-block;
          min-width: 100px;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--muted-foreground);
        }

        .item-value {
          font-size: 0.875rem;
          color: var(--foreground);
        }

        .color-preview {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          color: white;
          font-weight: 500;
        }

        .description-text {
          margin-top: 0.25rem;
          white-space: pre-line;
          line-height: 1.6;
        }

        .key-results-list {
          margin: 0.25rem 0 0 0;
          padding-left: 1.25rem;
          list-style: disc;
        }

        .key-results-list li {
          margin: 0.25rem 0;
          font-size: 0.875rem;
          color: var(--foreground);
        }

        .tasks-preview {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--border);
        }

        .tasks-label {
          display: block;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--muted-foreground);
        }

        .tasks-list {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .task-item {
          padding: 0.75rem;
          margin-bottom: 0.5rem;
          background: var(--background-secondary);
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
