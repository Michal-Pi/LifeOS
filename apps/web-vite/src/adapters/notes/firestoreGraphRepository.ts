/**
 * Firestore Graph Repository
 *
 * Implements GraphRepository interface for building note graphs from Firestore data.
 * Builds in-memory graph structures and implements graph traversal algorithms.
 */

import { collection, getDocs, query, where } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import type { Note, NoteId, NoteFilters, NoteRepository } from '@lifeos/notes'
import type {
  GraphRepository,
  NoteGraph,
  NoteGraphNode,
  NoteGraphEdge,
  GraphFilters,
} from '@lifeos/notes'

const COLLECTION_NOTES = 'notes'

// Cache for graph data
interface GraphCache {
  graph: NoteGraph
  timestamp: number
  filters: GraphFilters | undefined
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
const graphCache = new Map<string, GraphCache>()

export const createFirestoreGraphRepository = (noteRepository: NoteRepository): GraphRepository => {
  /**
   * Build a complete graph from notes with optional filters
   */
  const buildGraph = async (userId: string, filters?: GraphFilters): Promise<NoteGraph> => {
    // Check cache
    const cacheKey = `${userId}:${JSON.stringify(filters)}`
    const cached = graphCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.graph
    }

    // Query notes with filters
    const noteFilters: NoteFilters = {}
    if (filters?.projectIds) {
      noteFilters.projectIds = filters.projectIds
    }
    if (filters?.topicId) {
      noteFilters.topicId = filters.topicId
    }
    if (filters?.tags) {
      noteFilters.tags = filters.tags
    }

    const notes = await noteRepository.list(userId, noteFilters)

    // Apply date range filter if specified
    let filteredNotes = notes
    if (filters?.dateRange) {
      filteredNotes = notes.filter((note) => {
        if (filters.dateRange?.startMs && note.createdAtMs < filters.dateRange.startMs) {
          return false
        }
        if (filters.dateRange?.endMs && note.createdAtMs > filters.dateRange.endMs) {
          return false
        }
        return true
      })
    }

    // Build graph nodes
    const nodes: NoteGraphNode[] = filteredNotes.map((note) => {
      const linkCount = note.linkedNoteIds?.length || 0
      const backlinkCount = note.backlinkNoteIds?.length || 0

      return {
        noteId: note.noteId,
        title: note.title,
        topicId: note.topicId,
        projectIds: note.projectIds || [],
        tags: note.tags || [],
        linkCount,
        backlinkCount,
      }
    })

    // Build graph edges
    const edges: NoteGraphEdge[] = []
    const noteMap = new Map(filteredNotes.map((note) => [note.noteId, note]))

    for (const note of filteredNotes) {
      // Paragraph-level tags (create edges from paragraph tags)
      if (note.paragraphLinks) {
        for (const [paragraphPath, tags] of Object.entries(note.paragraphLinks)) {
          void paragraphPath
          // Create edges for note tags
          if (tags.noteIds) {
            for (const targetNoteId of tags.noteIds) {
              if (noteMap.has(targetNoteId) && targetNoteId !== note.noteId) {
                edges.push({
                  fromNoteId: note.noteId,
                  toNoteId: targetNoteId,
                  edgeType: 'paragraph_tag',
                })
              }
            }
          }
        }
      }

      // Explicit links
      if (note.linkedNoteIds) {
        for (const linkedId of note.linkedNoteIds) {
          if (noteMap.has(linkedId)) {
            edges.push({
              fromNoteId: note.noteId,
              toNoteId: linkedId,
              edgeType: 'explicit_link',
            })
          }
        }
      }

      // Mentions
      if (note.mentionedNoteIds) {
        for (const mentionedId of note.mentionedNoteIds) {
          if (noteMap.has(mentionedId) && !note.linkedNoteIds?.includes(mentionedId)) {
            edges.push({
              fromNoteId: note.noteId,
              toNoteId: mentionedId,
              edgeType: 'mention',
            })
          }
        }
      }

      // Shared projects (optimized: only create edge if ≥2 shared projects to reduce noise)
      if (note.projectIds && note.projectIds.length > 0) {
        for (const otherNote of filteredNotes) {
          if (otherNote.noteId === note.noteId) continue
          if (!otherNote.projectIds || otherNote.projectIds.length === 0) continue

          const sharedProjects = note.projectIds.filter((pid) =>
            otherNote.projectIds!.includes(pid)
          )
          // Only create edge if ≥2 shared projects to reduce noise
          if (sharedProjects.length >= 2) {
            // Check if edge already exists
            const exists = edges.some(
              (e) =>
                (e.fromNoteId === note.noteId && e.toNoteId === otherNote.noteId) ||
                (e.fromNoteId === otherNote.noteId && e.toNoteId === note.noteId)
            )
            if (!exists) {
              edges.push({
                fromNoteId: note.noteId,
                toNoteId: otherNote.noteId,
                edgeType: 'shared_project',
              })
            }
          }
        }
      }

      // Shared tags (optimized: only create edge if ≥2 shared tags to reduce noise)
      if (note.tags && note.tags.length > 0) {
        for (const otherNote of filteredNotes) {
          if (otherNote.noteId === note.noteId) continue
          if (!otherNote.tags || otherNote.tags.length === 0) continue

          const sharedTags = note.tags.filter((tag) => otherNote.tags!.includes(tag))
          // Only create edge if ≥2 shared tags to reduce noise
          if (sharedTags.length >= 2) {
            // Check if edge already exists
            const exists = edges.some(
              (e) =>
                (e.fromNoteId === note.noteId && e.toNoteId === otherNote.noteId) ||
                (e.fromNoteId === otherNote.noteId && e.toNoteId === note.noteId)
            )
            if (!exists) {
              edges.push({
                fromNoteId: note.noteId,
                toNoteId: otherNote.noteId,
                edgeType: 'shared_tag',
              })
            }
          }
        }
      }
    }

    // Filter out orphan notes if requested
    let finalNodes = nodes
    if (filters?.includeOrphans === false) {
      const connectedNoteIds = new Set<NoteId>()
      for (const edge of edges) {
        connectedNoteIds.add(edge.fromNoteId)
        connectedNoteIds.add(edge.toNoteId)
      }
      finalNodes = nodes.filter((node) => connectedNoteIds.has(node.noteId))
    }

    const graph: NoteGraph = {
      nodes: finalNodes,
      edges,
    }

    // Cache the result
    graphCache.set(cacheKey, {
      graph,
      timestamp: Date.now(),
      filters,
    })

    return graph
  }

