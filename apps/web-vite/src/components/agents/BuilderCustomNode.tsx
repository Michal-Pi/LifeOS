/**
 * BuilderCustomNode Component
 *
 * Custom React Flow node for the workflow builder canvas.
 * Color-coded by type, shows label, agent/model info, prompt preview.
 * Includes floating NodeToolbar for actions and "+" button for adding nodes.
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { Handle, Position, NodeToolbar } from '@xyflow/react'
import type { WorkflowNodeType } from '@lifeos/agents'
import { NODE_TYPE_COLORS } from './workflowLayoutUtils'

export interface BuilderNodeData {
  label: string
  nodeType: WorkflowNodeType
  isStart: boolean
  isSelected: boolean
  nodeId: string
  // Richer content
  agentName?: string
  modelLabel?: string
  promptPreview?: string
  costLabel?: string
  bypassed?: boolean
  muted?: boolean
  groupId?: string
  // Callbacks
  onSelect: (nodeId: string) => void
  onDoubleClick?: (nodeId: string) => void
  onDelete?: (nodeId: string) => void
  onEditProperties?: (nodeId: string) => void
  onAddAfter?: (nodeId: string, type: WorkflowNodeType) => void
  onToggleBypass?: (nodeId: string) => void
  onToggleMute?: (nodeId: string) => void
  onUpdatePrompt?: (nodeId: string, prompt: string) => void
  canDelete: boolean
  [key: string]: unknown
}

const TYPE_LABELS: Record<WorkflowNodeType, string> = {
  agent: 'Agent',
  tool: 'Tool',
  human_input: 'Input',
  join: 'Join',
  end: 'End',
  research_request: 'Research',
  subworkflow: 'Sub-WF',
  // Dialectical phases
  retrieve_context: 'Context',
  generate_theses: 'Theses',
  cross_negation: 'Negation',
  crystallize_contradictions: 'Contradict',
  sublate: 'Sublate',
  meta_reflect: 'Reflect',
  // Deep research phases
  sense_making: 'Sense',
  search_planning: 'Plan',
  search_execution: 'Search',
  source_ingestion: 'Ingest',
  claim_extraction: 'Extract',
  kg_construction: 'KG Build',
  gap_analysis: 'Gap',
  answer_generation: 'Answer',
}

const ADD_MENU_OPTIONS: { type: WorkflowNodeType; label: string; icon: string }[] = [
  { type: 'agent', label: 'Agent', icon: '🤖' },
  { type: 'tool', label: 'Tool', icon: '🔧' },
  { type: 'human_input', label: 'Input', icon: '👤' },
  { type: 'join', label: 'Join', icon: '🔀' },
  { type: 'end', label: 'End', icon: '⏹' },
  { type: 'research_request', label: 'Research', icon: '🔬' },
  { type: 'subworkflow', label: 'Sub-Workflow', icon: '📦' },
]

export function BuilderCustomNode({ data }: { data: BuilderNodeData }) {
  const colors = NODE_TYPE_COLORS[data.nodeType] ?? NODE_TYPE_COLORS.agent
  const isBypassed = data.bypassed ?? false
  const isMuted = data.muted ?? false
  const isEnd = data.nodeType === 'end'
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showInlinePrompt, setShowInlinePrompt] = useState(false)
  const [inlinePromptValue, setInlinePromptValue] = useState('')
  const addMenuRef = useRef<HTMLDivElement>(null)

  // Close add menu on outside click
  useEffect(() => {
    if (!showAddMenu) return
    const handler = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as HTMLElement)) {
        setShowAddMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAddMenu])

  const handleAddNode = useCallback(
    (type: WorkflowNodeType) => {
      data.onAddAfter?.(data.nodeId, type)
      setShowAddMenu(false)
    },
    [data]
  )

  return (
    <>
      {/* Floating toolbar for selected nodes */}
      <NodeToolbar isVisible={data.isSelected} position={Position.Top} offset={8}>
        <div className="builder-node-toolbar">
          <button
            type="button"
            className="builder-node-toolbar__btn"
            onClick={() => data.onEditProperties?.(data.nodeId)}
            title="Edit properties"
          >
            Edit
          </button>
          <button
            type="button"
            className={`builder-node-toolbar__btn${isBypassed ? ' builder-node-toolbar__btn--active' : ''}`}
            onClick={() => data.onToggleBypass?.(data.nodeId)}
            title={isBypassed ? 'Disable bypass (B)' : 'Bypass node (B)'}
          >
            {isBypassed ? '⚡' : '⏭'}
          </button>
          <button
            type="button"
            className={`builder-node-toolbar__btn${isMuted ? ' builder-node-toolbar__btn--active' : ''}`}
            onClick={() => data.onToggleMute?.(data.nodeId)}
            title={isMuted ? 'Unmute node (M)' : 'Mute node (M)'}
          >
            {isMuted ? '🔊' : '🔇'}
          </button>
          {data.canDelete && (
            <button
              type="button"
              className="builder-node-toolbar__btn builder-node-toolbar__btn--danger"
              onClick={() => data.onDelete?.(data.nodeId)}
              title="Delete node"
            >
              Delete
            </button>
          )}
        </div>
      </NodeToolbar>

      <div
        role="button"
        tabIndex={0}
        className={[
          'builder-node',
          data.isSelected ? 'builder-node--selected' : '',
          isBypassed ? 'builder-node--bypassed' : '',
          isMuted ? 'builder-node--muted' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          background: colors.background,
          borderColor: data.isSelected ? undefined : colors.border,
        }}
        onClick={() => data.onSelect(data.nodeId)}
        onDoubleClick={() => data.onDoubleClick?.(data.nodeId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            data.onSelect(data.nodeId)
          }
        }}
      >
        <Handle
          type="target"
          position={Position.Left}
          style={{ background: colors.border, width: 8, height: 8 }}
        />

        {/* Header row: label + type badge */}
        <div className="builder-node__header">
          <div className="builder-node__label">{data.label}</div>
          <div className="builder-node__type-badge" style={{ color: colors.border }}>
            {TYPE_LABELS[data.nodeType]}
          </div>
        </div>

        {/* Agent/model info line */}
        {data.modelLabel && <div className="builder-node__model">{data.modelLabel}</div>}

        {/* Prompt preview */}
        {data.promptPreview && (
          <div className="builder-node__prompt-preview">{data.promptPreview}</div>
        )}

        {/* Inline prompt editor for agent nodes */}
        {data.nodeType === 'agent' && data.agentName && (
          <button
            type="button"
            className="builder-node__inline-prompt-toggle"
            onClick={(e) => {
              e.stopPropagation()
              setShowInlinePrompt(!showInlinePrompt)
              if (!showInlinePrompt && data.promptPreview) {
                setInlinePromptValue(data.promptPreview)
              }
            }}
            title="Quick prompt edit"
          >
            {showInlinePrompt ? '▾ Close' : '▸ Prompt'}
          </button>
        )}
        {showInlinePrompt && (
          <div className="builder-node__inline-prompt" onClick={(e) => e.stopPropagation()}>
            <textarea
              className="builder-node__inline-prompt-textarea"
              value={inlinePromptValue}
              onChange={(e) => setInlinePromptValue(e.target.value)}
              placeholder="Quick prompt notes..."
              rows={3}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              className="builder-node__inline-prompt-save"
              onClick={(e) => {
                e.stopPropagation()
                data.onUpdatePrompt?.(data.nodeId, inlinePromptValue)
                setShowInlinePrompt(false)
              }}
            >
              Save
            </button>
          </div>
        )}

        {/* Cost estimate badge */}
        {data.costLabel && <div className="builder-node__cost-badge">{data.costLabel}</div>}

        {/* Bypass/Mute status badges */}
        {isBypassed && (
          <div className="builder-node__status-badge builder-node__status-badge--bypass">
            BYPASS
          </div>
        )}
        {isMuted && (
          <div className="builder-node__status-badge builder-node__status-badge--mute">MUTED</div>
        )}

        {data.isStart && <div className="builder-node__start-badge">START</div>}

        {/* Source handle with "+" add button */}
        {!isEnd && (
          <div className="builder-node__source-area">
            <Handle
              type="source"
              position={Position.Right}
              style={{ background: colors.border, width: 8, height: 8 }}
            />
            <button
              type="button"
              className="builder-node__add-btn"
              onClick={(e) => {
                e.stopPropagation()
                setShowAddMenu(!showAddMenu)
              }}
              title="Add node after"
            >
              +
            </button>

            {/* Add node dropdown menu */}
            {showAddMenu && (
              <div className="builder-node__add-menu" ref={addMenuRef}>
                {ADD_MENU_OPTIONS.map((option) => (
                  <button
                    key={option.type}
                    type="button"
                    className="builder-node__add-menu-item"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAddNode(option.type)
                    }}
                  >
                    <span className="builder-node__add-menu-icon">{option.icon}</span>
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  )
}
