/**
 * Node Detail Components
 *
 * Type-specific detail views for each node type in the knowledge graph.
 */

import type { Claim, Concept, Mechanism, Contradiction, Regime, Community } from '@lifeos/agents'
import { formatPercentage } from './utils'

// ----- Claim Details -----

interface ClaimDetailsProps {
  claim: Claim
}

export function ClaimDetails({ claim }: ClaimDetailsProps) {
  return (
    <>
      <div className="detail-section">
        <label>Text</label>
        <p className="detail-value">{claim.text}</p>
      </div>
      <div className="detail-section">
        <label>Lens</label>
        <span className={`lens-badge ${claim.sourceLens}`}>{claim.sourceLens}</span>
      </div>
      <div className="detail-section">
        <label>Status</label>
        <span className={`status-badge ${claim.status.toLowerCase()}`}>{claim.status}</span>
      </div>
      {claim.conceptIds.length > 0 && (
        <div className="detail-section">
          <label>Concepts ({claim.conceptIds.length})</label>
          <div className="tag-list">
            {claim.conceptIds.map((id) => (
              <span key={id} className="tag concept-tag">
                {id}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

// ----- Concept Details -----

interface ConceptDetailsProps {
  concept: Concept
}

export function ConceptDetails({ concept }: ConceptDetailsProps) {
  return (
    <>
      <div className="detail-section">
        <label>Definition</label>
        <p className="detail-value">{concept.definition}</p>
      </div>
      <div className="detail-section">
        <label>Type</label>
        <span className="type-badge">{concept.conceptType}</span>
      </div>
      <div className="detail-section">
        <label>Version</label>
        <span className="version-badge">v{concept.version}</span>
      </div>
      {concept.alternateNames && concept.alternateNames.length > 0 && (
        <div className="detail-section">
          <label>Alternate Names</label>
          <div className="tag-list">
            {concept.alternateNames.map((name, idx) => (
              <span key={idx} className="tag">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
      {concept.previousVersionId && (
        <div className="detail-section">
          <label>Previous Version</label>
          <code className="detail-value mono">{concept.previousVersionId}</code>
        </div>
      )}
    </>
  )
}

// ----- Mechanism Details -----

interface MechanismDetailsProps {
  mechanism: Mechanism
}

export function MechanismDetails({ mechanism }: MechanismDetailsProps) {
  return (
    <>
      <div className="detail-section">
        <label>Description</label>
        <p className="detail-value">{mechanism.description}</p>
      </div>
      <div className="detail-section">
        <label>Type</label>
        <span className="type-badge">{mechanism.mechanismType}</span>
      </div>
      <div className="detail-section">
        <label>Confidence</label>
        <span className="confidence-value">{formatPercentage(mechanism.confidence)}</span>
      </div>
      <div className="detail-section">
        <label>Participants ({mechanism.participantClaimIds.length})</label>
        <div className="participant-list">
          {Object.entries(mechanism.roles).map(([claimId, role]) => (
            <div key={claimId} className="participant-item">
              <span className={`role-badge ${role.toLowerCase()}`}>{role}</span>
              <code>{claimId}</code>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ----- Contradiction Details -----

interface ContradictionDetailsProps {
  contradiction: Contradiction
}

export function ContradictionDetails({ contradiction }: ContradictionDetailsProps) {
  return (
    <>
      <div className="detail-section">
        <label>Description</label>
        <p className="detail-value">{contradiction.description}</p>
      </div>
      <div className="detail-row">
        <div className="detail-section half">
          <label>Type</label>
          <span className="type-badge">{contradiction.type}</span>
        </div>
        <div className="detail-section half">
          <label>Severity</label>
          <span className={`severity-badge ${contradiction.severity.toLowerCase()}`}>
            {contradiction.severity}
          </span>
        </div>
      </div>
      <div className="detail-section">
        <label>Status</label>
        <span className={`status-badge ${contradiction.status.toLowerCase()}`}>
          {contradiction.status}
        </span>
      </div>
      <div className="detail-section">
        <label>Action Distance</label>
        <span className="distance-value">{contradiction.actionDistance}</span>
      </div>
      {contradiction.resolutionNote && (
        <div className="detail-section">
          <label>Resolution</label>
          <p className="detail-value resolution">{contradiction.resolutionNote}</p>
        </div>
      )}
    </>
  )
}

// ----- Regime Details -----

interface RegimeDetailsProps {
  regime: Regime
}

export function RegimeDetails({ regime }: RegimeDetailsProps) {
  return (
    <>
      <div className="detail-section">
        <label>Name</label>
        <p className="detail-value">{regime.name}</p>
      </div>
      <div className="detail-section">
        <label>Description</label>
        <p className="detail-value">{regime.description}</p>
      </div>
      <div className="detail-section">
        <label>Conditions ({regime.conditions.length})</label>
        <ul className="condition-list">
          {regime.conditions.map((condition, idx) => (
            <li key={idx}>{condition}</li>
          ))}
        </ul>
      </div>
      {regime.scopedClaimIds.length > 0 && (
        <div className="detail-section">
          <label>Scoped Claims ({regime.scopedClaimIds.length})</label>
          <div className="tag-list">
            {regime.scopedClaimIds.slice(0, 5).map((id) => (
              <span key={id} className="tag claim-tag">
                {id}
              </span>
            ))}
            {regime.scopedClaimIds.length > 5 && (
              <span className="tag more">+{regime.scopedClaimIds.length - 5}</span>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ----- Community Details -----

interface CommunityDetailsProps {
  community: Community
}

export function CommunityDetails({ community }: CommunityDetailsProps) {
  const totalMembers =
    community.conceptIds.length + community.claimIds.length + community.mechanismIds.length

  return (
    <>
      <div className="detail-section">
        <label>Summary</label>
        <p className="detail-value">{community.summary}</p>
      </div>
      <div className="detail-section">
        <label>Cohesion Score</label>
        <span className="cohesion-value">{formatPercentage(community.cohesionScore)}</span>
      </div>
      <div className="detail-section">
        <label>Clustering Method</label>
        <span className="type-badge">{community.clusteringMethod}</span>
      </div>
      <div className="detail-section">
        <label>Members ({totalMembers})</label>
        <div className="member-counts">
          <span>{community.conceptIds.length} concepts</span>
          <span>{community.claimIds.length} claims</span>
          <span>{community.mechanismIds.length} mechanisms</span>
        </div>
      </div>
    </>
  )
}