  /**
   * Get notes connected to a specific note within N hops (BFS)
   */
  const getConnectedNotes = async (
    userId: string,
    noteId: NoteId,
    depth: number = 1
  ): Promise<Note[]> => {
    const graph = await buildGraph(userId)
    const edgeMap = new Map<NoteId, Set<NoteId>>()

    // Build adjacency list
    for (const edge of graph.edges) {
      if (!edgeMap.has(edge.fromNoteId)) {
        edgeMap.set(edge.fromNoteId, new Set())
      }
      edgeMap.get(edge.fromNoteId)!.add(edge.toNoteId)

      // Also add reverse for bidirectional traversal
      if (!edgeMap.has(edge.toNoteId)) {
        edgeMap.set(edge.toNoteId, new Set())
      }
      edgeMap.get(edge.toNoteId)!.add(edge.fromNoteId)
    }

    // BFS traversal
    const visited = new Set<NoteId>()
    const queue: Array<{ noteId: NoteId; depth: number }> = [{ noteId, depth: 0 }]
    const connectedIds = new Set<NoteId>()

    while (queue.length > 0) {
      const { noteId: currentId, depth: currentDepth } = queue.shift()!

      if (visited.has(currentId) || currentDepth > depth) {
        continue
      }

      visited.add(currentId)
      if (currentId !== noteId) {
        connectedIds.add(currentId)
      }

      const neighbors = edgeMap.get(currentId)
      if (neighbors) {
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            queue.push({ noteId: neighborId, depth: currentDepth + 1 })
          }
        }
      }
    }

    // Fetch note details
    const connectedNotes: Note[] = []
    for (const connectedId of connectedIds) {
      const note = await noteRepository.get(userId, connectedId)
      if (note) {
        connectedNotes.push(note)
      }
    }

    return connectedNotes
  }

  /**
   * Get notes that link to the specified note (backlinks)
   */
  const getBacklinks = async (userId: string, noteId: NoteId): Promise<Note[]> => {
    const db = await getDb()
    const notesRef = collection(db, `users/${userId}/${COLLECTION_NOTES}`)

    // Query notes that link to the target note
    const linkedQuery = query(notesRef, where('linkedNoteIds', 'array-contains', noteId))
    const linkedSnapshot = await getDocs(linkedQuery)

    // Query notes that mention the target note
    const mentionedQuery = query(notesRef, where('mentionedNoteIds', 'array-contains', noteId))
    const mentionedSnapshot = await getDocs(mentionedQuery)

    // Combine and deduplicate results
    const backlinkMap = new Map<NoteId, Note>()
    for (const docSnapshot of linkedSnapshot.docs) {
      const note = docSnapshot.data() as Note
      backlinkMap.set(note.noteId, note)
    }
    for (const docSnapshot of mentionedSnapshot.docs) {
      const note = docSnapshot.data() as Note
      backlinkMap.set(note.noteId, note)
    }

    return Array.from(backlinkMap.values())
  }

  /**
   * Find the shortest path between two notes (Dijkstra's algorithm)
   */
  const findShortestPath = async (
    userId: string,
    fromNoteId: NoteId,
    toNoteId: NoteId
  ): Promise<NoteId[]> => {
    if (fromNoteId === toNoteId) {
      return [fromNoteId]
    }

    try {
      const graph = await buildGraph(userId)

      // Check if both nodes exist in the graph
      const fromNodeExists = graph.nodes.some((n) => n.noteId === fromNoteId)
      const toNodeExists = graph.nodes.some((n) => n.noteId === toNoteId)

      if (!fromNodeExists || !toNodeExists) {
        return [] // No path if nodes don't exist
      }

      const edgeMap = new Map<NoteId, Set<NoteId>>()

      // Build adjacency list (bidirectional)
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

      // Dijkstra's algorithm
      const distances = new Map<NoteId, number>()
      const previous = new Map<NoteId, NoteId | null>()
      const unvisited = new Set<NoteId>()

      // Initialize distances
      for (const node of graph.nodes) {
        distances.set(node.noteId, Infinity)
        previous.set(node.noteId, null)
        unvisited.add(node.noteId)
      }
      distances.set(fromNoteId, 0)

      while (unvisited.size > 0) {
        // Find node with smallest distance
        let current: NoteId | null = null
        let minDistance = Infinity
        for (const nodeId of unvisited) {
          const dist = distances.get(nodeId)!
          if (dist < minDistance) {
            minDistance = dist
            current = nodeId
          }
        }

        if (!current || minDistance === Infinity) {
          break
        }

        unvisited.delete(current)

        if (current === toNoteId) {
          // Reconstruct path
          const path: NoteId[] = []
          let node: NoteId | null = toNoteId
          while (node !== null) {
            path.unshift(node)
            node = previous.get(node) ?? null
          }
          return path
        }

        // Update distances to neighbors
        const neighbors = edgeMap.get(current)
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (unvisited.has(neighbor)) {
              const alt = distances.get(current)! + 1
              if (alt < distances.get(neighbor)!) {
                distances.set(neighbor, alt)
                previous.set(neighbor, current)
              }
            }
          }
        }
      }

      // No path found
      return []
    } catch (error) {
      console.error(`Error finding shortest path from ${fromNoteId} to ${toNoteId}:`, error)
      return []
    }
  }

  /**
   * Find notes with no connections (orphan notes)
   */
  const getOrphanNotes = async (userId: string, filters?: NoteFilters): Promise<Note[]> => {
    void filters
    const graph = await buildGraph(userId, { includeOrphans: true })
    const connectedNoteIds = new Set<NoteId>()

    for (const edge of graph.edges) {
      connectedNoteIds.add(edge.fromNoteId)
      connectedNoteIds.add(edge.toNoteId)
    }

    const orphanNodes = graph.nodes.filter((node) => !connectedNoteIds.has(node.noteId))

    // Fetch note details
    const orphanNotes: Note[] = []
    for (const node of orphanNodes) {
      const note = await noteRepository.get(userId, node.noteId)
      if (note) {
        orphanNotes.push(note)
      }
    }

    return orphanNotes
  }

  return {
    buildGraph,
    getConnectedNotes,
    getBacklinks,
    findShortestPath,
    getOrphanNotes,
  }
}

/**
 * Invalidate graph cache for a user
 */
export function invalidateGraphCache(userId: string): void {
  const keysToDelete: string[] = []
  for (const key of graphCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      keysToDelete.push(key)
    }
  }
  for (const key of keysToDelete) {
    graphCache.delete(key)
  }
}
