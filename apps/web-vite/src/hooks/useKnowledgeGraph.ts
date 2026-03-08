/**
 * useKnowledgeGraph Hook
 *
 * Provides access to the dialectical knowledge hypergraph for a given session.
 * Subscribes to real-time updates and provides operations for exploring
 * the 4-layer graph structure.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { collection, onSnapshot, query, orderBy, doc } from 'firebase/firestore'
import { getFirestoreClient } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import type {
  DialecticalSessionId,
  Claim,
  Concept,
  Mechanism,
  Contradiction,
  Regime,
  Community,
} from '@lifeos/agents'
import type {
  KGNode,
  KGEdge,
  KGNodeType,
  KnowledgeGraphData,
} from '@/components/agents/KnowledgeGraphExplorer'

const COLLECTION_KEYS = [
  'claims',
  'concepts',
  'mechanisms',
  'contradictions',
  'regimes',
  'communities',
] as const

type CollectionKey = (typeof COLLECTION_KEYS)[number]

const EMPTY_COLLECTION_FLAGS: Record<CollectionKey, boolean> = {
  claims: false,
  concepts: false,
  mechanisms: false,
  contradictions: false,
  regimes: false,
  communities: false,
}

// ----- Types -----

export interface DialecticalSession {
  sessionId: DialecticalSessionId
  userId: string
  name: string
  description?: string
  goal: string
  createdAtMs: number
  updatedAtMs: number
  status: 'active' | 'completed' | 'paused'
  currentCycle: number
  maxCycles: number
}

export interface KnowledgeGraphStats {
  totalNodes: number
  nodesByType: Record<KGNodeType, number>
  totalEdges: number
  activeContradictions: number
  conceptVersions: number
}

export interface UseKnowledgeGraphReturn {
  // Data
  session: DialecticalSession | null
  graph: KnowledgeGraphData
  stats: KnowledgeGraphStats

  // Loading states
  loading: boolean
  error: string | null

  // Operations
  getConceptLineage: (conceptId: string) => Concept[]
  getActiveContradictions: () => Contradiction[]
  getNodeNeighbors: (nodeId: string) => KGNode[]
  refreshGraph: () => void
}

// ----- Hook Implementation -----

export function useKnowledgeGraph(sessionId: DialecticalSessionId | null): UseKnowledgeGraphReturn {
  const { user } = useAuth()

  // State
  const [session, setSession] = useState<DialecticalSession | null>(null)
  const [claims, setClaims] = useState<Claim[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [mechanisms, setMechanisms] = useState<Mechanism[]>([])
  const [contradictions, setContradictions] = useState<Contradiction[]>([])
  const [regimes, setRegimes] = useState<Regime[]>([])
  const [communities, setCommunities] = useState<Community[]>([])
  const [loadedCollections, setLoadedCollections] = useState<{
    subscriptionKey: string | null
    flags: Record<CollectionKey, boolean>
  }>({
    subscriptionKey: null,
    flags: EMPTY_COLLECTION_FLAGS,
  })
  const [error, setError] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Derived loading state - all subscriptions must complete
  const loading = Object.values(loadingStates).some(Boolean)

  // Collection paths
  const basePath = useMemo(() => {
    if (!user || !sessionId) return null
    return `users/${user.uid}/dialecticalSessions/${sessionId}`
  }, [user, sessionId])
  const subscriptionKey = useMemo(
    () => (basePath ? `${basePath}:${refreshTrigger}` : null),
    [basePath, refreshTrigger]
  )
  const loadingStates = useMemo(() => {
    if (!subscriptionKey) {
      return {
        claims: false,
        concepts: false,
        mechanisms: false,
        contradictions: false,
        regimes: false,
        communities: false,
      }
    }

    const flags =
      loadedCollections.subscriptionKey === subscriptionKey
        ? loadedCollections.flags
        : EMPTY_COLLECTION_FLAGS

    return {
      claims: !flags.claims,
      concepts: !flags.concepts,
      mechanisms: !flags.mechanisms,
      contradictions: !flags.contradictions,
      regimes: !flags.regimes,
      communities: !flags.communities,
    }
  }, [loadedCollections, subscriptionKey])

  // Load session metadata
  useEffect(() => {
    if (!user || !sessionId) return

    const db = getFirestoreClient()
    const sessionRef = doc(db, `users/${user.uid}/dialecticalSessions`, sessionId)

    const unsubscribe = onSnapshot(
      sessionRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setSession({
            sessionId: sessionId,
            ...(snapshot.data() as Omit<DialecticalSession, 'sessionId'>),
          })
        } else {
          setSession(null)
        }
      },
      (err) => {
        console.error('Error loading dialectical session:', err)
        setError('Failed to load session')
      }
    )

    return () => {
      unsubscribe()
      setSession(null)
    }
  }, [user, sessionId])

  // Ref accumulator to batch snapshot updates into a single setState per animation frame
  const pendingUpdates = useRef<Record<string, unknown>>({})
  const rafId = useRef<number | null>(null)

  const flushUpdates = useCallback(() => {
    const updates = pendingUpdates.current
    pendingUpdates.current = {}
    rafId.current = null

    if ('claims' in updates) setClaims(updates.claims as Claim[])
    if ('concepts' in updates) setConcepts(updates.concepts as Concept[])
    if ('mechanisms' in updates) setMechanisms(updates.mechanisms as Mechanism[])
    if ('contradictions' in updates) setContradictions(updates.contradictions as Contradiction[])
    if ('regimes' in updates) setRegimes(updates.regimes as Regime[])
    if ('communities' in updates) setCommunities(updates.communities as Community[])

    const loadedKeys = COLLECTION_KEYS.filter((key) => `${key}Loaded` in updates)
    if (loadedKeys.length > 0) {
      setLoadedCollections((prev) => {
        const nextFlags =
          prev.subscriptionKey === subscriptionKey
            ? { ...prev.flags }
            : { ...EMPTY_COLLECTION_FLAGS }
        for (const key of loadedKeys) nextFlags[key] = true
        return {
          subscriptionKey,
          flags: nextFlags,
        }
      })
    }
  }, [subscriptionKey])

  const scheduleFlush = useCallback((key: string, data: unknown, markLoaded?: boolean) => {
    pendingUpdates.current[key] = data
    if (markLoaded) pendingUpdates.current[`${key}Loaded`] = true
    if (rafId.current === null) {
      rafId.current = requestAnimationFrame(flushUpdates)
    }
  }, [flushUpdates])

  // Subscribe to all 6 collections in a single useEffect
  useEffect(() => {
    if (!basePath || !subscriptionKey) return

    const db = getFirestoreClient()
    const unsubscribes: (() => void)[] = []

    for (const key of COLLECTION_KEYS) {
      const path = key
      const ref = collection(db, `${basePath}/${path}`)
      const q = query(ref, orderBy('temporal.tCreated', 'desc'))
      unsubscribes.push(
        onSnapshot(
          q,
          (snapshot) => {
            const data = snapshot.docs.map((docSnap) => docSnap.data())
            scheduleFlush(key, data, true)
          },
          (err) => {
            console.error(`Error loading ${key}:`, err)
            setLoadedCollections((prev) => {
              const nextFlags =
                prev.subscriptionKey === subscriptionKey
                  ? { ...prev.flags }
                  : { ...EMPTY_COLLECTION_FLAGS }
              nextFlags[key] = true
              return {
                subscriptionKey,
                flags: nextFlags,
              }
            })
          }
        )
      )
    }

    return () => {
      for (const unsub of unsubscribes) unsub()
      if (rafId.current !== null) cancelAnimationFrame(rafId.current)
      setClaims([])
      setConcepts([])
      setMechanisms([])
      setContradictions([])
      setRegimes([])
      setCommunities([])
    }
  }, [basePath, scheduleFlush, subscriptionKey])

  // Build graph data
  const graph = useMemo((): KnowledgeGraphData => {
    const nodes: KGNode[] = []
    const edges: KGEdge[] = []

    // Add claim nodes
    for (const claim of claims) {
      nodes.push({
        id: claim.claimId,
        type: 'claim',
        label: claim.text.substring(0, 50),
        temporal: claim.temporal,
        data: claim,
      })

      // Claim -> Concept edges
      for (const conceptId of claim.conceptIds) {
        edges.push({
          source: claim.claimId,
          target: conceptId,
          type: 'references',
          weight: 1,
          temporal: claim.temporal,
        })
      }

      // Claim -> Regime edge
      if (claim.regimeId) {
        edges.push({
          source: claim.claimId,
          target: claim.regimeId,
          type: 'scoped_to',
          weight: 1,
          temporal: claim.temporal,
        })
      }
    }

    // Add concept nodes
    for (const concept of concepts) {
      nodes.push({
        id: concept.conceptId,
        type: 'concept',
        label: concept.name,
        temporal: concept.temporal,
        data: concept,
      })

      // Concept -> Parent edges
      for (const parentId of concept.parentConceptIds) {
        edges.push({
          source: concept.conceptId,
          target: parentId,
          type: 'is_a',
          weight: 1,
          temporal: concept.temporal,
        })
      }

      // Concept -> Related edges
      for (const relatedId of concept.relatedConceptIds) {
        edges.push({
          source: concept.conceptId,
          target: relatedId,
          type: 'related_to',
          weight: 0.5,
          temporal: concept.temporal,
        })
      }
    }

    // Add mechanism nodes
    for (const mechanism of mechanisms) {
      nodes.push({
        id: mechanism.mechanismId,
        type: 'mechanism',
        label: mechanism.description.substring(0, 50),
        temporal: mechanism.temporal,
        data: mechanism,
      })

      // Mechanism -> Claim edges
      for (const claimId of mechanism.participantClaimIds) {
        const role = mechanism.roles[claimId] ?? 'CONDITION'
        edges.push({
          source: mechanism.mechanismId,
          target: claimId,
          type: 'part_of',
          weight: role === 'CAUSE' || role === 'EFFECT' ? 1 : 0.5,
          temporal: mechanism.temporal,
        })
      }
    }

    // Add contradiction nodes
    for (const contradiction of contradictions) {
      nodes.push({
        id: contradiction.contradictionId,
        type: 'contradiction',
        label: contradiction.description.substring(0, 50),
        temporal: contradiction.temporal,
        data: contradiction,
      })

      // Contradiction -> Claim edges
      for (const claimId of contradiction.claimIds) {
        edges.push({
          source: contradiction.contradictionId,
          target: claimId,
          type: 'contradicts',
          weight:
            contradiction.severity === 'HIGH' ? 1 : contradiction.severity === 'MEDIUM' ? 0.7 : 0.3,
          temporal: contradiction.temporal,
        })
      }
    }

    // Add regime nodes
    for (const regime of regimes) {
      nodes.push({
        id: regime.regimeId,
        type: 'regime',
        label: regime.name,
        temporal: regime.temporal,
        data: regime,
      })
    }

    // Add community nodes
    for (const community of communities) {
      nodes.push({
        id: community.communityId,
        type: 'community',
        label: community.name,
        temporal: community.temporal,
        data: community,
      })

      // Community membership edges
      const memberIds = [...community.conceptIds, ...community.claimIds, ...community.mechanismIds]

      for (const memberId of memberIds) {
        edges.push({
          source: memberId,
          target: community.communityId,
          type: 'member_of',
          weight: 1,
          temporal: community.temporal,
        })
      }
    }

    return { nodes, edges }
  }, [claims, concepts, mechanisms, contradictions, regimes, communities])

  // Calculate stats
  const stats = useMemo((): KnowledgeGraphStats => {
    const nodesByType: Record<KGNodeType, number> = {
      claim: claims.length,
      concept: concepts.length,
      mechanism: mechanisms.length,
      contradiction: contradictions.length,
      regime: regimes.length,
      community: communities.length,
    }

    const activeContradictions = contradictions.filter(
      (c) => c.status === 'OPEN' && c.temporal.tExpired === null && c.temporal.tInvalid === null
    ).length

    const conceptVersions = concepts.reduce((max, c) => Math.max(max, c.version), 0)

    return {
      totalNodes: graph.nodes.length,
      nodesByType,
      totalEdges: graph.edges.length,
      activeContradictions,
      conceptVersions,
    }
  }, [graph, claims, concepts, mechanisms, contradictions, regimes, communities])

  // Operations
  const getConceptLineage = useCallback(
    (conceptId: string): Concept[] => {
      const lineage: Concept[] = []
      let currentId: string | undefined = conceptId

      while (currentId) {
        const concept = concepts.find((c) => c.conceptId === currentId)
        if (!concept) break

        lineage.push(concept)
        currentId = concept.previousVersionId ?? undefined
      }

      return lineage
    },
    [concepts]
  )

  const getActiveContradictions = useCallback((): Contradiction[] => {
    return contradictions.filter(
      (c) => c.status === 'OPEN' && c.temporal.tExpired === null && c.temporal.tInvalid === null
    )
  }, [contradictions])

  const getNodeNeighbors = useCallback(
    (nodeId: string): KGNode[] => {
      const neighborIds = new Set<string>()

      // Find edges connecting to this node
      for (const edge of graph.edges) {
        if (edge.source === nodeId) {
          neighborIds.add(edge.target)
        }
        if (edge.target === nodeId) {
          neighborIds.add(edge.source)
        }
      }

      // Return matching nodes
      return graph.nodes.filter((n) => neighborIds.has(n.id))
    },
    [graph]
  )

  const refreshGraph = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1)
  }, [])

  return {
    session,
    graph,
    stats,
    loading,
    error,
    getConceptLineage,
    getActiveContradictions,
    getNodeNeighbors,
    refreshGraph,
  }
}

export default useKnowledgeGraph
