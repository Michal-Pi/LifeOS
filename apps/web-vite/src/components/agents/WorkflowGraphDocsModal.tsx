/**
 * WorkflowGraphDocsModal Component
 *
 * Documentation modal for workflow graph JSON schema.
 * Shows node types, edge conditions, aggregation modes, and examples.
 */

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import './WorkflowGraphDocsModal.css'

interface WorkflowGraphDocsModalProps {
  isOpen: boolean
  onClose: () => void
}

const SEQUENTIAL_EXAMPLE = JSON.stringify(
  {
    version: 1,
    startNodeId: 'research',
    nodes: [
      { id: 'research', type: 'agent', agentId: 'AGENT_ID_1', label: 'Research' },
      { id: 'write', type: 'agent', agentId: 'AGENT_ID_2', label: 'Write' },
      { id: 'done', type: 'end', label: 'Done' },
    ],
    edges: [
      { from: 'research', to: 'write', condition: { type: 'always' } },
      { from: 'write', to: 'done', condition: { type: 'always' } },
    ],
  },
  null,
  2
)

const PARALLEL_EXAMPLE = JSON.stringify(
  {
    version: 1,
    startNodeId: 'analyst_a',
    nodes: [
      { id: 'analyst_a', type: 'agent', agentId: 'AGENT_A', label: 'Analyst A' },
      { id: 'analyst_b', type: 'agent', agentId: 'AGENT_B', label: 'Analyst B' },
      { id: 'merge', type: 'join', label: 'Merge Results', aggregationMode: 'consensus' },
      { id: 'done', type: 'end', label: 'Done' },
    ],
    edges: [
      { from: 'analyst_a', to: 'merge', condition: { type: 'always' } },
      { from: 'analyst_b', to: 'merge', condition: { type: 'always' } },
      { from: 'merge', to: 'done', condition: { type: 'always' } },
    ],
  },
  null,
  2
)

const CONDITIONAL_EXAMPLE = JSON.stringify(
  {
    version: 1,
    startNodeId: 'router',
    nodes: [
      { id: 'router', type: 'agent', agentId: 'ROUTER_ID', label: 'Router', outputKey: 'topic' },
      { id: 'tech', type: 'agent', agentId: 'TECH_ID', label: 'Tech Specialist' },
      { id: 'biz', type: 'agent', agentId: 'BIZ_ID', label: 'Business Specialist' },
      { id: 'done', type: 'end', label: 'Done' },
    ],
    edges: [
      {
        from: 'router',
        to: 'tech',
        condition: { type: 'contains', key: 'topic', value: 'technical' },
      },
      {
        from: 'router',
        to: 'biz',
        condition: { type: 'contains', key: 'topic', value: 'business' },
      },
      { from: 'tech', to: 'done', condition: { type: 'always' } },
      { from: 'biz', to: 'done', condition: { type: 'always' } },
    ],
  },
  null,
  2
)

function ExampleBlock({ title, json }: { title: string; json: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy — clipboard access denied')
    }
  }

  return (
    <div className="graph-docs__example-block">
      <div className="graph-docs__example-header">
        <span>{title}</span>
        <Button variant="ghost" type="button" onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      <pre className="graph-docs__example-code">{json}</pre>
    </div>
  )
}

export function WorkflowGraphDocsModal({ isOpen, onClose }: WorkflowGraphDocsModalProps) {
  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content modal-content--docs" onClick={(e) => e.stopPropagation()}>
        <div className="graph-docs__header">
          <h2>Workflow Graph Reference</h2>
          <Button variant="ghost" type="button" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="graph-docs__body">
          <section className="graph-docs__section">
            <h3>Node Types</h3>
            <table className="graph-docs__table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Key Fields</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>agent</code>
                  </td>
                  <td>Runs an AI agent</td>
                  <td>
                    <code>agentId</code>, <code>outputKey</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code>tool</code>
                  </td>
                  <td>Executes a tool/function</td>
                  <td>
                    <code>toolId</code>, <code>outputKey</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code>human_input</code>
                  </td>
                  <td>Pauses for user input</td>
                  <td>
                    <code>label</code> (prompt text)
                  </td>
                </tr>
                <tr>
                  <td>
                    <code>join</code>
                  </td>
                  <td>Merges parallel branches</td>
                  <td>
                    <code>aggregationMode</code>, <code>outputKey</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code>end</code>
                  </td>
                  <td>Terminal node</td>
                  <td>
                    <code>label</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code>research_request</code>
                  </td>
                  <td>Triggers deep research</td>
                  <td>
                    <code>requestConfig</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="graph-docs__section">
            <h3>Edge Conditions</h3>
            <table className="graph-docs__table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Description</th>
                  <th>Fields</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>always</code>
                  </td>
                  <td>Always follows this edge</td>
                  <td>None</td>
                </tr>
                <tr>
                  <td>
                    <code>equals</code>
                  </td>
                  <td>Follows if output key equals value</td>
                  <td>
                    <code>key</code>, <code>value</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code>contains</code>
                  </td>
                  <td>Follows if output key contains value</td>
                  <td>
                    <code>key</code>, <code>value</code>
                  </td>
                </tr>
                <tr>
                  <td>
                    <code>regex</code>
                  </td>
                  <td>Follows if output key matches regex</td>
                  <td>
                    <code>key</code>, <code>value</code> (regex pattern)
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="graph-docs__section">
            <h3>Aggregation Modes (for join nodes)</h3>
            <table className="graph-docs__table">
              <thead>
                <tr>
                  <th>Mode</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>list</code>
                  </td>
                  <td>Combine all outputs in order</td>
                </tr>
                <tr>
                  <td>
                    <code>ranked</code>
                  </td>
                  <td>Rank and pick the best output</td>
                </tr>
                <tr>
                  <td>
                    <code>consensus</code>
                  </td>
                  <td>Synthesize consensus from all outputs</td>
                </tr>
                <tr>
                  <td>
                    <code>synthesize</code>
                  </td>
                  <td>Remove duplicates, merge into best outcome</td>
                </tr>
                <tr>
                  <td>
                    <code>dedup_combine</code>
                  </td>
                  <td>Combine only unique results</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="graph-docs__section">
            <h3>Graph Limits</h3>
            <table className="graph-docs__table">
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Description</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>maxNodeVisits</code>
                  </td>
                  <td>Maximum times any node can be visited</td>
                  <td>10</td>
                </tr>
                <tr>
                  <td>
                    <code>maxEdgeRepeats</code>
                  </td>
                  <td>Maximum times any edge can be traversed</td>
                  <td>5</td>
                </tr>
              </tbody>
            </table>
          </section>

          <section className="graph-docs__section">
            <h3>Examples</h3>
            <ExampleBlock title="Sequential (2 agents)" json={SEQUENTIAL_EXAMPLE} />
            <ExampleBlock title="Parallel with Join" json={PARALLEL_EXAMPLE} />
            <ExampleBlock title="Conditional Routing" json={CONDITIONAL_EXAMPLE} />
          </section>
        </div>
      </div>
    </div>
  )
}
