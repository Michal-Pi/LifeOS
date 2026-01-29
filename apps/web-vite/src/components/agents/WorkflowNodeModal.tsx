/**
 * WorkflowNodeModal Component
 *
 * Modal dialog displaying detailed information about a workflow node execution.
 * Shows input, output, messages, tool calls, and errors for the node.
 */

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import type { WorkflowGraphNode, WorkflowStep, Message, ToolCallRecord } from '@lifeos/agents'

export interface WorkflowNodeModalProps {
  node: WorkflowGraphNode | null
  step?: WorkflowStep
  messages: Message[]
  toolCalls: ToolCallRecord[]
  isOpen: boolean
  onClose: () => void
}

export function WorkflowNodeModal({
  node,
  step,
  messages,
  toolCalls,
  isOpen,
  onClose,
}: WorkflowNodeModalProps) {
  // Filter messages related to this step
  const stepMessages = useMemo(() => {
    if (!step) return []
    // Filter messages by timestamp range if workflowStepId is not available
    return messages.filter((msg) => {
      if (msg.createdAtMs >= step.startedAtMs) {
        if (step.completedAtMs) {
          return msg.createdAtMs <= step.completedAtMs
        }
        return true // Still running, include all messages after start
      }
      return false
    })
  }, [step, messages])

  // Filter tool calls related to this step
  const stepToolCalls = useMemo(() => {
    if (!step) return []
    return toolCalls.filter((call) => {
      if (call.startedAtMs >= step.startedAtMs) {
        if (step.completedAtMs) {
          return call.startedAtMs <= step.completedAtMs
        }
        return true
      }
      return false
    })
  }, [step, toolCalls])

  const formatTimestamp = (ms: number) => {
    return new Date(ms).toLocaleString()
  }

  const duration =
    step && step.completedAtMs
      ? ((step.completedAtMs - step.startedAtMs) / 1000).toFixed(2) + 's'
      : null

  if (!isOpen || !node) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content workflow-node-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Workflow Node Details</h2>
            <p className="node-id">{node.label || node.id}</p>
          </div>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Node Metadata */}
          <section className="node-section">
            <h3>Node Information</h3>
            <div className="node-info-grid">
              <div className="info-item">
                <span className="info-label">ID:</span>
                <span className="info-value">{node.id}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Type:</span>
                <span className="info-value">{node.type.replace('_', ' ')}</span>
              </div>
              {node.agentId && (
                <div className="info-item">
                  <span className="info-label">Agent:</span>
                  <span className="info-value">{node.agentId}</span>
                </div>
              )}
              {node.outputKey && (
                <div className="info-item">
                  <span className="info-label">Output Key:</span>
                  <span className="info-value">{node.outputKey}</span>
                </div>
              )}
            </div>
          </section>

          {/* Execution Status */}
          {step && (
            <section className="node-section">
              <h3>Execution Status</h3>
              <div className="node-info-grid">
                <div className="info-item">
                  <span className="info-label">Started:</span>
                  <span className="info-value">{formatTimestamp(step.startedAtMs)}</span>
                </div>
                {step.completedAtMs && (
                  <>
                    <div className="info-item">
                      <span className="info-label">Completed:</span>
                      <span className="info-value">{formatTimestamp(step.completedAtMs)}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Duration:</span>
                      <span className="info-value">{duration}</span>
                    </div>
                  </>
                )}
                <div className="info-item">
                  <span className="info-label">Status:</span>
                  <span
                    className={`status-badge ${step.error ? 'error' : step.completedAtMs ? 'success' : 'running'}`}
                  >
                    {step.error ? 'Failed' : step.completedAtMs ? 'Completed' : 'Running'}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Input */}
          {step?.input && (
            <section className="node-section">
              <h3>Input</h3>
              <pre className="code-block">{JSON.stringify(step.input, null, 2)}</pre>
            </section>
          )}

          {/* Output */}
          {step?.output && (
            <section className="node-section">
              <h3>Output</h3>
              <pre className="code-block">{JSON.stringify(step.output, null, 2)}</pre>
            </section>
          )}

          {/* Error */}
          {step?.error && (
            <section className="node-section error-section">
              <h3>Error</h3>
              <pre className="code-block error-block">{step.error}</pre>
            </section>
          )}

          {/* Messages */}
          {stepMessages.length > 0 && (
            <section className="node-section">
              <h3>Messages ({stepMessages.length})</h3>
              <div className="messages-list">
                {stepMessages.map((msg) => (
                  <div key={msg.messageId} className="message-item">
                    <div className="message-header">
                      <span className={`message-role ${msg.role}`}>{msg.role}</span>
                      <span className="message-time">
                        {new Date(msg.createdAtMs).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="message-content">
                      {typeof msg.content === 'string' ? (
                        <p>{msg.content}</p>
                      ) : (
                        <pre>{JSON.stringify(msg.content, null, 2)}</pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Tool Calls */}
          {stepToolCalls.length > 0 && (
            <section className="node-section">
              <h3>Tool Calls ({stepToolCalls.length})</h3>
              <div className="tool-calls-list">
                {stepToolCalls.map((call) => (
                  <div key={call.toolCallRecordId} className="tool-call-item">
                    <div className="tool-call-header">
                      <span className="tool-name">{call.toolName}</span>
                      <span className={`tool-status ${call.status}`}>{call.status}</span>
                    </div>
                    {call.parameters && (
                      <details className="tool-details">
                        <summary>Parameters</summary>
                        <pre>{JSON.stringify(call.parameters, null, 2)}</pre>
                      </details>
                    )}
                    {call.result && (
                      <details className="tool-details">
                        <summary>Result</summary>
                        <pre>{JSON.stringify(call.result, null, 2)}</pre>
                      </details>
                    )}
                    {call.error && (
                      <div className="tool-error">
                        <strong>Error:</strong> {call.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* No execution data */}
          {!step && (
            <section className="node-section">
              <p className="no-data">This node has not been executed yet.</p>
            </section>
          )}
        </div>

        <div className="modal-actions">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}
