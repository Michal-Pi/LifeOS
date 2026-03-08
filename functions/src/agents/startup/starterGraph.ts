import type {
  CompactGraph,
  ExtractedClaim,
  OracleEvidence,
  OracleKnowledgeGraph,
  OracleClaim,
} from '@lifeos/agents'
import type { StartupSeedSummary } from './inputNormalizer.js'

const OPPOSING_TERM_PAIRS: Array<[string, string]> = [
  ['increase', 'decrease'],
  ['rise', 'fall'],
  ['growth', 'decline'],
  ['expand', 'contract'],
  ['accelerate', 'slow'],
  ['adoption', 'rejection'],
  ['centralized', 'decentralized'],
]

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 3)
}

function overlapScore(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left))
  const rightTokens = new Set(tokenize(right))
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0

  let overlap = 0
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap++
  }
  return overlap / Math.max(leftTokens.size, rightTokens.size)
}

function hasOpposingTerms(left: string, right: string): boolean {
  const leftText = left.toLowerCase()
  const rightText = right.toLowerCase()
  return OPPOSING_TERM_PAIRS.some(
    ([a, b]) =>
      (leftText.includes(a) && rightText.includes(b)) ||
      (leftText.includes(b) && rightText.includes(a))
  )
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value))
}

function buildClaimNodeId(index: number): string {
  return `seed-node-${String(index + 1).padStart(2, '0')}`
}

function inferOracleNodeType(text: string): OracleKnowledgeGraph['nodes'][number]['type'] {
  const normalized = text.toLowerCase()
  if (
    normalized.includes('regulat') ||
    normalized.includes('limit') ||
    normalized.includes('constraint') ||
    normalized.includes('barrier') ||
    normalized.includes('approval')
  ) {
    return 'constraint'
  }
  if (
    normalized.includes('trend') ||
    normalized.includes('rise') ||
    normalized.includes('fall') ||
    normalized.includes('growth') ||
    normalized.includes('decline') ||
    normalized.includes('adoption')
  ) {
    return 'trend'
  }
  return 'principle'
}

export function buildStarterCompactGraphFromClaims(
  claims: ExtractedClaim[],
  maxNodes = 10
): CompactGraph {
  const selectedClaims = [...claims]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, maxNodes)

  const nodes: CompactGraph['nodes'] = selectedClaims.map((claim, index) => ({
    id: buildClaimNodeId(index),
    label: claim.claimText.slice(0, 80),
    type: 'claim',
    note: claim.pageOrSection?.slice(0, 150),
    sourceId: claim.sourceId,
    sourceConfidence: clamp(claim.confidence),
  }))

  const edges: CompactGraph['edges'] = []
  for (let leftIndex = 0; leftIndex < selectedClaims.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < selectedClaims.length; rightIndex++) {
      const leftClaim = selectedClaims[leftIndex]
      const rightClaim = selectedClaims[rightIndex]
      const leftNode = nodes[leftIndex]
      const rightNode = nodes[rightIndex]
      if (!leftNode || !rightNode) continue

      const score = overlapScore(leftClaim.claimText, rightClaim.claimText)
      if (hasOpposingTerms(leftClaim.claimText, rightClaim.claimText) && score >= 0.12) {
        edges.push({
          from: leftNode.id,
          to: rightNode.id,
          rel: 'contradicts',
          weight: clamp(score + 0.25),
        })
        continue
      }

      if (score >= 0.2 || (leftClaim.sourceId === rightClaim.sourceId && score >= 0.08)) {
        edges.push({
          from: leftNode.id,
          to: rightNode.id,
          rel: 'supports',
          weight: clamp(score + (leftClaim.sourceId === rightClaim.sourceId ? 0.2 : 0)),
        })
      }
    }
  }

  const averageConfidence =
    selectedClaims.length > 0
      ? selectedClaims.reduce((sum, claim) => sum + clamp(claim.confidence), 0) /
        selectedClaims.length
      : 0

  const sourceCount = new Set(selectedClaims.map((claim) => claim.sourceId)).size

  return {
    nodes,
    edges,
    summary:
      selectedClaims.length > 0
        ? `Seed graph from ${selectedClaims.length} attached-context claims across ${sourceCount} sources`
        : 'No attached-context claims available for starter graph',
    reasoning:
      selectedClaims.length > 0
        ? 'Deterministic startup graph seeded from attached user context before dialectical synthesis.'
        : 'Starter graph empty because no seed claims were retained.',
    confidence: clamp(averageConfidence),
    regime: sourceCount > 1 ? 'multi-source attached context' : 'single-source attached context',
    temporalGrain: 'mixed',
  }
}

