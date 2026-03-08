/**
 * KG ↔ CompactGraph serialization utilities.
 *
 * serializeKGToCompactGraph — converts a live KnowledgeHypergraph into a CompactGraph.
 * capGraphForPrompt — serializes a CompactGraph to a JSON string, pruning to fit a char budget.
 */

import type { CompactGraph } from '@lifeos/agents'
import type { KnowledgeHypergraph, KGNode } from '../knowledgeHypergraph.js'
import { createLogger } from '../../lib/logger.js'

const log = createLogger('KGSerializer')

/** Allowed KG edge types mapped to CompactGraph rel types */
const EDGE_TYPE_MAP: Record<string, CompactGraph['edges'][number]['rel']> = {
  causal_link: 'causes',
  contradicts: 'contradicts',
  supports: 'supports',
  mediates: 'mediates',
  scoped_by: 'scopes',
}

/** Node types that map to CompactGraph node types */
const COMPACT_NODE_TYPES = new Set(['claim', 'concept', 'mechanism', 'prediction'])

/**
 * Convert a live KnowledgeHypergraph instance into a CompactGraph.
 */
export function serializeKGToCompactGraph(
  kg: KnowledgeHypergraph,
  maxNodes = 50,
): CompactGraph {
  const allTypes = new Set(kg.getAllNodes().map((n) => n.type))
  const dropped = [...allTypes].filter((t) => !COMPACT_NODE_TYPES.has(t))
  if (dropped.length > 0) {
    log.debug('KG serialization: filtered non-compact types', { dropped })
  }

  // 1. Collect all semantic node types
  const allNodes: KGNode[] = []
  for (const t of ['claim', 'concept', 'mechanism', 'prediction'] as const) {
    allNodes.push(...kg.getNodesByType(t as Parameters<typeof kg.getNodesByType>[0]))
  }

  // 2. Score each node: (edgeCount * 0.4) + (confidence * 0.6)
  const scored = allNodes.map((node) => {
    const edgeCount = kg.getOutEdges(node.id).length + kg.getInEdges(node.id).length
    const confidence = (node.data as { confidence?: number }).confidence ?? 0.5
    return { node, score: edgeCount * 0.4 + confidence * 0.6 }
  })

  // 3. Sort descending, take top maxNodes
  scored.sort((a, b) => b.score - a.score)
  const selected = scored.slice(0, maxNodes)
  const selectedIds = new Set(selected.map((s) => s.node.id))

  // 4. Collect edges between selected nodes
  const edges: CompactGraph['edges'] = []
  for (const { node } of selected) {
    const outEdges = kg.getOutEdges(node.id)
    for (const edge of outEdges) {
      if (!selectedIds.has(edge.target)) continue
      const rel = EDGE_TYPE_MAP[edge.data.type]
      if (!rel) continue // skip non-semantic edges
      edges.push({
        from: node.id,
        to: edge.target,
        rel,
        weight: edge.data.weight,
      })
    }
  }

  // 5. Build nodes array (only types that match CompactGraph union)
  // Populate sourceId/sourceUrl/sourceConfidence by following sourced_from edges
  const nodes: CompactGraph['nodes'] = selected
    .filter((s) => COMPACT_NODE_TYPES.has(s.node.type))
    .map((s) => {
      const n = s.node
      const base: CompactGraph['nodes'][number] = {
        id: n.id,
        label: n.label,
        type: n.type as 'claim' | 'concept' | 'mechanism' | 'prediction',
      }

      // For claims, attach source attribution from sourced_from edges
      if (n.type === 'claim') {
        const data = n.data as unknown as Record<string, unknown>
        const note = typeof data.text === 'string' ? data.text : undefined
        if (note && note !== n.label) base.note = note

        const sourceEdges = kg.getOutEdges(n.id).filter((e) => e.data.type === 'sourced_from')
        if (sourceEdges.length > 0) {
          const sourceNode = kg.getNode(sourceEdges[0].target)
          if (sourceNode) {
            const srcData = sourceNode.data as unknown as Record<string, unknown>
            base.sourceId = sourceNode.id
            base.sourceUrl = typeof srcData.url === 'string' ? srcData.url : undefined
          }
          base.sourceConfidence = typeof data.confidence === 'number'
            ? data.confidence
            : (sourceEdges[0].data.weight ?? undefined)
        }
      }

      return base
    })

  // 6. Summary from top 3 claims by confidence
  const claimNodes = selected
    .filter((s) => s.node.type === 'claim')
    .sort(
      (a, b) =>
        ((b.node.data as { confidence?: number }).confidence ?? 0) -
        ((a.node.data as { confidence?: number }).confidence ?? 0),
    )
    .slice(0, 3)
  const summary =
    claimNodes.length > 0
      ? `Key findings: ${claimNodes.map((c) => c.node.label).join('; ')}`
      : ''

  // 7. Average confidence across all selected claim nodes
  const claimConfidences = selected
    .filter((s) => s.node.type === 'claim')
    .map((s) => (s.node.data as { confidence?: number }).confidence ?? 0.5)
  const avgConfidence =
    claimConfidences.length > 0
      ? claimConfidences.reduce((sum, c) => sum + c, 0) / claimConfidences.length
      : 0.5

  return {
    nodes,
    edges,
    summary,
    confidence: avgConfidence,
    regime: 'multi-regime',
    temporalGrain: 'mixed',
    reasoning: '',
  }
}

