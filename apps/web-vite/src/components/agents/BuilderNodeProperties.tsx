/**
 * BuilderNodeProperties Component
 *
 * Properties panel for editing a selected node's configuration.
 */

import { Select, type SelectOption } from '@/components/Select'
import type { AgentConfig, AgentId, JoinAggregationMode, WorkflowNodeType } from '@lifeos/agents'
import type { BuilderNode, BuilderEdge } from './customWorkflowBuilderReducer'

interface BuilderNodePropertiesProps {
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

export function BuilderNodeProperties({
  node,
  agents,
  edges,
  onUpdate,
  onUpdateEdge,
}: BuilderNodePropertiesProps) {
  if (!node) {
    return (
      <div className="node-properties">
        <div className="node-properties__empty">Select a node to edit its properties</div>
      </div>
    )
  }

  const agentOptions: SelectOption[] = [
    { value: '', label: 'None' },
    ...agents.filter((a) => !a.archived).map((a) => ({ value: a.agentId, label: a.name })),
  ]

  const outgoingEdges = edges.filter((e) => e.from === node.id)

  return (
    <div className="node-properties">
      <div className="node-properties__header">Node Properties</div>

      <div className="node-properties__field">
        <label>Label</label>
        <input
          type="text"
          value={node.label}
          onChange={(e) => onUpdate(node.id, { label: e.target.value })}
        />
      </div>

      <div className="node-properties__field">
        <label>Type</label>
        <Select
          value={node.type}
          onChange={(value) => onUpdate(node.id, { type: value as WorkflowNodeType })}
          options={NODE_TYPE_OPTIONS}
        />
      </div>

      {node.type === 'agent' && (
        <div className="node-properties__field">
          <label>Agent</label>
          <Select
            value={node.agentId ?? ''}
            onChange={(value) =>
              onUpdate(node.id, { agentId: (value || undefined) as AgentId | undefined })
            }
            options={agentOptions}
          />
        </div>
      )}

      {(node.type === 'agent' || node.type === 'tool') && (
        <div className="node-properties__field">
          <label>Output Key</label>
          <input
            type="text"
            value={node.outputKey ?? ''}
            onChange={(e) => onUpdate(node.id, { outputKey: e.target.value || undefined })}
            placeholder="Optional output name"
          />
        </div>
      )}

      {node.type === 'join' && (
        <div className="node-properties__field">
          <label>Aggregation Mode</label>
          <Select
            value={node.aggregationMode ?? 'list'}
            onChange={(value) =>
              onUpdate(node.id, { aggregationMode: value as JoinAggregationMode })
            }
            options={AGGREGATION_OPTIONS}
          />
        </div>
      )}

      {outgoingEdges.length > 0 && (
        <div className="node-properties__edges">
          <div className="node-properties__header">Outgoing Edges</div>
          {outgoingEdges.map((edge, index) => {
            const targetNode = edge.to
            return (
              <div key={`${edge.from}-${edge.to}-${index}`} className="node-properties__edge">
                <div className="node-properties__edge-label">To: {targetNode}</div>
                <div className="node-properties__field">
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
                    <div className="node-properties__field">
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
                    <div className="node-properties__field">
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
            )
          })}
        </div>
      )}
    </div>
  )
}
