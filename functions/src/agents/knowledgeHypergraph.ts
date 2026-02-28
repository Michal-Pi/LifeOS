/**
 * Knowledge Hypergraph
 *
 * Implements a 4-layer knowledge graph structure for dialectical reasoning:
 *
 * Layer 0: Episodes (raw agent exchanges)
 * Layer 1: Claims, Mechanisms, Contradictions (semantic layer)
 * Layer 2: Concepts, Regimes (ontology layer)
 * Layer 3: Communities (auto-discovered clusters)
 *
 * Uses graphlib for in-memory graph operations with Firestore persistence.
 * All edges are bi-temporal with world time (t_valid/t_invalid) and
 * system time (t_created/t_expired).
 */

import { Graph } from 'graphlib'
import { getFirestore, type Firestore } from 'firebase-admin/firestore'
import type {
  DialecticalSessionId,
  Claim,
  ClaimId,
  Mechanism,
  MechanismId,
  Contradiction,
  ContradictionId,
  Concept,
  ConceptId,
  Regime,
  RegimeId,
  Community,
  CommunityId,
  BiTemporalEdge,
  CreateClaimInput,
  CreateMechanismInput,
  CreateContradictionInput,
  CreateConceptInput,
  CreateRegimeInput,
  CreateCommunityInput,
  RewriteOperator,
  SourceRecord,
} from '@lifeos/agents'
import {
  createBiTemporalEdge,
  expireBiTemporalEdge,
  invalidateBiTemporalEdge,
} from '@lifeos/agents'

// ----- Types -----

/**
 * Node types in the knowledge graph
 */
export type KGNodeType =
  | 'claim'
  | 'concept'
  | 'mechanism'
  | 'contradiction'
  | 'regime'
  | 'community'
  | 'source'

/**
 * Edge types in the knowledge graph
 */
export type KGEdgeType =
  | 'references' // Claim references concept
  | 'supports' // Claim supports another claim
  | 'contradicts' // Claim contradicts another claim
  | 'part_of' // Claim part of mechanism
  | 'is_a' // Concept is-a relationship
  | 'related_to' // Generic relationship
  | 'scoped_to' // Claim scoped to regime
  | 'member_of' // Node is member of community
  | 'sourced_from' // Claim sourced from a document
  | 'causal_link' // Causal relationship between concepts

/**
 * Graph node data - stores any dialectical entity
 */
export interface KGNode {
  id: string
  type: KGNodeType
  label: string
  temporal: BiTemporalEdge
  data: Claim | Concept | Mechanism | Contradiction | Regime | Community | SourceRecord
}

/**
 * Graph edge data
 */
export interface KGEdge {
  type: KGEdgeType
  weight: number
  temporal: BiTemporalEdge
  metadata?: Record<string, unknown>
}

/**
 * Query options for graph traversal
 */
export interface KGQueryOptions {
  maxDepth?: number
  nodeTypes?: KGNodeType[]
  edgeTypes?: KGEdgeType[]
  includeExpired?: boolean
  includeInvalid?: boolean
  limit?: number
}

/**
 * Result from a graph query
 */
export interface KGQueryResult {
  nodes: KGNode[]
  edges: Array<{ source: string; target: string; data: KGEdge }>
}

// ----- Knowledge Hypergraph Class -----

/**
 * Knowledge Hypergraph with graphlib + Firestore persistence
 */
export class KnowledgeHypergraph {
  private graph: Graph
  private db: Firestore
  private sessionId: DialecticalSessionId
  private userId: string
  private dirty: boolean = false

  constructor(sessionId: DialecticalSessionId, userId: string, db?: Firestore) {
    this.graph = new Graph({ directed: true, multigraph: true })
    this.db = db ?? getFirestore()
    this.sessionId = sessionId
    this.userId = userId
  }

  // ----- Collection Paths -----

  private claimsPath(): string {
    return `users/${this.userId}/dialectical/sessions/${this.sessionId}/claims`
  }

  private mechanismsPath(): string {
    return `users/${this.userId}/dialectical/sessions/${this.sessionId}/mechanisms`
  }

  private contradictionsPath(): string {
    return `users/${this.userId}/dialectical/sessions/${this.sessionId}/contradictions`
  }

  private conceptsPath(): string {
    return `users/${this.userId}/dialectical/sessions/${this.sessionId}/concepts`
  }

  private regimesPath(): string {
    return `users/${this.userId}/dialectical/sessions/${this.sessionId}/regimes`
  }

  private communitiesPath(): string {
    return `users/${this.userId}/dialectical/sessions/${this.sessionId}/communities`
  }

  private sourcesPath(): string {
    return `users/${this.userId}/dialectical/sessions/${this.sessionId}/sources`
  }

  // ----- Node Operations -----

  /**
   * Add a node to the graph
   */
  addNode(node: KGNode): void {
    this.graph.setNode(node.id, node)
    this.dirty = true
  }

  /**
   * Get a node by ID
   */
  getNode(id: string): KGNode | undefined {
    return this.graph.node(id) as KGNode | undefined
  }