export function linkEvidenceIdsForClaim(
  claimText: string,
  evidence: OracleEvidence[],
  maxIds = 3
): string[] {
  return [...evidence]
    .map((item) => {
      const score = overlapScore(
        claimText,
        [item.source, item.excerpt, item.query ?? ''].filter(Boolean).join(' ')
      )
      return { id: item.id, score }
    })
    .filter((entry) => entry.score >= 0.12)
    .sort((left, right) => right.score - left.score)
    .slice(0, maxIds)
    .map((entry) => entry.id)
}

export function buildStarterOracleGraphFromClaims(claims: OracleClaim[]): OracleKnowledgeGraph {
  const selectedClaims = [...claims].slice(0, 10)
  const nodes: OracleKnowledgeGraph['nodes'] = selectedClaims.map((claim, index) => ({
    id: `seed-oracle-node-${String(index + 1).padStart(2, '0')}`,
    type: inferOracleNodeType(claim.text),
    label: claim.text.slice(0, 120),
    ledgerRef: claim.id,
    properties: {
      confidence: clamp(claim.confidence),
      createdBy: claim.createdBy,
      evidenceIds: claim.evidenceIds,
    },
  }))

  const edges: OracleKnowledgeGraph['edges'] = []
  for (let leftIndex = 0; leftIndex < selectedClaims.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < selectedClaims.length; rightIndex++) {
      const leftClaim = selectedClaims[leftIndex]
      const rightClaim = selectedClaims[rightIndex]
      const leftNode = nodes[leftIndex]
      const rightNode = nodes[rightIndex]
      if (!leftNode || !rightNode) continue

      const score = overlapScore(leftClaim.text, rightClaim.text)
      if (hasOpposingTerms(leftClaim.text, rightClaim.text) && score >= 0.12) {
        edges.push({
          source: leftNode.id,
          target: rightNode.id,
          type: 'contradicts',
          strength: clamp(score + 0.25),
        })
        continue
      }

      if (leftClaim.dependencies.some((dependency) => dependency === rightClaim.id)) {
        edges.push({
          source: leftNode.id,
          target: rightNode.id,
          type: 'depends_on',
          strength: 0.7,
        })
        continue
      }

      if (rightClaim.dependencies.some((dependency) => dependency === leftClaim.id)) {
        edges.push({
          source: rightNode.id,
          target: leftNode.id,
          type: 'depends_on',
          strength: 0.7,
        })
        continue
      }

      if (score >= 0.2 || leftClaim.evidenceIds.some((id) => rightClaim.evidenceIds.includes(id))) {
        edges.push({
          source: leftNode.id,
          target: rightNode.id,
          type: 'supports',
          strength: clamp(
            score +
              (leftClaim.evidenceIds.some((id) => rightClaim.evidenceIds.includes(id)) ? 0.2 : 0)
          ),
        })
      }
    }
  }

  return {
    nodes,
    edges,
    loops: [],
  }
}

export function buildStartupSeedSummary(
  sourceCount: number,
  claimCount: number,
  graphNodeCount: number,
  graphEdgeCount: number,
  evidenceLinkedCount: number
): StartupSeedSummary {
  return {
    sourceCount,
    claimCount,
    graphNodeCount,
    graphEdgeCount,
    evidenceLinkedCount,
  }
}
