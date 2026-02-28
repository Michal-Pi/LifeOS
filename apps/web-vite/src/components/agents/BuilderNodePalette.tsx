/**
 * BuilderNodePalette Component
 *
 * Sidebar palette for adding nodes and structural operations.
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { AgentConfig, WorkflowNodeType } from '@lifeos/agents'

interface BuilderNodePaletteProps {
  selectedNodeId: string | null
  onAddNode: (type: WorkflowNodeType) => void
  onAddAgentNode: (agentId: string, agentName: string) => void
  onSplitParallel: (branchCount: number) => void
  onAddConditional: () => void
  onDeleteNode: () => void
  onEditNodeProperties?: () => void
  agents?: AgentConfig[]
}

const NODE_TYPE_OPTIONS: { type: WorkflowNodeType; label: string; description: string }[] = [
  { type: 'agent', label: 'Agent', description: 'Run an AI agent' },
  { type: 'tool', label: 'Tool', description: 'Execute a tool' },
  { type: 'human_input', label: 'Human Input', description: 'Pause for user input' },
  { type: 'join', label: 'Join', description: 'Merge parallel branches' },
  { type: 'end', label: 'End', description: 'Terminal node' },
  { type: 'research_request', label: 'Research', description: 'Deep research request' },
  { type: 'subworkflow', label: 'Sub-Workflow', description: 'Embed another workflow' },
]

export function BuilderNodePalette({
  selectedNodeId,
  onAddNode,
  onAddAgentNode,
  onSplitParallel,
  onAddConditional,
  onDeleteNode,
  onEditNodeProperties,
  agents,
}: BuilderNodePaletteProps) {
  const [branchCount, setBranchCount] = useState(2)

  return (
    <div className="node-palette">
      <div className="node-palette__section">
        <div className="node-palette__label">Add Node</div>
        {NODE_TYPE_OPTIONS.map((option) => (
          <button
            key={option.type}
            type="button"
            className="node-palette__btn"
            disabled={!selectedNodeId}
            onClick={() => onAddNode(option.type)}
            title={
              selectedNodeId ? `Add ${option.label} after selected node` : 'Select a node first'
            }
          >
            <span className="node-palette__btn-label">{option.label}</span>
            <span className="node-palette__btn-desc">{option.description}</span>
          </button>
        ))}
      </div>

      {agents && agents.length > 0 && (
        <div className="node-palette__section">
          <div className="node-palette__label">Workflow Agents</div>
          {agents.map((agent) => (
            <button
              key={agent.agentId}
              type="button"
              className="node-palette__btn"
              disabled={!selectedNodeId}
              onClick={() => onAddAgentNode(agent.agentId, agent.name)}
              title={
                selectedNodeId ? `Add ${agent.name} after selected node` : 'Select a node first'
              }
            >
              <span className="node-palette__btn-label">{agent.name}</span>
              <span className="node-palette__btn-desc">{agent.role}</span>
            </button>
          ))}
        </div>
      )}

      <div className="node-palette__section">
        <div className="node-palette__label">Structure</div>
        <div className="node-palette__branch-control">
          <label className="node-palette__branch-label">
            Branches:
            <input
              type="number"
              min={2}
              max={6}
              value={branchCount}
              onChange={(e) => setBranchCount(Math.max(2, Math.min(6, Number(e.target.value))))}
              className="node-palette__branch-input"
            />
          </label>
        </div>
        <button
          type="button"
          className="node-palette__btn"
          disabled={!selectedNodeId}
          onClick={() => onSplitParallel(branchCount)}
          title={selectedNodeId ? 'Split into parallel branches' : 'Select a node first'}
        >
          <span className="node-palette__btn-label">Parallel Split</span>
          <span className="node-palette__btn-desc">Split into {branchCount} parallel branches</span>
        </button>
        <button
          type="button"
          className="node-palette__btn"
          disabled={!selectedNodeId}
          onClick={onAddConditional}
          title={selectedNodeId ? 'Add conditional branches' : 'Select a node first'}
        >
          <span className="node-palette__btn-label">Conditional Branch</span>
          <span className="node-palette__btn-desc">If-this-then-that split</span>
        </button>
      </div>

      {selectedNodeId && (
        <div className="node-palette__section">
          <div className="node-palette__label">Actions</div>
          {onEditNodeProperties && (
            <Button variant="outline" type="button" onClick={onEditNodeProperties}>
              Edit Properties
            </Button>
          )}
          <Button
            variant="ghost"
            type="button"
            className="node-palette__delete-btn"
            onClick={onDeleteNode}
          >
            Delete Node
          </Button>
          <span className="node-palette__hint">Press Delete key to remove</span>
        </div>
      )}
    </div>
  )
}
