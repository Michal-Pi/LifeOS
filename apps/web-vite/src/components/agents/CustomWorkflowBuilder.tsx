/**
 * CustomWorkflowBuilder Component
 *
 * Visual structured builder for custom workflow graphs.
 * Grid-snapped layout, sidebar palette, panel for properties, ReactFlow canvas.
 * Supports keyboard shortcuts (Delete/Backspace, Ctrl+Z undo, Ctrl+Shift+Z redo).
 * Multi-select via Shift+click or box-select. Draggable nodes with auto-layout.
 */

import { useMemo, useCallback, useEffect, useState, useRef } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react'
import type { Node, Edge, Connection, OnNodeDrag, OnSelectionChangeFunc } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTheme } from '@/contexts/useTheme'
import { Button } from '@/components/ui/button'
import type {
  AgentConfig,
  AgentId,
  WorkflowGraph,
  WorkflowNodeType,
  WorkflowEdgeConditionType,
  CreateAgentInput,
} from '@lifeos/agents'
import { MODEL_PRICING } from '@lifeos/agents'
import {
  builderReducer,
  createInitialState,
  builderStateToGraph,
} from './customWorkflowBuilderReducer'
import type { BuilderNode } from './customWorkflowBuilderReducer'
import { useUndoableReducer } from './useUndoableReducer'
import { BuilderCustomNode } from './BuilderCustomNode'
import { BuilderNodePalette } from './BuilderNodePalette'
import { NodePropertiesPanel } from './NodePropertiesPanel'
import { WORKFLOW_LAYOUT, getNodePosition } from './workflowLayoutUtils'
import './CustomWorkflowBuilder.css'

interface CustomWorkflowBuilderProps {
  isOpen: boolean
  onClose: () => void
  initialGraph?: WorkflowGraph
  agents: AgentConfig[]
  onSave: (graph: WorkflowGraph) => void
  onCreateAgent?: (input: CreateAgentInput) => Promise<AgentConfig>
}

const nodeTypes = { builderNode: BuilderCustomNode }

/**
 * Find the next version number for an agent name.
 * E.g., "My Agent" -> "My Agent v.2", "My Agent v.2" -> "My Agent v.3"
 */
function getNextVersionName(baseName: string, existingAgents: AgentConfig[]): string {
  // Extract base name without version suffix
  const versionMatch = baseName.match(/^(.+?)\s+v\.(\d+)$/)
  const cleanBaseName = versionMatch ? versionMatch[1] : baseName

  // Find all existing versions
  const versionNumbers: number[] = [1] // Original is v.1
  for (const agent of existingAgents) {
    const match = agent.name.match(/^(.+?)\s+v\.(\d+)$/)
    if (match && match[1] === cleanBaseName) {
      versionNumbers.push(parseInt(match[2], 10))
    } else if (agent.name === cleanBaseName) {
      versionNumbers.push(1)
    }
  }

  const maxVersion = Math.max(...versionNumbers)
  return `${cleanBaseName} v.${maxVersion + 1}`
}

