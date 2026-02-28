/**
 * Knowledge Graph Explorer
 *
 * Re-exports from the refactored module structure for backward compatibility.
 *
 * @deprecated Import from './knowledge-graph' instead
 */

/* eslint-disable react-refresh/only-export-components */

export {
  KnowledgeGraphExplorer,
  default,
  NodeDetailPanel,
  FilterPanel,
  ClaimDetails,
  ConceptDetails,
  MechanismDetails,
  ContradictionDetails,
  RegimeDetails,
  CommunityDetails,
} from './knowledge-graph'

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
} from './knowledge-graph'

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
  truncateText,
  formatTimestamp,
} from './knowledge-graph'
