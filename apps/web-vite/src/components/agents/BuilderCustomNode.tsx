/**
 * BuilderCustomNode Component
 *
 * Custom React Flow node for the workflow builder canvas.
 * Color-coded by type, shows label and type badge.
 */

import { Handle, Position } from '@xyflow/react'
import type { WorkflowNodeType } from '@lifeos/agents'

interface BuilderNodeData {
  label: string
  nodeType: WorkflowNodeType
  isStart: boolean
  isSelected: boolean
  onSelect: (nodeId: string) => void
  nodeId: string
  [key: string]: unknown
}

const NODE_COLORS: Record<WorkflowNodeType, { background: string; border: string }> = {
  agent: { background: 'var(--info-light)', border: 'var(--info)' },
  tool: { background: 'var(--warning-light)', border: 'var(--warning)' },
  human_input: { background: 'var(--error-light)', border: 'var(--error)' },
  join: { background: 'var(--accent-subtle)', border: 'var(--accent-secondary)' },
  end: { background: 'var(--background-secondary)', border: 'var(--border-strong)' },
  research_request: { background: 'var(--success-light)', border: 'var(--success)' },
}

const TYPE_LABELS: Record<WorkflowNodeType, string> = {
  agent: 'Agent',
  tool: 'Tool',
  human_input: 'Input',
  join: 'Join',
  end: 'End',
  research_request: 'Research',
}

export function BuilderCustomNode({ data }: { data: BuilderNodeData }) {
  const colors = NODE_COLORS[data.nodeType] ?? NODE_COLORS.agent
  const isEnd = data.nodeType === 'end'

  return (
    <div
      className={`builder-node ${data.isSelected ? 'builder-node--selected' : ''}`}
      style={{
        background: colors.background,
        borderColor: data.isSelected ? undefined : colors.border,
      }}
      onClick={() => data.onSelect(data.nodeId)}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: colors.border, width: 8, height: 8 }}
      />
      <div className="builder-node__label">{data.label}</div>
      <div className="builder-node__type">{TYPE_LABELS[data.nodeType]}</div>
      {data.isStart && <div className="builder-node__start-badge">START</div>}
      {!isEnd && (
        <Handle
          type="source"
          position={Position.Bottom}
          style={{ background: colors.border, width: 8, height: 8 }}
        />
      )}
    </div>
  )
}