function BuilderCanvas({
  initialGraph,
  agents,
  onSave,
  onClose,
  onCreateAgent,
}: Omit<CustomWorkflowBuilderProps, 'isOpen'>) {
  const { theme } = useTheme()
  const { fitView } = useReactFlow()
  const containerRef = useRef<HTMLDivElement>(null)

  const { state, dispatch, undo, redo, canUndo, canRedo } = useUndoableReducer(
    builderReducer,
    initialGraph,
    (graph: unknown) =>
      graph
        ? builderReducer(createInitialState(), {
            type: 'LOAD_GRAPH',
            graph: graph as WorkflowGraph,
          })
        : createInitialState()
  )

  // Panel state for node properties (slide-in panel replaces modal)
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(false)

  // Track locally created agents (versions created during this session)
  const [localAgents, setLocalAgents] = useState<AgentConfig[]>([])

  // Combined agents list (passed agents + locally created versions)
  const allAgents = useMemo(() => [...agents, ...localAgents], [agents, localAgents])

  // Fit view whenever the node structure changes
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitView({ padding: 0.15, duration: 200 })
      })
    })
    return () => cancelAnimationFrame(raf)
  }, [state.nodes.length, state.edges.length, fitView])

  // Keyboard handling: Delete, Undo/Redo, Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle if panel is open or user is typing in an input
      if (showPropertiesPanel) return
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return
      }

      // Ctrl+Z / Cmd+Z = Undo
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        undo()
        return
      }

      // Ctrl+Shift+Z / Cmd+Shift+Z = Redo
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        redo()
        return
      }

      // Ctrl+C / Cmd+C = Copy selected nodes
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        e.preventDefault()
        const ids =
          state.selectedNodeIds.length > 0
            ? state.selectedNodeIds
            : state.selectedNodeId
              ? [state.selectedNodeId]
              : []
        if (ids.length > 0) {
          dispatch({ type: 'COPY_NODES', nodeIds: ids })
        }
        return
      }

      // Ctrl+V / Cmd+V = Paste copied nodes
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        e.preventDefault()
        dispatch({ type: 'PASTE_NODES' })
        return
      }

      // B = Toggle bypass on selected node
      if (e.key === 'b' || e.key === 'B') {
        if (state.selectedNodeId) {
          dispatch({ type: 'TOGGLE_BYPASS', nodeId: state.selectedNodeId })
        }
        return
      }

      // M = Toggle mute on selected node
      if (e.key === 'm' || e.key === 'M') {
        if (state.selectedNodeId) {
          dispatch({ type: 'TOGGLE_MUTE', nodeId: state.selectedNodeId })
        }
        return
      }

      // G = Group selected nodes
      if (e.key === 'g' || e.key === 'G') {
        if (state.selectedNodeIds.length > 1) {
          dispatch({ type: 'GROUP_NODES', nodeIds: state.selectedNodeIds, groupLabel: 'Group' })
        }
        return
      }

      // Delete or Backspace to remove selected node(s)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        // Multi-select bulk delete
        if (state.selectedNodeIds.length > 1) {
          dispatch({ type: 'REMOVE_NODES', nodeIds: state.selectedNodeIds })
        } else if (state.selectedNodeId) {
          if (state.selectedNodeId !== state.startNodeId && state.nodes.length > 2) {
            dispatch({ type: 'REMOVE_NODE', nodeId: state.selectedNodeId })
          }
        }
        return
      }

      // Escape to deselect
      if (e.key === 'Escape') {
        dispatch({ type: 'SELECT_NODE', nodeId: null })
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    state.selectedNodeId,
    state.selectedNodeIds,
    state.startNodeId,
    state.nodes.length,
    showPropertiesPanel,
    undo,
    redo,
    dispatch,
  ])

  const handleSelect = useCallback(
    (nodeId: string) => {
      dispatch({ type: 'SELECT_NODE', nodeId })
    },
    [dispatch]
  )

  // Double-click to open properties panel
  const handleNodeDoubleClick = useCallback(
    (nodeId: string) => {
      dispatch({ type: 'SELECT_NODE', nodeId })
      setShowPropertiesPanel(true)
    },
    [dispatch]
  )

  // Node toolbar: delete
  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      if (nodeId === state.startNodeId || state.nodes.length <= 2) return
      dispatch({ type: 'REMOVE_NODE', nodeId })
    },
    [state.startNodeId, state.nodes.length, dispatch]
  )

  // Node toolbar: edit properties
  const handleNodeEditProperties = useCallback(
    (nodeId: string) => {
      dispatch({ type: 'SELECT_NODE', nodeId })
      setShowPropertiesPanel(true)
    },
    [dispatch]
  )

  // "+" button: add node after
  const handleAddNodeAfter = useCallback(
    (nodeId: string, nodeType: WorkflowNodeType) => {
      dispatch({ type: 'ADD_NODE_AFTER', afterNodeId: nodeId, nodeType })
    },
    [dispatch]
  )

  // Toggle bypass on a node
  const handleToggleBypass = useCallback(
    (nodeId: string) => {
      dispatch({ type: 'TOGGLE_BYPASS', nodeId })
    },
    [dispatch]
  )

  // Toggle mute on a node
  const handleToggleMute = useCallback(
    (nodeId: string) => {
      dispatch({ type: 'TOGGLE_MUTE', nodeId })
    },
    [dispatch]
  )

  // Inline prompt update: opens properties panel with the node selected
  const handleUpdatePrompt = useCallback(
    (nodeId: string, _prompt: string) => {
      dispatch({ type: 'SELECT_NODE', nodeId })
      setShowPropertiesPanel(true)
    },
    [dispatch]
  )

  // Multi-select: sync ReactFlow selection back to reducer
  const handleSelectionChange: OnSelectionChangeFunc = useCallback(
    ({ nodes: selectedNodes }) => {
      const ids = selectedNodes.map((n) => n.id)
      if (ids.length > 0) {
        dispatch({ type: 'SELECT_NODES', nodeIds: ids })
      }
    },
    [dispatch]
  )

  // Drag stop: update node position (pixel → grid column/row)
  const handleNodeDragStop: OnNodeDrag = useCallback(
    (_event, node) => {
      const colWidth = WORKFLOW_LAYOUT.node.width + WORKFLOW_LAYOUT.gap.column
      const rowHeight = WORKFLOW_LAYOUT.node.height + WORKFLOW_LAYOUT.gap.row
      const column = Math.max(0, Math.round(node.position.x / colWidth))
      const row = Math.max(0, Math.round(node.position.y / rowHeight))
      dispatch({ type: 'SET_NODE_POSITION', nodeId: node.id, column, row })
    },
    [dispatch]
  )

  // Compute estimated cost per agent node
  const nodeCosts = useMemo(() => {
    const costs = new Map<string, string>()
    for (const node of state.nodes) {
      if (!node.agentId) continue
      const agent = allAgents.find((a) => a.agentId === node.agentId)
      if (!agent) continue
      const pricing = MODEL_PRICING[agent.modelName] ?? MODEL_PRICING['default']
      // Estimate: ~2K input tokens + maxTokens output (or 1K default)
      const estInputTokens = 2000
      const estOutputTokens = agent.maxTokens ?? 1000
      const cost = (estInputTokens * pricing.input + estOutputTokens * pricing.output) / 1_000_000
      costs.set(node.id, `~$${cost.toFixed(4)}`)
    }
    return costs
  }, [state.nodes, allAgents])

  // Total estimated workflow cost
  const totalEstCost = useMemo(() => {
    let total = 0
    for (const node of state.nodes) {
      if (!node.agentId) continue
      const agent = allAgents.find((a) => a.agentId === node.agentId)
      if (!agent) continue
      const pricing = MODEL_PRICING[agent.modelName] ?? MODEL_PRICING['default']
      const estInputTokens = 2000
      const estOutputTokens = agent.maxTokens ?? 1000
      total += (estInputTokens * pricing.input + estOutputTokens * pricing.output) / 1_000_000
    }
    return total
  }, [state.nodes, allAgents])

  // Build agent lookup for richer node data
  const agentMap = useMemo(() => {
    const map = new Map<string, AgentConfig>()
    for (const agent of allAgents) map.set(agent.agentId, agent)
    return map
  }, [allAgents])

  // Convert builder state to ReactFlow nodes/edges
  const { flowNodes, flowEdges } = useMemo(() => {
    const flowNodes: Node[] = state.nodes.map((node: BuilderNode) => {
      // Resolve agent details for richer node display
      const agent = node.agentId ? agentMap.get(node.agentId) : undefined
      const modelLabel = agent ? `${agent.modelProvider}/${agent.modelName}` : undefined
      const promptPreview = agent?.systemPrompt
        ? agent.systemPrompt.slice(0, 60) + (agent.systemPrompt.length > 60 ? '...' : '')
        : undefined
      const canDelete = node.id !== state.startNodeId && state.nodes.length > 2
      const costLabel = nodeCosts.get(node.id)

      return {
        id: node.id,
        type: 'builderNode',
        position: getNodePosition(node.column, node.row),
        selected: state.selectedNodeIds.includes(node.id),
        data: {
          label: node.label,
          nodeType: node.type,
          isStart: node.id === state.startNodeId,
          isSelected: state.selectedNodeIds.includes(node.id) || node.id === state.selectedNodeId,
          nodeId: node.id,
          // Richer content
          agentName: agent?.name,
          modelLabel,
          promptPreview,
          costLabel,
          bypassed: node.bypassed,
          muted: node.muted,
          groupId: node.groupId,
          // Callbacks
          onSelect: handleSelect,
          onDoubleClick: handleNodeDoubleClick,
          onDelete: handleNodeDelete,
          onEditProperties: handleNodeEditProperties,
          onAddAfter: handleAddNodeAfter,
          onToggleBypass: handleToggleBypass,
          onToggleMute: handleToggleMute,
          onUpdatePrompt: handleUpdatePrompt,
          canDelete,
        },
        width: WORKFLOW_LAYOUT.node.width,
        height: WORKFLOW_LAYOUT.node.height,
        draggable: true,
        connectable: true,
      }
    })

    const flowEdges: Edge[] = state.edges.map((edge, index) => {
      const isConditional = edge.condition.type !== 'always'
      const isLLM = edge.condition.type === 'llm_evaluate'
      const strokeColor = isLLM
        ? 'var(--accent)'
        : isConditional
          ? 'var(--warning)'
          : 'var(--border-strong)'
      const edgeLabel = isLLM
        ? `AI: ${(edge.condition.value ?? '').slice(0, 30)}${(edge.condition.value ?? '').length > 30 ? '...' : ''}`
        : isConditional
          ? `${edge.condition.type}: ${edge.condition.value ?? ''}`
          : undefined
      return {
        id: `${edge.from}-${edge.to}-${index}`,
        source: edge.from,
        target: edge.to,
        type: 'smoothstep',
        animated: isConditional || isLLM,
        label: edgeLabel,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: strokeColor,
        },
        style: {
          stroke: strokeColor,
          strokeWidth: 2,
        },
        labelStyle: {
          fill: isLLM
            ? 'var(--accent)'
            : isConditional
              ? 'var(--warning)'
              : 'var(--muted-foreground)',
          fontSize: 10,
          fontWeight: 600,
        },
      }
    })

    return { flowNodes, flowEdges }
  }, [
    state,
    handleSelect,
    handleNodeDoubleClick,
    handleNodeDelete,
    handleNodeEditProperties,
    handleAddNodeAfter,
    handleToggleBypass,
    handleToggleMute,
    handleUpdatePrompt,
    agentMap,
    nodeCosts,
  ])

  const selectedNode = state.selectedNodeId
    ? (state.nodes.find((n: BuilderNode) => n.id === state.selectedNodeId) ?? null)
    : null

  const handleSave = () => {
    onSave(builderStateToGraph(state))
  }

  const handleInit = useCallback(() => {
    setTimeout(() => fitView({ padding: 0.15 }), 150)
  }, [fitView])

  // Handle new connections (drag from source handle to target handle)
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      // Don't allow self-connections
      if (connection.source === connection.target) return
      // Check if edge already exists
      const edgeExists = state.edges.some(
        (e) => e.from === connection.source && e.to === connection.target
      )
      if (edgeExists) return

      dispatch({
        type: 'ADD_EDGE',
        from: connection.source,
        to: connection.target,
        condition: { type: 'always' },
      })
    },
    [state.edges, dispatch]
  )

  // Handle creating a versioned copy of an agent with custom prompt
  const handleCreateAgentVersion = useCallback(
    async (baseAgent: AgentConfig, customPrompt: string): Promise<AgentConfig | null> => {
      if (!onCreateAgent) return null

      const newName = getNextVersionName(baseAgent.name, allAgents)
      const combinedPrompt = customPrompt.trim().startsWith('REPLACE:')
        ? customPrompt.replace(/^REPLACE:\s*/, '')
        : `${baseAgent.systemPrompt}\n\n--- Custom Instructions ---\n${customPrompt}`

      const input: CreateAgentInput = {
        name: newName,
        role: baseAgent.role,
        systemPrompt: combinedPrompt,
        modelProvider: baseAgent.modelProvider,
        modelName: baseAgent.modelName,
        temperature: baseAgent.temperature,
        maxTokens: baseAgent.maxTokens,
        toolIds: baseAgent.toolIds,
        description:
          `${baseAgent.description ?? ''} (Workflow version of ${baseAgent.name})`.trim(),
      }

      try {
        const newAgent = await onCreateAgent(input)
        setLocalAgents((prev) => [...prev, newAgent])
        return newAgent
      } catch (err) {
        console.error('Failed to create agent version:', err)
        return null
      }
    },
    [onCreateAgent, allAgents]
  )

  return (
    <div className="custom-builder-modal" ref={containerRef} tabIndex={-1}>
      <div className="custom-builder__header">
        <h2>Custom Workflow Builder</h2>
        <div className="custom-builder__header-actions">
          <span className="custom-builder__node-count">
            {state.nodes.length} nodes · {state.edges.length} edges
            {totalEstCost > 0 && (
              <span className="custom-builder__cost-badge" title="Estimated cost per run">
                ~${totalEstCost.toFixed(4)}
              </span>
            )}
          </span>
          <div className="custom-builder__toolbar-group">
            <button
              type="button"
              className="custom-builder__icon-btn"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
            >
              ↩
            </button>
            <button
              type="button"
              className="custom-builder__icon-btn"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
            >
              ↪
            </button>
            <button
              type="button"
              className="custom-builder__icon-btn"
              onClick={() => dispatch({ type: 'AUTO_LAYOUT' })}
              title="Auto-Layout"
            >
              ⊞
            </button>
          </div>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save Workflow
          </Button>
        </div>
      </div>
      <div
        className={`custom-builder__body${showPropertiesPanel ? ' custom-builder__body--panel-open' : ''}`}
      >
        <div className="custom-builder__sidebar">
          <BuilderNodePalette
            selectedNodeId={state.selectedNodeId}
            agents={allAgents}
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
            onEditNodeProperties={() => {
              if (!state.selectedNodeId) return
              setShowPropertiesPanel(true)
            }}
          />
        </div>
        <div className="custom-builder__canvas">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            nodesDraggable={true}
            nodesConnectable={true}
            selectionOnDrag
            multiSelectionKeyCode="Shift"
            fitView
            onInit={handleInit}
            onConnect={handleConnect}
            onNodeDragStop={handleNodeDragStop}
            onSelectionChange={handleSelectionChange}
            colorMode={theme === 'dark' ? 'dark' : 'light'}
            proOptions={{ hideAttribution: true }}
            onPaneClick={() => dispatch({ type: 'SELECT_NODE', nodeId: null })}
            connectionLineStyle={{ stroke: 'var(--accent)', strokeWidth: 2 }}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              nodeStrokeWidth={3}
              pannable
              zoomable
              style={{ background: 'var(--background-secondary)' }}
            />
          </ReactFlow>
        </div>

        {/* Slide-in Properties Panel (third column) */}
        <NodePropertiesPanel
          isOpen={showPropertiesPanel}
          onClose={() => setShowPropertiesPanel(false)}
          node={selectedNode}
          agents={allAgents}
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
          onCreateAgentVersion={handleCreateAgentVersion}
        />
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
            onCreateAgent={props.onCreateAgent}
          />
        </ReactFlowProvider>
      </div>
    </div>
  )
}
