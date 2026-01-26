/**
 * Graph Analytics Service
 *
 * Provides analytics functions for note graphs.
 */

import type { NoteGraph, NoteId } from '@lifeos/notes'

/**
 * Calculate node centrality (number of connections)
 */
export function calculateNodeCentrality(graph: NoteGraph): Map<NoteId, number> {
  const centrality = new Map<NoteId, number>()

  for (const node of graph.nodes) {
    centrality.set(node.noteId, node.linkCount + node.backlinkCount)
  }

  return centrality
}

/**
 * Detect clusters using simple connected components
 */
export function detectClusters(graph: NoteGraph): Map<NoteId, number> {
  const clusters = new Map<NoteId, number>()
  const visited = new Set<NoteId>()
  let clusterId = 0

  const edgeMap = new Map<NoteId, Set<NoteId>>()
  for (const edge of graph.edges) {
    if (!edgeMap.has(edge.fromNoteId)) {
      edgeMap.set(edge.fromNoteId, new Set())
    }
    edgeMap.get(edge.fromNoteId)!.add(edge.toNoteId)

    if (!edgeMap.has(edge.toNoteId)) {
      edgeMap.set(edge.toNoteId, new Set())
    }
    edgeMap.get(edge.toNoteId)!.add(edge.fromNoteId)
  }

  const dfs = (nodeId: NoteId, currentCluster: number) => {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    clusters.set(nodeId, currentCluster)

    const neighbors = edgeMap.get(nodeId) || new Set()
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, currentCluster)
      }
    }
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.noteId)) {
      dfs(node.noteId, clusterId)
      clusterId++
    }
  }

  return clusters
}

/**
 * Find hub notes (notes with many connections)
 */
export function findHubNotes(graph: NoteGraph, threshold: number = 5): NoteId[] {
  const hubNotes: NoteId[] = []

  for (const node of graph.nodes) {
    const totalConnections = node.linkCount + node.backlinkCount
    if (totalConnections >= threshold) {
      hubNotes.push(node.noteId)
    }
  }

  return hubNotes.sort((a, b) => {
    const nodeA = graph.nodes.find((n) => n.noteId === a)!
    const nodeB = graph.nodes.find((n) => n.noteId === b)!
    return nodeB.linkCount + nodeB.backlinkCount - (nodeA.linkCount + nodeA.backlinkCount)
  })
}

/**
 * Calculate graph density (ratio of actual edges to possible edges)
 */
export function calculateGraphDensity(graph: NoteGraph): number {
  const nodeCount = graph.nodes.length
  if (nodeCount < 2) return 0

  const possibleEdges = nodeCount * (nodeCount - 1)
  const actualEdges = graph.edges.length

  return actualEdges / possibleEdges
}
