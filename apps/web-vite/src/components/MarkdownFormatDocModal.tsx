/**
 * Markdown Format Documentation Modal
 *
 * Displays format specification and examples for markdown project import.
 */

interface MarkdownFormatDocModalProps {
  isOpen: boolean
  onClose: () => void
}

export function MarkdownFormatDocModal({ isOpen, onClose }: MarkdownFormatDocModalProps) {
  const examples = {
    minimal: `# My Project
**Domain:** work`,

    full: `# Complete Project
**Domain:** life
**Color:** #FF5733
**Objective:** Achieve work-life balance
**Key Results:**
- KR: Reduce work hours to 40/week
- KR: Exercise 3 times per week
**Description:**
This is a comprehensive project description.
---
## Chapter: Chapter One
**Objective:** Learn the basics
**Deadline:** 2024-12-31
**Key Results:**
- KR: Complete course
### Tasks
- Task 1 [urgency:today] [importance:7] [due:2024-01-20] [estimate:60]
  Description: First task description

- Task 2 [importance:10] [estimate:120]
---
## Direct Project Tasks
- Standalone task [urgency:today] [importance:5]`,

    withChapters: `# Project with Chapters
**Domain:** learning
---
## Chapter: Phase 1
**Objective:** Foundation
### Tasks
- Setup environment [importance:7] [estimate:30]

- Learn basics [importance:10] [estimate:120]
---
## Chapter: Phase 2
**Objective:** Advanced topics
### Tasks
- Advanced concepts [importance:7] [estimate:180]`,
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    // Toast notification would be handled by parent
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content markdown-doc-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Markdown Import Format</h2>
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
                    <th>Element</th>
                    <th>Syntax</th>
                    <th>Required</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Project Title</td>
                    <td>
                      <code># Title</code>
                    </td>
                    <td>Yes</td>
                  </tr>
                  <tr>
                    <td>Domain</td>
                    <td>
                      <code>**Domain:** work | projects | life | learning | wellbeing</code>
                    </td>
                    <td>Yes</td>
                  </tr>
                  <tr>
                    <td>Color</td>
                    <td>
                      <code>**Color:** #RRGGBB</code>
                    </td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>Objective</td>
                    <td>
                      <code>**Objective:** Text</code>
                    </td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>Key Results</td>
                    <td>
                      <code>
                        **Key Results:**
                        <br />- KR: Result 1
                      </code>
                    </td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>Description</td>
                    <td>
                      <code>
                        **Description:**
                        <br />
                        Multi-line text
                      </code>
                    </td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>Chapter</td>
                    <td>
                      <code>## Chapter: Title</code>
                    </td>
                    <td>No</td>
                  </tr>
                  <tr>
                    <td>Task</td>
                    <td>
                      <code>- Title [key:value]</code>
                    </td>
                    <td>No</td>
                  </tr>
                </tbody>
              </table>
            </div>
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
              </div>
              <div className="field-group">
                <h4>Color</h4>
                <p>
                  HEX color format: <code>#RRGGBB</code> (e.g., <code>#FF5733</code>)
                </p>
              </div>
              <div className="field-group">
                <h4>Urgency</h4>
                <p>
                  One of: <code>today</code>, <code>next_3_days</code>, <code>this_week</code>,{' '}
                  <code>this_month</code>, <code>next_month</code>, <code>later</code>
                </p>
              </div>
              <div className="field-group">
                <h4>Importance</h4>
                <p>
                  One of: <code>1</code>, <code>2</code>, <code>4</code>, <code>7</code>,{' '}
                  <code>10</code>
                </p>
              </div>
              <div className="field-group">
                <h4>Due Date</h4>
                <p>
                  ISO format: <code>YYYY-MM-DD</code> (e.g., <code>2024-12-31</code>)
                </p>
              </div>
              <div className="field-group">
                <h4>Estimate</h4>
                <p>Positive integer (minutes)</p>
              </div>
            </div>
          </section>

          {/* Complete Examples */}
          <section className="doc-section">
            <h3>Complete Examples</h3>
            <div className="examples">
              <div className="example-item">
                <h4>Full Project Example</h4>
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
              <div className="example-item">
                <h4>Project with Chapters</h4>
                <div className="code-block">
                  <button
                    type="button"
                    className="copy-button"
                    onClick={() => copyToClipboard(examples.withChapters)}
                    aria-label="Copy code"
                  >
                    Copy
                  </button>
                  <pre>
                    <code>{examples.withChapters}</code>
                  </pre>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            Got it
          </button>
        </div>

        <style>{`
          .markdown-doc-modal {
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
        `}</style>
      </div>
    </div>
  )
}
