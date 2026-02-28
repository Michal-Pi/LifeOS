/**
 * NodePropertiesModal Component
 *
 * Modal dialog for editing workflow node properties.
 * For agent nodes, includes custom prompt override and agent preview.
 * Modifications to agents create versioned copies instead of modifying originals.
 */

import { useState, useCallback, useMemo } from 'react'
import { Select, type SelectOption } from '@/components/Select'
import { Button } from '@/components/ui/button'
import type { AgentConfig, AgentId, JoinAggregationMode, WorkflowNodeType } from '@lifeos/agents'
import type { BuilderNode, BuilderEdge } from './customWorkflowBuilderReducer'
import '@/styles/components/NodePropertiesModal.css'

interface NodePropertiesModalProps {
  isOpen: boolean
  onClose: () => void
  node: BuilderNode | null
  agents: AgentConfig[]
  edges: BuilderEdge[]
  onUpdate: (nodeId: string, updates: Partial<Omit<BuilderNode, 'id' | 'column' | 'row'>>) => void
  onUpdateEdge: (
    from: string,
    to: string,
    conditionType: string,
    key?: string,
    value?: string
  ) => void
  onCreateAgentVersion: (
    baseAgent: AgentConfig,
    customPrompt: string
  ) => Promise<AgentConfig | null>
}

const NODE_TYPE_OPTIONS: SelectOption[] = [
  { value: 'agent', label: 'Agent' },
  { value: 'tool', label: 'Tool' },
  { value: 'human_input', label: 'Human Input' },
  { value: 'join', label: 'Join' },
  { value: 'end', label: 'End' },
  { value: 'research_request', label: 'Research Request' },
]

const AGGREGATION_OPTIONS: SelectOption[] = [
  { value: 'list', label: 'Combine (list)' },
  { value: 'ranked', label: 'Pick Best (ranked)' },
  { value: 'consensus', label: 'Consensus' },
  { value: 'synthesize', label: 'Synthesize' },
  { value: 'dedup_combine', label: 'Deduplicate Combine' },
]

