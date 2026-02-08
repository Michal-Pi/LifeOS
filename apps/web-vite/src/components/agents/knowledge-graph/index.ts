/**
 * Knowledge Graph Explorer Module
 *
 * Exports all components and types for the knowledge graph visualization.
 */

// Main component
export { KnowledgeGraphExplorer, default } from './KnowledgeGraphExplorer'

// Sub-components
export { NodeDetailPanel } from './NodeDetailPanel'
export { FilterPanel } from './FilterPanel'
export {
  ClaimDetails,
  ConceptDetails,
  MechanismDetails,
  ContradictionDetails,
  RegimeDetails,
  CommunityDetails,
} from './NodeDetails'

// Types
export type {
  KGNodeType,
  KGEdgeType,
  KGNode,
  KGEdge,
  KnowledgeGraphData,
  KnowledgeGraphExplorerProps,
  NodeDetailPanelProps,
  FilterPanelProps,
  TemporalFilterType,
  NodeTypeConfig,
  EdgeTypeConfig,
} from './types'

// Constants
export {
  NODE_TYPE_CONFIG,
  EDGE_TYPE_CONFIG,
  NODE_WIDTH,
  NODE_HEIGHT,
  LAYER_GAP,
  NODE_GAP,
  LAYER_NAMES,
  ALL_NODE_TYPES,
  ALL_LAYERS,
} from './types'

// Utilities
export {
  truncateText,
  formatTimestamp,
  capitalize,
  formatPercentage,
  formatEdgeLabel,
} from './utils'
