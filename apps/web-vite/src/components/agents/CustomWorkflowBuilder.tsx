/**
 * CustomWorkflowBuilder Component
 *
 * Visual structured builder for custom workflow graphs.
 * Grid-snapped layout, sidebar palette + properties, ReactFlow canvas.
 */

import { useReducer, useMemo, useCallback, useEffect } from 'react'
import { ReactFlow, Background, Controls, ReactFlowProvider, useReactFlow } from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTheme } from '@/contexts/useTheme'
import { Button } from '@/components/ui/button'
import type { AgentConfig, AgentId, WorkflowGraph, WorkflowEdgeConditionType } from '@lifeos/agents'
import {
  builderReducer,
  createInitialState,
  builderStateToGraph,
} from './customWorkflowBuilderReducer'
import type { BuilderNode } from './customWorkflowBuilderReducer'
import { BuilderCustomNode } from './BuilderCustomNode'
import { BuilderNodePalette } from './BuilderNodePalette'
import { BuilderNodeProperties } from './BuilderNodeProperties'
import './CustomWorkflowBuilder.css'

interface CustomWorkflowBuilderProps {
  isOpen: boolean
  onClose: () => void
  initialGraph?: WorkflowGraph
  agents: AgentConfig[]
  onSave: (graph: WorkflowGraph) => void
}

const NODE_WIDTH = 180
const NODE_HEIGHT = 80
const COLUMN_GAP = 300
const ROW_GAP = 130

const nodeTypes = { builderNode: BuilderCustomNode }

function BuilderCanvas({
  initialGraph,
  agents,
  onSave,
  onClose,
}: Omit<CustomWorkflowBuilderProps, 'isOpen'>) {
  const { theme } = useTheme()
  const { fitView } = useReactFlow()

  const [state, dispatch] = useReducer(builderReducer, initialGraph, (graph) =>
    graph
      ? builderReducer(createInitialState(), { type: 'LOAD_GRAPH', graph })
      : createInitialState()
  )

  // Fit view whenever the node structure changes
  useEffect(() => {
    const timer = setTimeout(() => fitView({ padding: 0.2 }), 50)
    return () => clearTimeout(timer)
  }, [state.nodes.length, state.edges.length, fitView])

  const handleSelect = useCallback(
    (nodeId: string) => dispatch({ type: 'SELECT_NODE', nodeId }),
    []
  )

  // Convert builder state to ReactFlow nodes/edges
  const { flowNodes, flowEdges } = useMemo(() => {
    const flowNodes: Node[] = state.nodes.map((node: BuilderNode) => ({
      id: node.id,
      type: 'builderNode',
      position: {
        x: node.column * COLUMN_GAP,
        y: node.row * ROW_GAP,
      },
      data: {
        label: node.label,
        nodeType: node.type,
        isStart: node.id === state.startNodeId,
        isSelected: node.id === state.selectedNodeId,
        onSelect: handleSelect,
        nodeId: node.id,
      },
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      draggable: false,
      connectable: false,
    }))

    const flowEdges: Edge[] = state.edges.map((edge, index) => ({
      id: `${edge.from}-${edge.to}-${index}`,
      source: edge.from,
      target: edge.to,
      type: 'smoothstep',
      animated: edge.condition.type !== 'always',
      label:
        edge.condition.type !== 'always'
          ? `${edge.condition.type}: ${edge.condition.value ?? ''}`
          : undefined,
      style: {
        stroke: edge.condition.type !== 'always' ? 'var(--warning)' : 'var(--border-strong)',
        strokeWidth: 2,
      },
    }))

    return { flowNodes, flowEdges }
  }, [state, handleSelect])

  const selectedNode = state.selectedNodeId
    ? (state.nodes.find((n: BuilderNode) => n.id === state.selectedNodeId) ?? null)
    : null

  const handleSave = () => {
    onSave(builderStateToGraph(state))
  }

  return (
    <div className="custom-builder-modal">
      <div className="custom-builder__header">
        <h2>Custom Workflow Builder</h2>
        <div className="custom-builder__header-actions">
          <span className="custom-builder__node-count">
            {state.nodes.length} nodes, {state.edges.length} edges
          </span>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save Workflow
          </Button>
        </div>
      </div>
      <div className="custom-builder__body">
        <div className="custom-builder__sidebar">
          <BuilderNodePalette
            selectedNodeId={state.selectedNodeId}
            agents={agents}
            onAddNode={(type) => {
              if (!state.selectedNodeId) return
              dispatch({
                type: 'ADD_NODE_AFTER',
                afterNodeId: state.selectedNodeId,
                nodeType: type,
              })
            }}
            onAddAgentNode={(agentId, agentName) => {
              if (!state.selectedNodeId) return
              dispatch({
                type: 'ADD_AGENT_NODE_AFTER',
                afterNodeId: state.selectedNodeId,
                agentId: agentId as AgentId,
                agentName,
              })
            }}
            onSplitParallel={(branchCount) => {
              if (!state.selectedNodeId) return
              dispatch({
                type: 'SPLIT_PARALLEL',
                afterNodeId: state.selectedNodeId,
                branchCount,
              })
            }}
            onAddConditional={() => {
              if (!state.selectedNodeId) return
              dispatch({
                type: 'ADD_CONDITIONAL',
                afterNodeId: state.selectedNodeId,
                branches: [
                  { label: 'Path A', condition: { type: 'equals', key: 'result', value: 'a' } },
                  { label: 'Path B', condition: { type: 'equals', key: 'result', value: 'b' } },
                ],
              })
            }}
            onDeleteNode={() => {
              if (!state.selectedNodeId) return
              dispatch({ type: 'REMOVE_NODE', nodeId: state.selectedNodeId })
            }}
          />
          <BuilderNodeProperties
            node={selectedNode}
            agents={agents}
            edges={state.edges}
            onUpdate={(nodeId, updates) => dispatch({ type: 'UPDATE_NODE', nodeId, updates })}
            onUpdateEdge={(from, to, condType, key, value) =>
              dispatch({
                type: 'UPDATE_EDGE',
                from,
                to,
                condition: {
                  type: condType as WorkflowEdgeConditionType,
                  key,
                  value,
                },
              })
            }
          />
        </div>
        <div className="custom-builder__canvas">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            nodesDraggable={false}
            nodesConnectable={false}
            fitView
            colorMode={theme === 'dark' ? 'dark' : 'light'}
            proOptions={{ hideAttribution: true }}
            onPaneClick={() => dispatch({ type: 'SELECT_NODE', nodeId: null })}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </div>
    </div>
  )
}

export function CustomWorkflowBuilder(props: CustomWorkflowBuilderProps) {
  if (!props.isOpen) return null

  return (
    <div className="modal-overlay" onClick={props.onClose}>
      <div className="modal-content--builder" onClick={(e) => e.stopPropagation()}>
        <ReactFlowProvider>
          <BuilderCanvas
            initialGraph={props.initialGraph}
            agents={props.agents}
            onSave={props.onSave}
            onClose={props.onClose}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
