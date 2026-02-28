/**
 * useKnowledgeGraph Hook
 *
 * Provides access to the dialectical knowledge hypergraph for a given session.
 * Subscribes to real-time updates and provides operations for exploring
 * the 4-layer graph structure.
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
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
  const [loadingStates, setLoadingStates] = useState({
    claims: true,
    concepts: true,
    mechanisms: true,
    contradictions: true,
    regimes: true,
    communities: true,
  })
  const [error, setError] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  // Derived loading state - all subscriptions must complete
  const loading = Object.values(loadingStates).some(Boolean)

  // Collection paths
  const basePath = useMemo(() => {
    if (!user || !sessionId) return null
    return `users/${user.uid}/dialectical/sessions/${sessionId}`
  }, [user, sessionId])

  // Load session metadata
  useEffect(() => {
    if (!user || !sessionId) return

    const db = getFirestoreClient()
    const sessionRef = doc(db, `users/${user.uid}/dialectical/sessions`, sessionId)

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

  // Subscribe to claims
  useEffect(() => {
    if (!basePath) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Setting loading state before subscription is valid pattern
    setLoadingStates((prev) => ({ ...prev, claims: true }))
    const db = getFirestoreClient()
    const claimsRef = collection(db, `${basePath}/claims`)
    const q = query(claimsRef, orderBy('temporal.tCreated', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextClaims = snapshot.docs.map((docSnap) => docSnap.data() as Claim)
        setClaims(nextClaims)
        setLoadingStates((prev) => ({ ...prev, claims: false }))
      },
      (err) => {
        console.error('Error loading claims:', err)
        setLoadingStates((prev) => ({ ...prev, claims: false }))
      }
    )

    return () => {
      unsubscribe()
      setClaims([])
      setLoadingStates((prev) => ({ ...prev, claims: false }))
    }
  }, [basePath, refreshTrigger])

  // Subscribe to concepts
  useEffect(() => {
    if (!basePath) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Setting loading state before subscription is valid pattern
    setLoadingStates((prev) => ({ ...prev, concepts: true }))
    const db = getFirestoreClient()
    const conceptsRef = collection(db, `${basePath}/concepts`)
    const q = query(conceptsRef, orderBy('temporal.tCreated', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextConcepts = snapshot.docs.map((docSnap) => docSnap.data() as Concept)
        setConcepts(nextConcepts)
        setLoadingStates((prev) => ({ ...prev, concepts: false }))
      },
      (err) => {
        console.error('Error loading concepts:', err)
        setLoadingStates((prev) => ({ ...prev, concepts: false }))
      }
    )

    return () => {
      unsubscribe()
      setConcepts([])
      setLoadingStates((prev) => ({ ...prev, concepts: false }))
    }
  }, [basePath, refreshTrigger])

  // Subscribe to mechanisms
  useEffect(() => {
    if (!basePath) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Setting loading state before subscription is valid pattern
    setLoadingStates((prev) => ({ ...prev, mechanisms: true }))
    const db = getFirestoreClient()
    const mechanismsRef = collection(db, `${basePath}/mechanisms`)
    const q = query(mechanismsRef, orderBy('temporal.tCreated', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextMechanisms = snapshot.docs.map((docSnap) => docSnap.data() as Mechanism)
        setMechanisms(nextMechanisms)
        setLoadingStates((prev) => ({ ...prev, mechanisms: false }))
      },
      (err) => {
        console.error('Error loading mechanisms:', err)
        setLoadingStates((prev) => ({ ...prev, mechanisms: false }))
      }
    )

    return () => {
      unsubscribe()
      setMechanisms([])
      setLoadingStates((prev) => ({ ...prev, mechanisms: false }))
    }
  }, [basePath, refreshTrigger])

  // Subscribe to contradictions
  useEffect(() => {
    if (!basePath) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Setting loading state before subscription is valid pattern
    setLoadingStates((prev) => ({ ...prev, contradictions: true }))
    const db = getFirestoreClient()
    const contradictionsRef = collection(db, `${basePath}/contradictions`)
    const q = query(contradictionsRef, orderBy('temporal.tCreated', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextContradictions = snapshot.docs.map((docSnap) => docSnap.data() as Contradiction)
        setContradictions(nextContradictions)
        setLoadingStates((prev) => ({ ...prev, contradictions: false }))
      },
      (err) => {
        console.error('Error loading contradictions:', err)
        setLoadingStates((prev) => ({ ...prev, contradictions: false }))
      }
    )

    return () => {
      unsubscribe()
      setContradictions([])
      setLoadingStates((prev) => ({ ...prev, contradictions: false }))
    }
  }, [basePath, refreshTrigger])

  // Subscribe to regimes
  useEffect(() => {
    if (!basePath) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Setting loading state before subscription is valid pattern
    setLoadingStates((prev) => ({ ...prev, regimes: true }))
    const db = getFirestoreClient()
    const regimesRef = collection(db, `${basePath}/regimes`)
    const q = query(regimesRef, orderBy('temporal.tCreated', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextRegimes = snapshot.docs.map((docSnap) => docSnap.data() as Regime)
        setRegimes(nextRegimes)
        setLoadingStates((prev) => ({ ...prev, regimes: false }))
      },
      (err) => {
        console.error('Error loading regimes:', err)
        setLoadingStates((prev) => ({ ...prev, regimes: false }))
      }
    )

    return () => {
      unsubscribe()
      setRegimes([])
      setLoadingStates((prev) => ({ ...prev, regimes: false }))
    }
  }, [basePath, refreshTrigger])

  // Subscribe to communities
  useEffect(() => {
    if (!basePath) return

    // eslint-disable-next-line react-hooks/set-state-in-effect -- Setting loading state before subscription is valid pattern
    setLoadingStates((prev) => ({ ...prev, communities: true }))
    const db = getFirestoreClient()
    const communitiesRef = collection(db, `${basePath}/communities`)
    const q = query(communitiesRef, orderBy('temporal.tCreated', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const nextCommunities = snapshot.docs.map((docSnap) => docSnap.data() as Community)
        setCommunities(nextCommunities)
        setLoadingStates((prev) => ({ ...prev, communities: false }))
      },
      (err) => {
        console.error('Error loading communities:', err)
        setLoadingStates((prev) => ({ ...prev, communities: false }))
      }
    )

    return () => {
      unsubscribe()
      setCommunities([])
      setLoadingStates((prev) => ({ ...prev, communities: false }))
    }
  }, [basePath, refreshTrigger])

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