/**
 * Serialize a CompactGraph to JSON, pruning if necessary to stay under maxChars.
 *
 * Pruning order:
 * 1. Remove lowest-weight edges (never 'contradicts' edges, never edges on prediction nodes)
 * 2. Remove lowest-confidence nodes (never prediction nodes, never nodes with 'contradicts' edges)
 */
export function capGraphForPrompt(graph: CompactGraph, maxChars = 4000): string {
  let json = JSON.stringify(graph)
  if (json.length <= maxChars) return json

  // Work on a mutable copy
  const g: CompactGraph = JSON.parse(json)

  // Identify prediction node IDs and nodes connected by contradicts edges
  const predictionNodeIds = new Set(g.nodes.filter((n) => n.type === 'prediction').map((n) => n.id))
  const contradictsNodeIds = new Set<string>()
  for (const e of g.edges) {
    if (e.rel === 'contradicts') {
      contradictsNodeIds.add(e.from)
      contradictsNodeIds.add(e.to)
    }
  }

  // 1. Prune lowest-weight edges first
  const prunableEdges = g.edges
    .map((e, i) => ({ edge: e, index: i }))
    .filter((item) => {
      if (item.edge.rel === 'contradicts') return false
      if (predictionNodeIds.has(item.edge.from) || predictionNodeIds.has(item.edge.to)) return false
      return true
    })
    .sort((a, b) => (a.edge.weight ?? 0) - (b.edge.weight ?? 0))

  for (const item of prunableEdges) {
    const idx = g.edges.indexOf(item.edge)
    if (idx !== -1) g.edges.splice(idx, 1)
    json = JSON.stringify(g)
    if (json.length <= maxChars) return json
  }

  const connectedIds = new Set<string>()
  for (const e of g.edges) {
    connectedIds.add(e.from)
    connectedIds.add(e.to)
  }
  g.nodes = g.nodes.filter(
    (n) => connectedIds.has(n.id) || n.type === 'prediction' || contradictsNodeIds.has(n.id)
  )
  json = JSON.stringify(g)
  if (json.length <= maxChars) return json

  // 2. Prune lowest-confidence nodes (and their remaining edges)
  const prunableNodes = g.nodes
    .filter((n) => {
      if (n.type === 'prediction') return false
      if (contradictsNodeIds.has(n.id)) return false
      return true
    })
    .sort((a, b) => {
      // Use sourceConfidence if present, otherwise treat as 0
      return (a.sourceConfidence ?? 0) - (b.sourceConfidence ?? 0)
    })

  for (const node of prunableNodes) {
    const nodeIdx = g.nodes.indexOf(node)
    if (nodeIdx !== -1) g.nodes.splice(nodeIdx, 1)
    // Remove edges connected to this node
    g.edges = g.edges.filter((e) => e.from !== node.id && e.to !== node.id)
    json = JSON.stringify(g)
    if (json.length <= maxChars) return json
  }

  return json
}
