/**
 * NodePropertiesPanel Component
 *
 * Slide-in panel for editing workflow node properties.
 * Replaces the former modal to keep the graph visible during editing.
 * For agent nodes, includes custom prompt override and agent preview.
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { Select, type SelectOption } from '@/components/Select'
import { Button } from '@/components/ui/button'
import type { AgentConfig, AgentId, JoinAggregationMode, WorkflowNodeType } from '@lifeos/agents'
import type { BuilderNode, BuilderEdge } from './customWorkflowBuilderReducer'
import '@/styles/components/NodePropertiesPanel.css'

interface NodePropertiesPanelProps {
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
  { value: 'subworkflow', label: 'Sub-Workflow' },
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
  { value: 'llm_evaluate', label: 'AI Evaluate' },
]

const NONE_AGENT_VALUE = '__none__'

export function NodePropertiesPanel({
  isOpen,
  onClose,
  node,
  agents,
  edges,
  onUpdate,
  onUpdateEdge,
  onCreateAgentVersion,
}: NodePropertiesPanelProps) {
  const [showAgentPreview, setShowAgentPreview] = useState(false)
  const [customPrompt, setCustomPrompt] = useState('')
  const [isCreatingVersion, setIsCreatingVersion] = useState(false)

  const selectedAgent = useMemo(() => {
    if (!node?.agentId) return null
    return agents.find((a) => a.agentId === node.agentId) ?? null
  }, [node?.agentId, agents])

  // Pre-populate custom prompt with the agent's system prompt when agent or node type changes
  useEffect(() => {
    if (selectedAgent?.systemPrompt) {
      setCustomPrompt(selectedAgent.systemPrompt)
    } else {
      setCustomPrompt('')
    }
  }, [selectedAgent?.agentId, node?.type])

  const outgoingEdges = useMemo(() => {
    if (!node) return []
    return edges.filter((e) => e.from === node.id)
  }, [node, edges])

  const agentOptions: SelectOption[] = useMemo(
    () => [
      { value: NONE_AGENT_VALUE, label: 'None' },
      ...agents.filter((a) => !a.archived).map((a) => ({ value: a.agentId, label: a.name })),
    ],
    [agents]
  )

  const handleCreateVersion = useCallback(async () => {
    if (!selectedAgent || !customPrompt.trim()) return

    setIsCreatingVersion(true)
    try {
      const newAgent = await onCreateAgentVersion(selectedAgent, customPrompt)
      if (newAgent && node) {
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

  if (!node) return null

  return (
    <div className={`npp-panel${isOpen ? ' npp-panel--open' : ''}`}>
      <div className="npp-panel__header">
        <h3 className="npp-panel__title">Node Properties</h3>
        <button type="button" className="npp-panel__close" onClick={onClose} aria-label="Close">
          &times;
        </button>
      </div>

      <div className="npp-panel__body">
        {/* Basic Properties */}
        <div className="npp-section">
          <div className="npp-section-header">Basic Settings</div>

          <div className="npp-field">
            <label htmlFor="npp-label">Label</label>
            <input
              id="npp-label"
              type="text"
              value={node.label}
              onChange={(e) => onUpdate(node.id, { label: e.target.value })}
              placeholder="Node label"
            />
          </div>

          <div className="npp-field">
            <label htmlFor="npp-type">Type</label>
            <Select
              id="npp-type"
              value={node.type}
              onChange={(value) => onUpdate(node.id, { type: value as WorkflowNodeType })}
              options={NODE_TYPE_OPTIONS}
            />
          </div>
        </div>

        {/* Agent-specific Properties */}
        {node.type === 'agent' && (
          <div className="npp-section">
            <div className="npp-section-header">Agent Configuration</div>

            <div className="npp-field">
              <label htmlFor="npp-agent">Agent</label>
              <Select
                id="npp-agent"
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
                <div className="npp-agent-actions">
                  <Button
                    variant="secondary"
                    onClick={() => setShowAgentPreview(!showAgentPreview)}
                  >
                    {showAgentPreview ? 'Hide Details' : 'Preview Agent'}
                  </Button>
                </div>

                {showAgentPreview && (
                  <div className="npp-agent-preview">
                    <div className="npp-preview-row">
                      <span className="npp-preview-label">Name:</span>
                      <span className="npp-preview-value">{selectedAgent.name}</span>
                    </div>
                    <div className="npp-preview-row">
                      <span className="npp-preview-label">Role:</span>
                      <span className="npp-preview-value npp-badge">{selectedAgent.role}</span>
                    </div>
                    <div className="npp-preview-row">
                      <span className="npp-preview-label">Model:</span>
                      <span className="npp-preview-value">
                        {selectedAgent.modelProvider} / {selectedAgent.modelName}
                      </span>
                    </div>
                    {selectedAgent.description && (
                      <div className="npp-preview-row npp-preview-row--block">
                        <span className="npp-preview-label">Description:</span>
                        <span className="npp-preview-value">{selectedAgent.description}</span>
                      </div>
                    )}
                    <div className="npp-preview-row npp-preview-row--block">
                      <span className="npp-preview-label">System Prompt:</span>
                      <pre className="npp-preview-prompt">{selectedAgent.systemPrompt}</pre>
                    </div>
                  </div>
                )}

                <div className="npp-custom-prompt">
                  <label htmlFor="npp-custom-prompt">Custom Prompt Override</label>
                  <p className="npp-field-hint">
                    The agent&apos;s current system prompt is pre-loaded below. Edit it to create a
                    customized version for this workflow node.
                  </p>
                  <textarea
                    id="npp-custom-prompt"
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="Enter additional instructions or override the system prompt..."
                    rows={8}
                  />
                  {customPrompt.trim() &&
                    customPrompt.trim() !== selectedAgent?.systemPrompt?.trim() && (
                      <div className="npp-create-version">
                        <Button onClick={handleCreateVersion} disabled={isCreatingVersion}>
                          {isCreatingVersion ? 'Creating...' : 'Create Agent Version'}
                        </Button>
                        <span className="npp-version-hint">
                          Creates &quot;{selectedAgent.name} v.2&quot; (or next version)
                        </span>
                      </div>
                    )}
                </div>
              </>
            )}

            <div className="npp-field">
              <label htmlFor="npp-output-key">Output Key</label>
              <input
                id="npp-output-key"
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
          <div className="npp-section">
            <div className="npp-section-header">Tool Configuration</div>
            <div className="npp-field">
              <label htmlFor="npp-tool-output">Output Key</label>
              <input
                id="npp-tool-output"
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
          <div className="npp-section">
            <div className="npp-section-header">Join Configuration</div>
            <div className="npp-field">
              <label htmlFor="npp-agg-mode">Aggregation Mode</label>
              <Select
                id="npp-agg-mode"
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
          <div className="npp-section">
            <div className="npp-section-header">Outgoing Edges</div>
            {outgoingEdges.map((edge, index) => (
              <div key={`${edge.from}-${edge.to}-${index}`} className="npp-edge">
                <div className="npp-edge-label">To: {edge.to}</div>

                <div className="npp-field">
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

                {edge.condition.type !== 'always' && edge.condition.type !== 'llm_evaluate' && (
                  <>
                    <div className="npp-field">
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
                    <div className="npp-field">
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

                {edge.condition.type === 'llm_evaluate' && (
                  <div className="npp-field">
                    <label>AI Evaluation Prompt</label>
                    <p className="npp-field-hint">
                      The LLM will evaluate the previous node&apos;s output against this prompt and
                      return yes/no to decide whether to follow this edge.
                    </p>
                    <textarea
                      value={edge.condition.value ?? ''}
                      onChange={(e) =>
                        onUpdateEdge(
                          edge.from,
                          edge.to,
                          edge.condition.type,
                          'llm_prompt',
                          e.target.value
                        )
                      }
                      placeholder="e.g., Does the output contain a valid JSON response with a 'success' field?"
                      rows={3}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
