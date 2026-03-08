/**
 * Semantic KG tool definitions for thesis agents.
 *
 * createKGTools — factory that closes over a KnowledgeHypergraph instance and
 * returns 6 ToolDefinition objects wrapping its query methods.
 *
 * These will be granted to thesis agents in Phase 3 (not wired in this phase).
 */

import type { KnowledgeHypergraph } from './knowledgeHypergraph.js'
import type { ToolDefinition, ToolExecutionContext } from './toolExecutor.js'

export function createKGTools(kg: KnowledgeHypergraph): ToolDefinition[] {
  return [
    // 1. kg_summary
    {
      name: 'kg_summary',
      description:
        'Get a summary of the knowledge graph: node/edge counts, top claims by confidence, and active contradictions',
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async (_params: Record<string, unknown>, _context: ToolExecutionContext) => {
        const stats = kg.getStats()
        const allClaims = kg.getNodesByType('claim')
        const topClaims = [...allClaims]
          .sort(
            (a, b) =>
              ((b.data as { confidence?: number }).confidence ?? 0) -
              ((a.data as { confidence?: number }).confidence ?? 0)
          )
          .slice(0, 10)
        const contradictions = kg.getActiveContradictions()
        return {
          stats,
          topClaims: topClaims.map((n) => ({
            id: n.id,
            label: n.label,
            confidence: (n.data as { confidence?: number }).confidence,
          })),
          activeContradictions: contradictions.map((n) => ({ id: n.id, label: n.label })),
        }
      },
    },

    // 2. kg_get_claims
    {
      name: 'kg_get_claims',
      description:
        'Query claims from the knowledge graph, optionally filtering by concept and minimum confidence',
      parameters: {
        type: 'object',
        properties: {
          conceptFilter: {
            type: 'string',
            description: 'Only return claims connected to this concept node ID',
          },
          minConfidence: {
            type: 'number',
            description: 'Minimum confidence threshold (0-1)',
          },
          limit: {
            type: 'number',
            description: 'Max claims to return (default 20)',
          },
        },
        required: [],
      },
      execute: async (params: Record<string, unknown>, _context: ToolExecutionContext) => {
        const conceptFilter = params.conceptFilter as string | undefined
        const minConfidence = params.minConfidence as number | undefined
        const limit = Math.min((params.limit as number | undefined) ?? 20, 100)

        let claims = kg.getNodesByType('claim')

        if (minConfidence !== undefined) {
          claims = claims.filter(
            (n) => ((n.data as { confidence?: number }).confidence ?? 0) >= minConfidence
          )
        }

        if (conceptFilter) {
          const neighborIds = new Set(kg.getNeighbors(conceptFilter))
          claims = claims.filter((n) => neighborIds.has(n.id))
        }

        claims.sort(
          (a, b) =>
            ((b.data as { confidence?: number }).confidence ?? 0) -
            ((a.data as { confidence?: number }).confidence ?? 0)
        )

        return claims.slice(0, limit).map((n) => ({
          id: n.id,
          label: n.label,
          confidence: (n.data as { confidence?: number }).confidence,
          text: (n.data as { text?: string }).text,
        }))
      },
    },

    // 3. kg_get_neighborhood
    {
      name: 'kg_get_neighborhood',
      description:
        'Get the local neighborhood of a node in the knowledge graph (nodes and edges within N hops)',
      parameters: {
        type: 'object',
        properties: {
          nodeId: { type: 'string', description: 'The node ID to explore from' },
          maxDepth: {
            type: 'number',
            description: 'Maximum hops from the node (default 2)',
          },
          maxSize: {
            type: 'number',
            description: 'Maximum number of nodes to return (default 30)',
          },
        },
        required: ['nodeId'],
      },
      execute: async (params: Record<string, unknown>, _context: ToolExecutionContext) => {
        const nodeId = params.nodeId as string
        const maxDepth = (params.maxDepth as number | undefined) ?? 2
        const maxSize = (params.maxSize as number | undefined) ?? 30

        const result = kg.getNeighborhood(nodeId, { maxDepth, limit: maxSize })
        return {
          nodes: result.nodes.map((n) => ({ id: n.id, label: n.label, type: n.type })),
          edges: result.edges.map((e) => ({
            source: e.source,
            target: e.target,
            type: e.data.type,
            weight: e.data.weight,
          })),
        }
      },
    },

    // 4. kg_get_sources_for_claim
    {
      name: 'kg_get_sources_for_claim',
      description:
        'Get the source records (URLs, titles, quality scores) that support a specific claim',
      parameters: {
        type: 'object',
        properties: {
          claimId: { type: 'string', description: 'The claim node ID' },
        },
        required: ['claimId'],
      },
      execute: async (params: Record<string, unknown>, _context: ToolExecutionContext) => {
        const claimId = params.claimId as string
        const sources = kg.getSourcesForClaim(claimId)
        return sources.map((n) => {
          const data = n.data as unknown as Record<string, unknown>
          return {
            sourceId: n.id,
            label: n.label,
            url: data.url ?? data.sourceUrl,
            domain: data.domain,
          }
        })
      },
    },

    // 5. kg_get_contradictions
    {
      name: 'kg_get_contradictions',
      description: 'Get all active (unresolved) contradictions in the knowledge graph',
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async (_params: Record<string, unknown>, _context: ToolExecutionContext) => {
        const contradictions = kg.getActiveContradictions()
        return contradictions.map((n) => ({ id: n.id, label: n.label, data: n.data }))
      },
    },

    // 6. kg_shortest_path
    {
      name: 'kg_shortest_path',
      description: 'Find the shortest path between two nodes in the knowledge graph',
      parameters: {
        type: 'object',
        properties: {
          fromNodeId: { type: 'string', description: 'Starting node ID' },
          toNodeId: { type: 'string', description: 'Target node ID' },
        },
        required: ['fromNodeId', 'toNodeId'],
      },
      execute: async (params: Record<string, unknown>, _context: ToolExecutionContext) => {
        const fromNodeId = params.fromNodeId as string
        const toNodeId = params.toNodeId as string
        const path = kg.shortestPath(fromNodeId, toNodeId)
        if (!path) return { path: null, message: 'No path found' }
        const resolvedNodes = path.map((id) => {
          const node = kg.getNode(id)
          return node
            ? { id: node.id, label: node.label, type: node.type }
            : { id, label: '?', type: '?' }
        })
        return { path: resolvedNodes }
      },
    },
  ]
}