  /**
   * Remove a node from the graph
   */
  removeNode(id: string): void {
    this.graph.removeNode(id)
    this.dirty = true
  }

  /**
   * Get all nodes of a specific type
   */
  getNodesByType(type: KGNodeType): KGNode[] {
    return this.graph
      .nodes()
      .map((id) => this.graph.node(id) as KGNode)
      .filter((node) => node?.type === type)
  }

  // ----- Edge Operations -----

  /**
   * Add an edge between nodes
   */
  addEdge(source: string, target: string, edge: KGEdge, name?: string): void {
    const edgeName = name ?? `${edge.type}_${Date.now()}`
    this.graph.setEdge(source, target, edge, edgeName)
    this.dirty = true
  }

  /**
   * Get edges between two nodes
   */
  getEdges(source: string, target: string): KGEdge[] {
    const edges = this.graph.nodeEdges(source)
    if (!edges) return []

    return edges
      .filter((e) => e.w === target)
      .map((e) => this.graph.edge(e) as KGEdge)
      .filter(Boolean)
  }

  /**
   * Get all edges from a node
   */
  getOutEdges(source: string): Array<{ target: string; data: KGEdge }> {
    const edges = this.graph.outEdges(source)
    if (!edges) return []

    return edges.map((e) => ({
      target: e.w,
      data: this.graph.edge(e) as KGEdge,
    }))
  }

  /**
   * Get all edges to a node
   */
  getInEdges(target: string): Array<{ source: string; data: KGEdge }> {
    const edges = this.graph.inEdges(target)
    if (!edges) return []

    return edges.map((e) => ({
      source: e.v,
      data: this.graph.edge(e) as KGEdge,
    }))
  }

  /**
   * Get all neighbor node IDs (both incoming and outgoing)
   */
  getNeighbors(nodeId: string): string[] {
    const successors = this.graph.successors(nodeId) ?? []
    const predecessors = this.graph.predecessors(nodeId) ?? []

    // Combine and deduplicate
    const neighbors = new Set<string>([...successors, ...predecessors])
    return Array.from(neighbors)
  }

  // ----- Graph Queries -----

