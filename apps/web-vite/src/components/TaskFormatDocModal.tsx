/**
 * Task Format Documentation Modal
 *
 * Displays format specification and examples for task markdown import.
 */

import { toast } from 'sonner'

interface TaskFormatDocModalProps {
  isOpen: boolean
  onClose: () => void
}

export function TaskFormatDocModal({ isOpen, onClose }: TaskFormatDocModalProps) {
  const examples = {
    minimal: `- Complete project proposal [domain:work] [importance:7]`,

    basic: `- Review design mockups [domain:work] [importance:7] [urgency:today]
- Write blog post [domain:projects] [importance:4] [urgency:this_week]
- Schedule dentist appointment [domain:life] [importance:2]`,

    withDescriptions: `- Complete project proposal [domain:work] [importance:7] [urgency:today]
  Description: Review requirements and create initial proposal document

- Write blog post [domain:projects] [importance:4]
  Description: Write about recent learnings in TypeScript

- Schedule dentist appointment [domain:life] [importance:2] [urgency:this_month]`,

    withProjects: `- Implement user authentication [project:Web App] [chapter:Backend] [importance:10] [urgency:today]
- Design login page [project:Web App] [chapter:Frontend] [importance:7]
- Write API documentation [project:Web App] [importance:4]`,

    withDueDates: `- Complete project proposal [domain:work] [importance:7] [due:2024-01-20]
- Write blog post [domain:projects] [importance:4] [due:2024-01-25]
- Schedule dentist appointment [domain:life] [importance:2] [due:2024-02-01]`,

    withEstimates: `- Complete project proposal [domain:work] [importance:7] [urgency:today] [estimate:120]
- Write blog post [domain:projects] [importance:4] [estimate:60]
- Schedule dentist appointment [domain:life] [importance:2] [estimate:15]`,

    full: `- Complete project proposal [domain:work] [importance:7] [urgency:today] [due:2024-01-20] [estimate:120]
  Description: Review requirements and create initial proposal document

- Implement user authentication [project:Web App] [chapter:Backend] [importance:10] [urgency:this_week] [estimate:180]
  Description: Set up OAuth2 flow with Google and GitHub providers

- Write blog post [domain:projects] [importance:4] [estimate:60]
  Description: Write about recent learnings in TypeScript`,
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content task-format-doc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Task Import Format</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body doc-content">
          {/* Quick Start */}
          <section className="doc-section">
            <h3>Quick Start</h3>
            <p>Minimal example with only required fields:</p>
            <div className="code-block">
              <button
                type="button"
                className="copy-button"
                onClick={() => copyToClipboard(examples.minimal)}
                aria-label="Copy code"
              >
                Copy
              </button>
              <pre>
                <code>{examples.minimal}</code>
              </pre>
            </div>
          </section>

          {/* Format Specification */}
          <section className="doc-section">
            <h3>Format Specification</h3>
            <div className="format-table">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Syntax</th>
                    <th>Required</th>
                    <th>Values</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Task Title</td>
                    <td>
                      <code>- Title</code>
                    </td>
                    <td>Yes</td>
                    <td>Any text</td>
                  </tr>
                  <tr>
                    <td>Domain</td>
                    <td>
                      <code>[domain:value]</code>
                    </td>
                    <td>Yes*</td>
                    <td>work, projects, life, learning, wellbeing</td>
                  </tr>
                  <tr>
                    <td>Project</td>
                    <td>
                      <code>[project:Name]</code>
                    </td>
                    <td>No</td>
                    <td>Existing project name</td>
                  </tr>
                  <tr>
                    <td>Chapter</td>
                    <td>
                      <code>[chapter:Name]</code>
                    </td>
                    <td>No</td>
                    <td>Existing chapter name (requires project)</td>
                  </tr>
                  <tr>
                    <td>Importance</td>
                    <td>
                      <code>[importance:value]</code>
                    </td>
                    <td>No</td>
                    <td>1, 2, 4, 7, 10</td>
                  </tr>
                  <tr>
                    <td>Urgency</td>
                    <td>
                      <code>[urgency:value]</code>
                    </td>
                    <td>No</td>
                    <td>today, next_3_days, this_week, this_month, next_month, later</td>
                  </tr>
                  <tr>
                    <td>Due Date</td>
                    <td>
                      <code>[due:YYYY-MM-DD]</code>
                    </td>
                    <td>No</td>
                    <td>ISO date format</td>
                  </tr>
                  <tr>
                    <td>Estimate</td>
                    <td>
                      <code>[estimate:minutes]</code>
                    </td>
                    <td>No</td>
                    <td>Positive integer (minutes)</td>
                  </tr>
                  <tr>
                    <td>Description</td>
                    <td>
                      <code>Description: Text</code>
                    </td>
                    <td>No</td>
                    <td>Multi-line text</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="note">
              * Domain is required unless task is assigned to a project (which has a domain).
            </p>
          </section>

          {/* Field Reference */}
          <section className="doc-section">
            <h3>Field Reference</h3>
            <div className="field-reference">
              <div className="field-group">
                <h4>Domain</h4>
                <p>
                  One of: <code>work</code>, <code>projects</code>, <code>life</code>,{' '}
                  <code>learning</code>, <code>wellbeing</code>
                </p>
                <p className="field-note">
                  Required if task is not assigned to a project. If assigned to a project, the
                  project's domain will be used.
                </p>
              </div>
              <div className="field-group">
                <h4>Project & Chapter</h4>
                <p>
                  Use <code>[project:Name]</code> to assign task to an existing project.
                </p>
                <p>
                  Use <code>[chapter:Name]</code> to assign task to a chapter within a project. The
                  chapter must belong to the specified project.
                </p>
                <p className="field-note">
                  Project and chapter names are matched case-insensitively.
                </p>
              </div>
              <div className="field-group">
                <h4>Importance</h4>
                <p>
                  One of: <code>1</code> (low), <code>2</code>, <code>4</code>, <code>7</code>,{' '}
                  <code>10</code> (critical)
                </p>
                <p className="field-note">Default: 4 if not specified</p>
              </div>
              <div className="field-group">
                <h4>Urgency</h4>
                <p>
                  One of: <code>today</code>, <code>next_3_days</code>, <code>this_week</code>,{' '}
                  <code>this_month</code>, <code>next_month</code>, <code>later</code>
                </p>
                <p className="field-note">
                  Can be automatically calculated from due date if not specified.
                </p>
              </div>
              <div className="field-group">
                <h4>Due Date</h4>
                <p>
                  ISO format: <code>YYYY-MM-DD</code> (e.g., <code>2024-12-31</code>)
                </p>
                <p className="field-note">
                  If specified, urgency will be automatically calculated based on the date.
                </p>
              </div>
              <div className="field-group">
                <h4>Estimate</h4>
                <p>
                  Positive integer representing minutes (e.g., <code>60</code> for 1 hour,{' '}
                  <code>120</code> for 2 hours)
                </p>
              </div>
              <div className="field-group">
                <h4>Description</h4>
                <p>
                  Multi-line description text. Start with <code>Description:</code> on a new line
                  after the task title.
                </p>
                <p className="field-note">
                  Indent description lines with 2 spaces for proper formatting.
                </p>
              </div>
            </div>
          </section>

          {/* Examples */}
          <section className="doc-section">
            <h3>Examples</h3>
            <div className="examples">
              <div className="example-item">
                <h4>Basic Tasks</h4>
                <div className="code-block">
                  <button
                    type="button"
                    className="copy-button"
                    onClick={() => copyToClipboard(examples.basic)}
                    aria-label="Copy code"
                  >
                    Copy
                  </button>
                  <pre>
                    <code>{examples.basic}</code>
                  </pre>
                </div>
              </div>
              <div className="example-item">
                <h4>With Descriptions</h4>
                <div className="code-block">
                  <button
                    type="button"
                    className="copy-button"
                    onClick={() => copyToClipboard(examples.withDescriptions)}
                    aria-label="Copy code"
                  >
                    Copy
                  </button>
                  <pre>
                    <code>{examples.withDescriptions}</code>
                  </pre>
                </div>
              </div>
              <div className="example-item">
                <h4>With Projects and Chapters</h4>
                <div className="code-block">
                  <button
                    type="button"
                    className="copy-button"
                    onClick={() => copyToClipboard(examples.withProjects)}
                    aria-label="Copy code"
                  >
                    Copy
                  </button>
                  <pre>
                    <code>{examples.withProjects}</code>
                  </pre>
                </div>
              </div>
              <div className="example-item">
                <h4>With Due Dates</h4>
                <div className="code-block">
                  <button
                    type="button"
                    className="copy-button"
                    onClick={() => copyToClipboard(examples.withDueDates)}
                    aria-label="Copy code"
                  >
                    Copy
                  </button>
                  <pre>
                    <code>{examples.withDueDates}</code>
                  </pre>
                </div>
              </div>
              <div className="example-item">
                <h4>With Time Estimates</h4>
                <div className="code-block">
                  <button
                    type="button"
                    className="copy-button"
                    onClick={() => copyToClipboard(examples.withEstimates)}
                    aria-label="Copy code"
                  >
                    Copy
                  </button>
                  <pre>
                    <code>{examples.withEstimates}</code>
                  </pre>
                </div>
              </div>
              <div className="example-item">
                <h4>Complete Example</h4>
                <div className="code-block">
                  <button
                    type="button"
                    className="copy-button"
                    onClick={() => copyToClipboard(examples.full)}
                    aria-label="Copy code"
                  >
                    Copy
                  </button>
                  <pre>
                    <code>{examples.full}</code>
                  </pre>
                </div>
              </div>
            </div>
          </section>

          {/* Tips */}
          <section className="doc-section">
            <h3>Tips & Best Practices</h3>
            <ul className="tips-list">
              <li>
                Each task must start with a dash (<code>-</code>)
              </li>
              <li>Metadata tags can be in any order</li>
              <li>Project and chapter names are case-sensitive</li>
              <li>If a project/chapter doesn't exist, the task will fail to import</li>
              <li>You can mix tasks with and without projects in the same import</li>
              <li>Descriptions can span multiple lines if indented</li>
              <li>Empty lines separate tasks</li>
              <li>
                Comments (lines starting with <code>#</code>) are ignored
              </li>
            </ul>
          </section>
        </div>

        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Got it
          </button>
        </div>

        <style>{`
          .task-format-doc-modal {
            max-width: 56rem;
            max-height: 90vh;
          }

          .doc-content {
            max-height: calc(90vh - 8rem);
            overflow-y: auto;
          }

          .doc-section {
            margin-bottom: 2rem;
          }

          .doc-section h3 {
            margin: 0 0 1rem 0;
            font-size: 1.125rem;
            font-weight: 600;
            color: var(--foreground);
          }

          .doc-section h4 {
            margin: 0 0 0.5rem 0;
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--foreground);
          }

          .doc-section p {
            margin: 0.5rem 0;
            font-size: 0.875rem;
            color: var(--muted-foreground);
            line-height: 1.6;
          }

          .note,
          .field-note {
            font-size: 0.8125rem;
            color: var(--muted-foreground);
            font-style: italic;
          }

          .code-block {
            position: relative;
            margin: 1rem 0;
            background: var(--background-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
            overflow: hidden;
          }

          .copy-button {
            position: absolute;
            top: 0.5rem;
            right: 0.5rem;
            padding: 0.25rem 0.5rem;
            background: var(--background);
            border: 1px solid var(--border);
            border-radius: 4px;
            font-size: 0.75rem;
            color: var(--foreground);
            cursor: pointer;
            transition: all var(--motion-fast) var(--motion-ease);
          }

          .copy-button:hover {
            background: var(--background-tertiary);
            border-color: var(--accent);
          }

          .code-block pre {
            margin: 0;
            padding: 1rem;
            overflow-x: auto;
          }

          .code-block code {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 0.8125rem;
            line-height: 1.6;
            color: var(--foreground);
            white-space: pre;
          }

          .format-table {
            overflow-x: auto;
          }

          .format-table table {
            width: 100%;
            border-collapse: collapse;
          }

          .format-table th,
          .format-table td {
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid var(--border);
          }

          .format-table th {
            background: var(--background-secondary);
            font-weight: 600;
            font-size: 0.875rem;
            color: var(--foreground);
          }

          .format-table td {
            font-size: 0.875rem;
            color: var(--muted-foreground);
          }

          .format-table code {
            background: var(--background-secondary);
            padding: 0.125rem 0.25rem;
            border-radius: 4px;
            font-size: 0.8125rem;
          }

          .field-reference {
            display: grid;
            gap: 1rem;
          }

          .field-group {
            padding: 1rem;
            background: var(--background-secondary);
            border: 1px solid var(--border);
            border-radius: 8px;
          }

          .examples {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
          }

          .example-item h4 {
            margin-bottom: 0.75rem;
          }

          .tips-list {
            margin: 0;
            padding-left: 1.25rem;
            list-style: disc;
          }

          .tips-list li {
            margin: 0.5rem 0;
            font-size: 0.875rem;
            color: var(--muted-foreground);
            line-height: 1.6;
          }

          .tips-list code {
            background: var(--background-secondary);
            padding: 0.125rem 0.25rem;
            border-radius: 4px;
            font-size: 0.8125rem;
          }
        `}</style>
      </div>
    </div>
  )
}
