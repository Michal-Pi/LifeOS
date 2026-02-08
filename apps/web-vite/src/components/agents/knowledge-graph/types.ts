/**
 * Knowledge Graph Explorer Types and Constants
 *
 * Shared types and configuration for the knowledge graph visualization.
 */

import type {
  Claim,
  Concept,
  Mechanism,
  Contradiction,
  Regime,
  Community,
  BiTemporalEdge,
} from '@lifeos/agents'

// ----- Node Types -----

export type KGNodeType =
  | 'claim'
  | 'concept'
  | 'mechanism'
  | 'contradiction'
  | 'regime'
  | 'community'

export type KGEdgeType =
  | 'references'
  | 'supports'
  | 'contradicts'
  | 'part_of'
  | 'is_a'
  | 'related_to'
  | 'scoped_to'
  | 'member_of'

export interface KGNode {
  id: string
  type: KGNodeType
  label: string
  temporal: BiTemporalEdge
  data: Claim | Concept | Mechanism | Contradiction | Regime | Community
}

export interface KGEdge {
  source: string
  target: string
  type: KGEdgeType
  weight: number
  temporal: BiTemporalEdge
}

export interface KnowledgeGraphData {
  nodes: KGNode[]
  edges: KGEdge[]
}

// ----- Component Props -----

export interface KnowledgeGraphExplorerProps {
  graph: KnowledgeGraphData
  onNodeSelect?: (node: KGNode) => void
  onConceptLineage?: (conceptId: string) => void
  initialSelectedNode?: string
  sessionName?: string
}

export interface NodeDetailPanelProps {
  node: KGNode
  onClose: () => void
  onViewLineage?: () => void
}

export interface FilterPanelProps {
  visibleLayers: Set<number>
  visibleNodeTypes: Set<KGNodeType>
  temporalFilter: TemporalFilterType
  onToggleLayer: (layer: number) => void
  onToggleNodeType: (type: KGNodeType) => void
  onTemporalFilterChange: (filter: TemporalFilterType) => void
}

export type TemporalFilterType = 'all' | 'active' | 'expired'

// ----- Configuration -----

export interface NodeTypeConfig {
  color: string
  bgColor: string
  icon: string
  layer: number
}

export interface EdgeTypeConfig {
  color: string
  animated: boolean
  dashed: boolean
}

export const NODE_TYPE_CONFIG: Record<KGNodeType, NodeTypeConfig> = {
  claim: { color: 'var(--accent)', bgColor: 'var(--accent-subtle)', icon: '📝', layer: 1 },
  concept: { color: 'var(--info)', bgColor: 'var(--info-light)', icon: '💡', layer: 2 },
  mechanism: {
    color: 'var(--warning-color)',
    bgColor: 'var(--warning-light)',
    icon: '⚙️',
    layer: 1,
  },
  contradiction: { color: 'var(--error)', bgColor: 'var(--error-light)', icon: '⚡', layer: 1 },
  regime: { color: 'var(--success)', bgColor: 'var(--success-light)', icon: '🌐', layer: 2 },
  community: { color: 'var(--primary)', bgColor: 'var(--primary-light)', icon: '🔗', layer: 3 },
}

export const EDGE_TYPE_CONFIG: Record<KGEdgeType, EdgeTypeConfig> = {
  references: { color: 'var(--accent)', animated: false, dashed: false },
  supports: { color: 'var(--success)', animated: false, dashed: false },
  contradicts: { color: 'var(--error)', animated: true, dashed: false },
  part_of: { color: 'var(--warning-color)', animated: false, dashed: false },
  is_a: { color: 'var(--info)', animated: false, dashed: false },
  related_to: { color: 'var(--muted-foreground)', animated: false, dashed: true },
  scoped_to: { color: 'var(--success)', animated: false, dashed: true },
  member_of: { color: 'var(--primary)', animated: false, dashed: false },
}

// ----- Layout Constants -----

export const NODE_WIDTH = 180
export const NODE_HEIGHT = 70
export const LAYER_GAP = 200
export const NODE_GAP = 100

// ----- Layer Configuration -----

export const LAYER_NAMES: Record<number, string> = {
  1: 'Layer 1: Semantic',
  2: 'Layer 2: Ontology',
  3: 'Layer 3: Communities',
}

export const ALL_NODE_TYPES: KGNodeType[] = [
  'claim',
  'concept',
  'mechanism',
  'contradiction',
  'regime',
  'community',
]

export const ALL_LAYERS = [1, 2, 3] as const