  /**
   * Find shortest path between two nodes using BFS
   */
  shortestPath(source: string, target: string): string[] | null {
    if (source === target) return [source]

    const visited = new Set<string>()
    const queue: Array<{ node: string; path: string[] }> = [{ node: source, path: [source] }]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.node)) continue
      visited.add(current.node)

      const neighbors = this.graph.successors(current.node) ?? []
      for (const neighbor of neighbors) {
        const newPath = [...current.path, neighbor]
        if (neighbor === target) {
          return newPath
        }
        queue.push({ node: neighbor, path: newPath })
      }
    }

    return null
  }

  /**
   * Get action distance (shortest path to a node of specified type)
   */
  actionDistance(source: string, targetType: KGNodeType): number {
    const visited = new Set<string>()
    const queue: Array<{ node: string; distance: number }> = [{ node: source, distance: 0 }]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.node)) continue
      visited.add(current.node)

      const nodeData = this.getNode(current.node)
      if (nodeData?.type === targetType && current.distance > 0) {
        return current.distance
      }

      const neighbors = this.graph.successors(current.node) ?? []
      for (const neighbor of neighbors) {
        queue.push({ node: neighbor, distance: current.distance + 1 })
      }
    }

    return Infinity
  }

  /**
   * Get all active (non-superseded, non-invalid) contradictions
   */
  getActiveContradictions(): KGNode[] {
    return this.getNodesByType('contradiction').filter((node) => {
      const temporal = node.temporal
      return temporal.tExpired === null && temporal.tInvalid === null
    })
  }

  /**
   * Get concept lineage (versions over time)
   */
  getConceptLineage(conceptId: string): KGNode[] {
    const lineage: KGNode[] = []
    let currentId: string | undefined = conceptId

    while (currentId) {
      const node = this.getNode(currentId)
      if (!node || node.type !== 'concept') break

      lineage.push(node)
      currentId = (node.data as Concept).previousVersionId ?? undefined
    }

    return lineage
  }

  /**
   * Get subgraph around a node
   */
  getNeighborhood(nodeId: string, options: KGQueryOptions = {}): KGQueryResult {
    const { maxDepth = 2, nodeTypes, edgeTypes, includeExpired = false, limit = 100 } = options

    const nodes: Map<string, KGNode> = new Map()
    const edges: Array<{ source: string; target: string; data: KGEdge }> = []
    const visited = new Set<string>()
    const queue: Array<{ node: string; depth: number }> = [{ node: nodeId, depth: 0 }]

    while (queue.length > 0 && nodes.size < limit) {
      const current = queue.shift()!
      if (visited.has(current.node) || current.depth > maxDepth) continue
      visited.add(current.node)

      const nodeData = this.getNode(current.node)
      if (!nodeData) continue

      // Filter by node type
      if (nodeTypes && !nodeTypes.includes(nodeData.type)) continue

      // Filter expired nodes
      if (!includeExpired && nodeData.temporal.tExpired !== null) continue

      nodes.set(current.node, nodeData)

      // Add edges and neighbors
      const outEdges = this.getOutEdges(current.node)
      for (const edge of outEdges) {
        // Filter by edge type
        if (edgeTypes && !edgeTypes.includes(edge.data.type)) continue

        // Filter expired edges
        if (!includeExpired && edge.data.temporal.tExpired !== null) continue

        edges.push({
          source: current.node,
          target: edge.target,
          data: edge.data,
        })

        if (!visited.has(edge.target)) {
          queue.push({ node: edge.target, depth: current.depth + 1 })
        }
      }

      const inEdges = this.getInEdges(current.node)
      for (const edge of inEdges) {
        if (edgeTypes && !edgeTypes.includes(edge.data.type)) continue
        if (!includeExpired && edge.data.temporal.tExpired !== null) continue

        edges.push({
          source: edge.source,
          target: current.node,
          data: edge.data,
        })

        if (!visited.has(edge.source)) {
          queue.push({ node: edge.source, depth: current.depth + 1 })
        }
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
    }
  }

  // ----- Claim Operations -----

  /**
   * Add a claim to the graph
   */
  async addClaim(input: CreateClaimInput): Promise<Claim> {
    const claimId = `claim_${Date.now()}_${Math.random().toString(36).slice(2)}` as ClaimId
    const temporal = createBiTemporalEdge()

    const claim: Claim = {
      ...input,
      claimId,
      status: 'ACTIVE',
      temporal,
      contradictionIds: [],
    }

    // Add to in-memory graph
    this.addNode({
      id: claimId,
      type: 'claim',
      label: input.text.substring(0, 50),
      temporal,
      data: claim,
    })

    // Connect to concepts
    for (const conceptId of input.conceptIds) {
      this.addEdge(claimId, conceptId, {
        type: 'references',
        weight: 1,
        temporal,
      })
    }

    // Persist to Firestore
    await this.db.doc(`${this.claimsPath()}/${claimId}`).set(claim)

    return claim
  }

  /**
   * Supersede a claim with a new one
   */
  async supersedeClaim(oldClaimId: ClaimId, newClaimInput: CreateClaimInput): Promise<Claim> {
    const oldNode = this.getNode(oldClaimId)
    if (!oldNode) throw new Error(`Claim ${oldClaimId} not found`)

    const oldClaim = oldNode.data as Claim

    // Expire the old claim
    const expiredTemporal = expireBiTemporalEdge(oldClaim.temporal)
    oldNode.temporal = expiredTemporal
    ;(oldNode.data as Claim).temporal = expiredTemporal
    ;(oldNode.data as Claim).status = 'SUPERSEDED'

    // Create new claim
    const newClaim = await this.addClaim(newClaimInput)

    // Update old claim with supersededBy
    ;(oldNode.data as Claim).supersededBy = newClaim.claimId

    // Persist changes
    await this.db.doc(`${this.claimsPath()}/${oldClaimId}`).update({
      temporal: expiredTemporal,
      status: 'SUPERSEDED',
      supersededBy: newClaim.claimId,
    })

    return newClaim
  }

  // ----- Concept Operations -----

  /**
   * Add a concept to the graph
   */
  async addConcept(input: CreateConceptInput): Promise<Concept> {
    const conceptId = `concept_${Date.now()}_${Math.random().toString(36).slice(2)}` as ConceptId
    const temporal = createBiTemporalEdge()

    const concept: Concept = {
      ...input,
      conceptId,
      version: 1,
      temporal,
      claimIds: [],
    }

    // Add to in-memory graph
    this.addNode({
      id: conceptId,
      type: 'concept',
      label: input.name,
      temporal,
      data: concept,
    })

    // Connect to parent concepts
    for (const parentId of input.parentConceptIds) {
      this.addEdge(conceptId, parentId, {
        type: 'is_a',
        weight: 1,
        temporal,
      })
    }

    // Connect to related concepts
    for (const relatedId of input.relatedConceptIds) {
      this.addEdge(conceptId, relatedId, {
        type: 'related_to',
        weight: 0.5,
        temporal,
      })
    }

    // Persist to Firestore
    await this.db.doc(`${this.conceptsPath()}/${conceptId}`).set(concept)

    return concept
  }

  // ----- Contradiction Operations -----

  /**
   * Add a contradiction to the graph
   */
  async addContradiction(input: CreateContradictionInput): Promise<Contradiction> {
    const contradictionId =
      `contra_${Date.now()}_${Math.random().toString(36).slice(2)}` as ContradictionId
    const temporal = createBiTemporalEdge()

    const contradiction: Contradiction = {
      ...input,
      contradictionId,
      status: 'OPEN',
      temporal,
    }

    // Add to in-memory graph
    this.addNode({
      id: contradictionId,
      type: 'contradiction',
      label: input.description.substring(0, 50),
      temporal,
      data: contradiction,
    })

    // Connect to participating claims
    for (const claimId of input.claimIds) {
      this.addEdge(contradictionId, claimId, {
        type: 'contradicts',
        weight: input.severity === 'HIGH' ? 1 : input.severity === 'MEDIUM' ? 0.7 : 0.3,
        temporal,
      })

      // Update claim's contradiction list
      const claimNode = this.getNode(claimId)
      if (claimNode) {
        const claim = claimNode.data as Claim
        claim.contradictionIds.push(contradictionId)
      }
    }

    // Persist to Firestore
    await this.db.doc(`${this.contradictionsPath()}/${contradictionId}`).set(contradiction)

    return contradiction
  }

  /**
   * Resolve a contradiction
   */
  async resolveContradiction(
    contradictionId: ContradictionId,
    resolutionNote: string,
    sublationId?: string
  ): Promise<void> {
    const node = this.getNode(contradictionId)
    if (!node) throw new Error(`Contradiction ${contradictionId} not found`)

    const contradiction = node.data as Contradiction
    const updatedTemporal = invalidateBiTemporalEdge(contradiction.temporal)

    contradiction.status = 'RESOLVED'
    contradiction.resolutionNote = resolutionNote
    contradiction.resolvedBySublationId = sublationId
    contradiction.temporal = updatedTemporal
    node.temporal = updatedTemporal

    await this.db.doc(`${this.contradictionsPath()}/${contradictionId}`).update({
      status: 'RESOLVED',
      resolutionNote,
      resolvedBySublationId: sublationId,
      temporal: updatedTemporal,
    })
  }

  // ----- Mechanism Operations -----

  /**
   * Add a mechanism (hyperedge) to the graph
   */
  async addMechanism(input: CreateMechanismInput): Promise<Mechanism> {
    const mechanismId = `mech_${Date.now()}_${Math.random().toString(36).slice(2)}` as MechanismId
    const temporal = createBiTemporalEdge()

    const mechanism: Mechanism = {
      ...input,
      mechanismId,
      temporal,
    }

    // Add mechanism as a node (hyperedge representation)
    this.addNode({
      id: mechanismId,
      type: 'mechanism',
      label: input.description.substring(0, 50),
      temporal,
      data: mechanism,
    })

    // Connect to participating claims
    for (const claimId of input.participantClaimIds) {
      const role = input.roles[claimId] ?? 'CONDITION'
      this.addEdge(mechanismId, claimId, {
        type: 'part_of',
        weight: role === 'CAUSE' || role === 'EFFECT' ? 1 : 0.5,
        temporal,
        metadata: { role },
      })
    }

    // Persist to Firestore
    await this.db.doc(`${this.mechanismsPath()}/${mechanismId}`).set(mechanism)

    return mechanism
  }

  // ----- Regime Operations -----

  /**
   * Add a regime to the graph
   */
  async addRegime(input: CreateRegimeInput): Promise<Regime> {
    const regimeId = `regime_${Date.now()}_${Math.random().toString(36).slice(2)}` as RegimeId
    const temporal = createBiTemporalEdge()

    const regime: Regime = {
      ...input,
      regimeId,
      temporal,
      scopedClaimIds: [],
    }

    // Add to in-memory graph
    this.addNode({
      id: regimeId,
      type: 'regime',
      label: input.name,
      temporal,
      data: regime,
    })

    // Persist to Firestore
    await this.db.doc(`${this.regimesPath()}/${regimeId}`).set(regime)

    return regime
  }

  /**
   * Scope a claim to a regime
   */
  async scopeClaimToRegime(claimId: ClaimId, regimeId: RegimeId): Promise<void> {
    const claimNode = this.getNode(claimId)
    const regimeNode = this.getNode(regimeId)

    if (!claimNode) throw new Error(`Claim ${claimId} not found`)
    if (!regimeNode) throw new Error(`Regime ${regimeId} not found`)

    const temporal = createBiTemporalEdge()

    // Add edge
    this.addEdge(claimId, regimeId, {
      type: 'scoped_to',
      weight: 1,
      temporal,
    })

    // Update claim
    const claim = claimNode.data as Claim
    claim.regimeId = regimeId

    // Update regime
    const regime = regimeNode.data as Regime
    regime.scopedClaimIds.push(claimId)

    // Persist
    await Promise.all([
      this.db.doc(`${this.claimsPath()}/${claimId}`).update({ regimeId }),
      this.db
        .doc(`${this.regimesPath()}/${regimeId}`)
        .update({ scopedClaimIds: regime.scopedClaimIds }),
    ])
  }

  // ----- Community Operations -----

  /**
   * Add a community to the graph
   */
  async addCommunity(input: CreateCommunityInput): Promise<Community> {
    const communityId = `comm_${Date.now()}_${Math.random().toString(36).slice(2)}` as CommunityId
    const temporal = createBiTemporalEdge()

    const community: Community = {
      ...input,
      communityId,
      temporal,
    }

    // Add to in-memory graph
    this.addNode({
      id: communityId,
      type: 'community',
      label: input.name,
      temporal,
      data: community,
    })

    // Connect members
    const memberIds = [...input.conceptIds, ...input.claimIds, ...input.mechanismIds]

    for (const memberId of memberIds) {
      this.addEdge(memberId, communityId, {
        type: 'member_of',
        weight: 1,
        temporal,
      })
    }

    // Persist to Firestore
    await this.db.doc(`${this.communitiesPath()}/${communityId}`).set(community)

    return community
  }

  // ----- Source Operations -----

  /**
   * Add a source document node to the graph.
   * Used by the deep research workflow to track provenance of claims.
   */
  async addSource(input: {
    sourceId: string
    url: string
    title: string
    domain: string
    fetchedAtMs: number
    fetchMethod: string
    contentLength: number
    contentHash: string
    sourceType: string
    relevanceScore?: number
    scholarMetadata?: Record<string, unknown>
  }): Promise<KGNode> {
    const temporal = createBiTemporalEdge()

    const node: KGNode = {
      id: input.sourceId,
      type: 'source',
      label: input.title.substring(0, 50),
      temporal,
      data: { ...input, temporal } as SourceRecord,
    }

    this.addNode(node)

    // Persist to Firestore
    await this.db.doc(`${this.sourcesPath()}/${input.sourceId}`).set(input)

    return node
  }

  /**
   * Get all source nodes that a claim is sourced from.
   */
  getSourcesForClaim(claimId: string): KGNode[] {
    const outEdges = this.getOutEdges(claimId)
    return outEdges
      .filter((e) => e.data.type === 'sourced_from')
      .map((e) => this.getNode(e.target))
      .filter((n): n is KGNode => n !== undefined && n.type === 'source')
  }

  // ----- Persistence -----

  /**
   * Load graph from Firestore
   */
  async load(): Promise<void> {
    // Load all node types in parallel
    const [claims, mechanisms, contradictions, concepts, regimes, communities, sources] =
      await Promise.all([
        this.db.collection(this.claimsPath()).get(),
        this.db.collection(this.mechanismsPath()).get(),
        this.db.collection(this.contradictionsPath()).get(),
        this.db.collection(this.conceptsPath()).get(),
        this.db.collection(this.regimesPath()).get(),
        this.db.collection(this.communitiesPath()).get(),
        this.db.collection(this.sourcesPath()).get(),
      ])

    // Add claims
    for (const doc of claims.docs) {
      const claim = doc.data() as Claim
      this.addNode({
        id: claim.claimId,
        type: 'claim',
        label: claim.text.substring(0, 50),
        temporal: claim.temporal,
        data: claim,
      })
    }

    // Add concepts
    for (const doc of concepts.docs) {
      const concept = doc.data() as Concept
      this.addNode({
        id: concept.conceptId,
        type: 'concept',
        label: concept.name,
        temporal: concept.temporal,
        data: concept,
      })
    }

    // Add mechanisms
    for (const doc of mechanisms.docs) {
      const mechanism = doc.data() as Mechanism
      this.addNode({
        id: mechanism.mechanismId,
        type: 'mechanism',
        label: mechanism.description.substring(0, 50),
        temporal: mechanism.temporal,
        data: mechanism,
      })
    }

    // Add contradictions
    for (const doc of contradictions.docs) {
      const contradiction = doc.data() as Contradiction
      this.addNode({
        id: contradiction.contradictionId,
        type: 'contradiction',
        label: contradiction.description.substring(0, 50),
        temporal: contradiction.temporal,
        data: contradiction,
      })
    }

    // Add regimes
    for (const doc of regimes.docs) {
      const regime = doc.data() as Regime
      this.addNode({
        id: regime.regimeId,
        type: 'regime',
        label: regime.name,
        temporal: regime.temporal,
        data: regime,
      })
    }

    // Add communities
    for (const doc of communities.docs) {
      const community = doc.data() as Community
      this.addNode({
        id: community.communityId,
        type: 'community',
        label: community.name,
        temporal: community.temporal,
        data: community,
      })
    }

    // Add sources
    for (const doc of sources.docs) {
      const source = doc.data()
      this.addNode({
        id: source.sourceId as string,
        type: 'source',
        label: ((source.title as string) ?? '').substring(0, 50),
        temporal: (source.temporal as BiTemporalEdge) ?? createBiTemporalEdge(),
        data: source as SourceRecord,
      })
    }

    // Rebuild edges based on relationships stored in nodes
    this.rebuildEdges()

    this.dirty = false
  }

  /**
   * Rebuild edges from node data
   */
  private rebuildEdges(): void {
    const claims = this.getNodesByType('claim')
    const mechanisms = this.getNodesByType('mechanism')
    const concepts = this.getNodesByType('concept')
    // Note: regimes are loaded but not used for edge rebuilding in current implementation
    this.getNodesByType('regime')
    const communities = this.getNodesByType('community')

    // Rebuild claim -> concept edges
    for (const node of claims) {
      const claim = node.data as Claim
      for (const conceptId of claim.conceptIds) {
        this.addEdge(claim.claimId, conceptId, {
          type: 'references',
          weight: 1,
          temporal: claim.temporal,
        })
      }
      if (claim.regimeId) {
        this.addEdge(claim.claimId, claim.regimeId, {
          type: 'scoped_to',
          weight: 1,
          temporal: claim.temporal,
        })
      }
    }

    // Rebuild mechanism edges
    for (const node of mechanisms) {
      const mechanism = node.data as Mechanism
      for (const claimId of mechanism.participantClaimIds) {
        const role = mechanism.roles[claimId] ?? 'CONDITION'
        this.addEdge(mechanism.mechanismId, claimId, {
          type: 'part_of',
          weight: role === 'CAUSE' || role === 'EFFECT' ? 1 : 0.5,
          temporal: mechanism.temporal,
          metadata: { role },
        })
      }
    }

    // Rebuild concept hierarchy
    for (const node of concepts) {
      const concept = node.data as Concept
      for (const parentId of concept.parentConceptIds) {
        this.addEdge(concept.conceptId, parentId, {
          type: 'is_a',
          weight: 1,
          temporal: concept.temporal,
        })
      }
      for (const relatedId of concept.relatedConceptIds) {
        this.addEdge(concept.conceptId, relatedId, {
          type: 'related_to',
          weight: 0.5,
          temporal: concept.temporal,
        })
      }
    }

    // Rebuild community membership
    for (const node of communities) {
      const community = node.data as Community
      const memberIds = [...community.conceptIds, ...community.claimIds, ...community.mechanismIds]
      for (const memberId of memberIds) {
        this.addEdge(memberId, community.communityId, {
          type: 'member_of',
          weight: 1,
          temporal: community.temporal,
        })
      }
    }
  }

  /**
   * Get graph statistics
   */
  getStats(): {
    nodeCount: number
    edgeCount: number
    nodesByType: Record<KGNodeType, number>
  } {
    const nodeIds = (this.graph as { nodes: () => string[] }).nodes()
    const nodesByType: Record<KGNodeType, number> = {
      claim: 0,
      concept: 0,
      mechanism: 0,
      contradiction: 0,
      regime: 0,
      community: 0,
      source: 0,
    }

    for (const nodeId of nodeIds) {
      const node = this.getNode(nodeId)
      if (node) {
        nodesByType[node.type]++
      }
    }

    return {
      nodeCount: nodeIds.length,
      edgeCount: (this.graph as { edgeCount: () => number }).edgeCount(),
      nodesByType,
    }
  }

  // ----- Rewrite Operators -----

  /**
   * SPLIT operator: Split a concept into multiple sub-concepts
   *
   * Example: "Market" → ["Bull Market", "Bear Market", "Sideways Market"]
   */
  async applySplit(
    conceptId: ConceptId,
    newConcepts: Array<{ name: string; definition: string }>
  ): Promise<{ oldConcept: Concept; newConcepts: Concept[] }> {
    const node = this.getNode(conceptId)
    if (!node || node.type !== 'concept') {
      throw new Error(`Concept ${conceptId} not found`)
    }

    const oldConcept = node.data as Concept

    // Expire the old concept
    const expiredTemporal = expireBiTemporalEdge(oldConcept.temporal)
    node.temporal = expiredTemporal
    oldConcept.temporal = expiredTemporal

    // Create new sub-concepts
    const createdConcepts: Concept[] = []
    for (const { name, definition } of newConcepts) {
      const newConcept = await this.addConcept({
        sessionId: oldConcept.sessionId,
        userId: oldConcept.userId,
        name,
        definition,
        alternateNames: [],
        conceptType: oldConcept.conceptType,
        introducedInCycle: oldConcept.introducedInCycle,
        parentConceptIds: [conceptId], // Point to original as parent
        relatedConceptIds: [],
      })
      createdConcepts.push(newConcept)
    }

    // Note: Claims referencing old concept would be migrated to new concepts
    // This is handled by the caller or through subsequent claim updates
    const _claimsReferencing = this.getNodesByType('claim').filter((claimNode) => {
      const claim = claimNode.data as Claim
      return claim.conceptIds.includes(conceptId)
    })

    // Update Firestore
    await this.db.doc(`${this.conceptsPath()}/${conceptId}`).update({
      temporal: expiredTemporal,
      splitInto: createdConcepts.map((c) => c.conceptId),
    })

    return { oldConcept, newConcepts: createdConcepts }
  }

  /**
   * MERGE operator: Merge multiple concepts into a single concept
   *
   * Example: ["Positive Feedback", "Virtuous Cycle", "Amplification Loop"] → "Reinforcing Loop"
   */
  async applyMerge(
    conceptIds: ConceptId[],
    mergedConcept: { name: string; definition: string }
  ): Promise<{ oldConcepts: Concept[]; newConcept: Concept }> {
    if (conceptIds.length < 2) {
      throw new Error('MERGE requires at least 2 concepts')
    }

    // Collect old concepts
    const oldConcepts: Concept[] = []
    for (const conceptId of conceptIds) {
      const node = this.getNode(conceptId)
      if (!node || node.type !== 'concept') {
        throw new Error(`Concept ${conceptId} not found`)
      }
      oldConcepts.push(node.data as Concept)
    }

    // Create the merged concept
    const firstConcept = oldConcepts[0]
    const newConcept = await this.addConcept({
      sessionId: firstConcept.sessionId,
      userId: firstConcept.userId,
      name: mergedConcept.name,
      definition: mergedConcept.definition,
      alternateNames: oldConcepts.flatMap((c) => c.alternateNames ?? []),
      conceptType: firstConcept.conceptType,
      introducedInCycle: firstConcept.introducedInCycle,
      parentConceptIds: [], // Will inherit from merged concepts
      relatedConceptIds: [],
    })

    // Expire old concepts and point to merged concept
    for (const oldConcept of oldConcepts) {
      const node = this.getNode(oldConcept.conceptId)!
      const expiredTemporal = expireBiTemporalEdge(oldConcept.temporal)
      node.temporal = expiredTemporal
      oldConcept.temporal = expiredTemporal

      await this.db.doc(`${this.conceptsPath()}/${oldConcept.conceptId}`).update({
        temporal: expiredTemporal,
        mergedInto: newConcept.conceptId,
      })
    }

    // Migrate all claims referencing old concepts to new concept
    for (const oldConcept of oldConcepts) {
      const claimsReferencing = this.getNodesByType('claim').filter((claimNode) => {
        const claim = claimNode.data as Claim
        return claim.conceptIds.includes(oldConcept.conceptId)
      })

      for (const claimNode of claimsReferencing) {
        const claim = claimNode.data as Claim
        // Replace old concept ID with new one
        claim.conceptIds = claim.conceptIds.map((id) =>
          id === oldConcept.conceptId ? newConcept.conceptId : id
        )

        // Add edge to new concept
        this.addEdge(claim.claimId, newConcept.conceptId, {
          type: 'references',
          weight: 1,
          temporal: createBiTemporalEdge(),
        })
      }
    }

    return { oldConcepts, newConcept }
  }

  /**
   * REVERSE_EDGE operator: Reverse the direction of a causal relationship
   *
   * Example: "A causes B" → "B causes A" (when discovering reverse causation)
   */
  async applyReverseEdge(
    mechanismId: MechanismId,
    causeClaimId: ClaimId,
    effectClaimId: ClaimId
  ): Promise<Mechanism> {
    const node = this.getNode(mechanismId)
    if (!node || node.type !== 'mechanism') {
      throw new Error(`Mechanism ${mechanismId} not found`)
    }

    const mechanism = node.data as Mechanism

    // Verify both claims are in the mechanism
    if (!mechanism.participantClaimIds.includes(causeClaimId)) {
      throw new Error(`Claim ${causeClaimId} not in mechanism`)
    }
    if (!mechanism.participantClaimIds.includes(effectClaimId)) {
      throw new Error(`Claim ${effectClaimId} not in mechanism`)
    }

    // Swap roles
    const oldCauseRole = mechanism.roles[causeClaimId]
    const oldEffectRole = mechanism.roles[effectClaimId]

    mechanism.roles[causeClaimId] = oldEffectRole
    mechanism.roles[effectClaimId] = oldCauseRole

    // Update Firestore
    await this.db.doc(`${this.mechanismsPath()}/${mechanismId}`).update({
      roles: mechanism.roles,
    })

    this.dirty = true

    return mechanism
  }

  /**
   * ADD_MEDIATOR operator: Add an intermediate concept/claim between two claims
   *
   * Example: "Stress" → "Cortisol Release" → "Health Issues" (adding mediator)
   */
  async applyAddMediator(
    mechanismId: MechanismId,
    mediatorClaim: CreateClaimInput,
    betweenClaims: [ClaimId, ClaimId]
  ): Promise<{ mechanism: Mechanism; mediator: Claim }> {
    const node = this.getNode(mechanismId)
    if (!node || node.type !== 'mechanism') {
      throw new Error(`Mechanism ${mechanismId} not found`)
    }

    const mechanism = node.data as Mechanism
    const [beforeClaimId, afterClaimId] = betweenClaims

    // Create the mediator claim
    const mediator = await this.addClaim(mediatorClaim)

    // Add mediator to mechanism
    mechanism.participantClaimIds.push(mediator.claimId)
    mechanism.roles[mediator.claimId] = 'MEDIATOR'

    // Add edge from mechanism to mediator
    this.addEdge(mechanismId, mediator.claimId, {
      type: 'part_of',
      weight: 1,
      temporal: createBiTemporalEdge(),
      metadata: { role: 'MEDIATOR', between: [beforeClaimId, afterClaimId] },
    })

    // Update Firestore
    await this.db.doc(`${this.mechanismsPath()}/${mechanismId}`).update({
      participantClaimIds: mechanism.participantClaimIds,
      roles: mechanism.roles,
    })

    return { mechanism, mediator }
  }

  /**
   * SCOPE_TO_REGIME operator: Limit a claim's validity to a specific regime
   *
   * Example: "Low interest rates stimulate growth" scoped to "Regime: Post-2008 monetary policy"
   */
  async applyScopeToRegime(
    claimId: ClaimId,
    regimeInput: CreateRegimeInput
  ): Promise<{ claim: Claim; regime: Regime }> {
    const claimNode = this.getNode(claimId)
    if (!claimNode || claimNode.type !== 'claim') {
      throw new Error(`Claim ${claimId} not found`)
    }

    const claim = claimNode.data as Claim

    // Create the regime if it doesn't exist
    const regime = await this.addRegime(regimeInput)

    // Scope the claim to the regime
    await this.scopeClaimToRegime(claimId, regime.regimeId)

    return { claim, regime }
  }

  /**
   * TEMPORALIZE operator: Add temporal ordering to claims
   *
   * Example: ["Event A", "Event B", "Event C"] → ordered sequence
   */
  async applyTemporalize(
    claimIds: ClaimId[],
    temporalOrder: ClaimId[],
    sequenceDescription?: string
  ): Promise<Mechanism> {
    if (claimIds.length < 2) {
      throw new Error('TEMPORALIZE requires at least 2 claims')
    }

    // Verify all claims exist and get first claim for context
    let firstClaim: Claim | null = null
    for (const claimId of claimIds) {
      const node = this.getNode(claimId)
      if (!node || node.type !== 'claim') {
        throw new Error(`Claim ${claimId} not found`)
      }
      if (!firstClaim) {
        firstClaim = node.data as Claim
      }
    }

    if (!firstClaim) {
      throw new Error('No valid claims found')
    }

    // Create a temporal mechanism
    // In temporal sequences, we use CAUSE for earlier events and EFFECT for later ones
    // with MEDIATOR for intermediate steps
    type MechanismRole = 'CAUSE' | 'EFFECT' | 'MEDIATOR' | 'CONDITION' | 'CONSTRAINT'
    const roles: Record<string, MechanismRole> = {}
    for (let i = 0; i < temporalOrder.length; i++) {
      const claimId = temporalOrder[i]
      if (i === 0) {
        roles[claimId] = 'CAUSE'
      } else if (i === temporalOrder.length - 1) {
        roles[claimId] = 'EFFECT'
      } else {
        roles[claimId] = 'MEDIATOR'
      }
    }

    const mechanism = await this.addMechanism({
      sessionId: firstClaim.sessionId,
      userId: firstClaim.userId,
      description: sequenceDescription ?? `Temporal sequence: ${temporalOrder.join(' → ')}`,
      mechanismType: 'TEMPORAL',
      participantClaimIds: claimIds,
      roles,
      sourceEpisodeId: firstClaim.sourceEpisodeId,
      discoveredInCycle: 0, // Default cycle for temporal ordering operators
      confidence: 0.8, // Default confidence for temporal ordering
    })

    return mechanism
  }

  /**
   * Apply a rewrite operator from the dialectical cycle
   */
  async applyRewriteOperator(
    operator: RewriteOperator
  ): Promise<{ success: boolean; result?: unknown; error?: string }> {
    try {
      switch (operator.type) {
        case 'SPLIT': {
          const { conceptId, newConcepts } = operator.args as {
            conceptId: ConceptId
            newConcepts: Array<{ name: string; definition: string }>
          }
          const result = await this.applySplit(conceptId, newConcepts)
          return { success: true, result }
        }

        case 'MERGE': {
          const { conceptIds, mergedConcept } = operator.args as {
            conceptIds: ConceptId[]
            mergedConcept: { name: string; definition: string }
          }
          const result = await this.applyMerge(conceptIds, mergedConcept)
          return { success: true, result }
        }

        case 'REVERSE_EDGE': {
          const { mechanismId, causeClaimId, effectClaimId } = operator.args as {
            mechanismId: MechanismId
            causeClaimId: ClaimId
            effectClaimId: ClaimId
          }
          const result = await this.applyReverseEdge(mechanismId, causeClaimId, effectClaimId)
          return { success: true, result }
        }

        case 'ADD_MEDIATOR': {
          const { mechanismId, mediatorClaim, betweenClaims } = operator.args as {
            mechanismId: MechanismId
            mediatorClaim: CreateClaimInput
            betweenClaims: [ClaimId, ClaimId]
          }
          const result = await this.applyAddMediator(mechanismId, mediatorClaim, betweenClaims)
          return { success: true, result }
        }

        case 'SCOPE_TO_REGIME': {
          const { claimId, regimeInput } = operator.args as {
            claimId: ClaimId
            regimeInput: CreateRegimeInput
          }
          const result = await this.applyScopeToRegime(claimId, regimeInput)
          return { success: true, result }
        }

        case 'TEMPORALIZE': {
          const { claimIds, temporalOrder, sequenceDescription } = operator.args as {
            claimIds: ClaimId[]
            temporalOrder: ClaimId[]
            sequenceDescription?: string
          }
          const result = await this.applyTemporalize(claimIds, temporalOrder, sequenceDescription)
          return { success: true, result }
        }

        default:
          return { success: false, error: `Unknown operator type: ${operator.type}` }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

/**
 * Create a new knowledge hypergraph instance
 */
export function createKnowledgeHypergraph(
  sessionId: DialecticalSessionId,
  userId: string,
  db?: Firestore
): KnowledgeHypergraph {
  return new KnowledgeHypergraph(sessionId, userId, db)
}