const CONDITION_TYPE_OPTIONS: SelectOption[] = [
  { value: 'always', label: 'Always' },
  { value: 'equals', label: 'Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'regex', label: 'Regex' },
]

const NONE_AGENT_VALUE = '__none__'

export function NodePropertiesModal({
  isOpen,
  onClose,
  node,
  agents,
  edges,
  onUpdate,
  onUpdateEdge,
  onCreateAgentVersion,
}: NodePropertiesModalProps) {
  const [showAgentPreview, setShowAgentPreview] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [isCreatingVersion, setIsCreatingVersion] = useState(false)

  // Get selected agent
  const selectedAgent = useMemo(() => {
    if (!node?.agentId) return null
    return agents.find((a) => a.agentId === node.agentId) ?? null
  }, [node?.agentId, agents])

  // Get outgoing edges for this node
  const outgoingEdges = useMemo(() => {
    if (!node) return []
    return edges.filter((e) => e.from === node.id)
  }, [node, edges])

  // Agent options for the select
  const agentOptions: SelectOption[] = useMemo(
    () => [
      { value: NONE_AGENT_VALUE, label: 'None' },
      ...agents.filter((a) => !a.archived).map((a) => ({ value: a.agentId, label: a.name })),
    ],
    [agents]
  )

  // Handle creating a versioned copy of the agent with custom prompt
  const handleCreateVersion = useCallback(async () => {
    if (!selectedAgent || !customPrompt.trim()) return

    setIsCreatingVersion(true)
    try {
      const newAgent = await onCreateAgentVersion(selectedAgent, customPrompt)
      if (newAgent && node) {
        // Update node to use the new agent version
        onUpdate(node.id, {
          agentId: newAgent.agentId,
          label: newAgent.name,
        })
        setCustomPrompt('')
      }
    } finally {
      setIsCreatingVersion(false)
    }
  }, [selectedAgent, customPrompt, node, onUpdate, onCreateAgentVersion])

  if (!isOpen || !node) return null

  return (
    <div className="modal-overlay node-properties-modal-overlay" onClick={onClose}>
      <div className="modal-content node-properties-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Node Properties</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="modal-body">
          {/* Basic Properties */}
          <div className="npm-section">
            <div className="npm-section-header">Basic Settings</div>

            <div className="npm-field">
              <label htmlFor="node-label">Label</label>
              <input
                id="node-label"
                type="text"
                value={node.label}
                onChange={(e) => onUpdate(node.id, { label: e.target.value })}
                placeholder="Node label"
              />
            </div>

            <div className="npm-field">
              <label htmlFor="node-type">Type</label>
              <Select
                id="node-type"
                value={node.type}
                onChange={(value) => onUpdate(node.id, { type: value as WorkflowNodeType })}
                options={NODE_TYPE_OPTIONS}
              />
            </div>
          </div>

          {/* Agent-specific Properties */}
          {node.type === 'agent' && (
            <div className="npm-section">
              <div className="npm-section-header">Agent Configuration</div>

              <div className="npm-field">
                <label htmlFor="agent-select">Agent</label>
                <Select
                  id="agent-select"
                  value={node.agentId ?? NONE_AGENT_VALUE}
                  onChange={(value) =>
                    onUpdate(node.id, {
                      agentId: (value === NONE_AGENT_VALUE ? undefined : value) as
                        | AgentId
                        | undefined,
                    })
                  }
                  options={agentOptions}
                />
              </div>

              {selectedAgent && (
                <>
                  {/* Agent Preview Toggle */}
                  <div className="npm-agent-actions">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAgentPreview(!showAgentPreview)}
                    >
                      {showAgentPreview ? 'Hide Agent Details' : 'Preview Agent'}
                    </Button>
                  </div>

                  {/* Agent Preview Panel */}
                  {showAgentPreview && (
                    <div className="npm-agent-preview">
                      <div className="npm-preview-row">
                        <span className="npm-preview-label">Name:</span>
                        <span className="npm-preview-value">{selectedAgent.name}</span>
                      </div>
                      <div className="npm-preview-row">
                        <span className="npm-preview-label">Role:</span>
                        <span className="npm-preview-value npm-badge">{selectedAgent.role}</span>
                      </div>
                      <div className="npm-preview-row">
                        <span className="npm-preview-label">Model:</span>
                        <span className="npm-preview-value">
                          {selectedAgent.modelProvider} / {selectedAgent.modelName}
                        </span>
                      </div>
                      {selectedAgent.description && (
                        <div className="npm-preview-row npm-preview-row--block">
                          <span className="npm-preview-label">Description:</span>
                          <span className="npm-preview-value">{selectedAgent.description}</span>
                        </div>
                      )}
                      <div className="npm-preview-row npm-preview-row--block">
                        <span className="npm-preview-label">System Prompt:</span>
                        <pre className="npm-preview-prompt">{selectedAgent.systemPrompt}</pre>
                      </div>
                    </div>
                  )}

                  {/* Custom Prompt Override */}
                  <div className="npm-custom-prompt">
                    <label htmlFor="custom-prompt">Custom Prompt Override</label>
                    <p className="npm-field-hint">
                      Add a custom prompt to extend or override the agent&apos;s behavior for this
                      workflow. This will create a new version of the agent.
                    </p>
                    <textarea
                      id="custom-prompt"
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="Enter additional instructions or override the system prompt..."
                      rows={4}
                    />
                    {customPrompt.trim() && (
                      <div className="npm-create-version">
                        <Button
                          onClick={handleCreateVersion}
                          disabled={isCreatingVersion}
                          size="sm"
                        >
                          {isCreatingVersion ? 'Creating...' : 'Create Agent Version'}
                        </Button>
                        <span className="npm-version-hint">
                          Creates &quot;{selectedAgent.name} v.2&quot; (or next version)
                        </span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="npm-field">
                <label htmlFor="output-key">Output Key</label>
                <input
                  id="output-key"
                  type="text"
                  value={node.outputKey ?? ''}
                  onChange={(e) => onUpdate(node.id, { outputKey: e.target.value || undefined })}
                  placeholder="Optional output name"
                />
              </div>
            </div>
          )}

          {/* Tool-specific Properties */}
          {node.type === 'tool' && (
            <div className="npm-section">
              <div className="npm-section-header">Tool Configuration</div>
              <div className="npm-field">
                <label htmlFor="tool-output-key">Output Key</label>
                <input
                  id="tool-output-key"
                  type="text"
                  value={node.outputKey ?? ''}
                  onChange={(e) => onUpdate(node.id, { outputKey: e.target.value || undefined })}
                  placeholder="Optional output name"
                />
              </div>
            </div>
          )}

          {/* Join-specific Properties */}
          {node.type === 'join' && (
            <div className="npm-section">
              <div className="npm-section-header">Join Configuration</div>
              <div className="npm-field">
                <label htmlFor="aggregation-mode">Aggregation Mode</label>
                <Select
                  id="aggregation-mode"
                  value={node.aggregationMode ?? 'list'}
                  onChange={(value) =>
                    onUpdate(node.id, { aggregationMode: value as JoinAggregationMode })
                  }
                  options={AGGREGATION_OPTIONS}
                />
              </div>
            </div>
          )}

          {/* Outgoing Edges */}
          {outgoingEdges.length > 0 && (
            <div className="npm-section">
              <div className="npm-section-header">Outgoing Edges</div>
              {outgoingEdges.map((edge, index) => (
                <div key={`${edge.from}-${edge.to}-${index}`} className="npm-edge">
                  <div className="npm-edge-label">To: {edge.to}</div>

                  <div className="npm-field">
                    <label>Condition</label>
                    <Select
                      value={edge.condition.type}
                      onChange={(value) =>
                        onUpdateEdge(
                          edge.from,
                          edge.to,
                          value,
                          edge.condition.key,
                          edge.condition.value
                        )
                      }
                      options={CONDITION_TYPE_OPTIONS}
                    />
                  </div>

                  {edge.condition.type !== 'always' && (
                    <>
                      <div className="npm-field">
                        <label>Key</label>
                        <input
                          type="text"
                          value={edge.condition.key ?? ''}
                          onChange={(e) =>
                            onUpdateEdge(
                              edge.from,
                              edge.to,
                              edge.condition.type,
                              e.target.value,
                              edge.condition.value
                            )
                          }
                          placeholder="Output key to check"
                        />
                      </div>
                      <div className="npm-field">
                        <label>Value</label>
                        <input
                          type="text"
                          value={edge.condition.value ?? ''}
                          onChange={(e) =>
                            onUpdateEdge(
                              edge.from,
                              edge.to,
                              edge.condition.type,
                              edge.condition.key,
                              e.target.value
                            )
                          }
                          placeholder="Value to match"
                        />
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
