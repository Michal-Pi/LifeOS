/**
 * ClaimDetailPanel Component
 *
 * Slide-in panel showing detailed information about a selected claim node:
 * - Claim text, confidence, evidence type
 * - Source context with exact quote and URL
 * - Connected claims (supports/contradicts)
 * - Referenced concepts
 */

import '@/styles/components/ClaimDetailPanel.css'
import type { ExtractedClaim, SourceRecord } from '@lifeos/agents'

interface ClaimDetailPanelProps {
  claim: ExtractedClaim | null
  source: SourceRecord | null
  relatedClaims: ExtractedClaim[]
  addedAtStep?: { stepIndex: number; phase: string } | null
  onClose: () => void
  onClaimClick?: (claim: ExtractedClaim) => void
  onHighlightConcept?: (concept: string) => void
}

export function ClaimDetailPanel({
  claim,
  source,
  relatedClaims,
  addedAtStep,
  onClose,
  onClaimClick,
  onHighlightConcept,
}: ClaimDetailPanelProps) {
  if (!claim) return null

  const confidencePercent = Math.round(claim.confidence * 100)
  const confidenceClass =
    claim.confidence >= 0.8 ? 'high' : claim.confidence >= 0.5 ? 'medium' : 'low'

  return (
    <div className="claim-detail-panel">
      <div className="claim-detail-header">
        <button className="claim-detail-back" onClick={onClose}>
          &larr; Back
        </button>
        <span className="claim-detail-title">Claim Detail</span>
      </div>

      <div className="claim-detail-body">
        {/* Claim Text */}
        <div className="claim-detail-text">{claim.claimText}</div>

        {/* Metadata Row */}
        <div className="claim-detail-meta">
          <div className="claim-confidence">
            <span className="claim-confidence-label">Confidence:</span>
            <div className="claim-confidence-bar">
              <div
                className={`claim-confidence-fill confidence-${confidenceClass}`}
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className="claim-confidence-value">{claim.confidence.toFixed(2)}</span>
          </div>
          <span className={`claim-evidence-badge evidence-${claim.evidenceType}`}>
            {claim.evidenceType.replace('_', ' ')}
          </span>
          {addedAtStep && (
            <span className="claim-step-badge">
              Step {addedAtStep.stepIndex + 1} ({addedAtStep.phase.replace(/_/g, ' ')})
            </span>
          )}
        </div>

        {/* Source Context */}
        {source && (
          <div className="claim-detail-section">
            <h4>Source</h4>
            {claim.sourceQuote && (
              <blockquote className="claim-source-quote">
                &ldquo;{claim.sourceQuote}&rdquo;
              </blockquote>
            )}
            <div className="claim-source-info">
              <span className="claim-source-title">{source.title}</span>
              <a
                className="claim-source-url"
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {source.domain}
              </a>
              <span className={`claim-source-type-badge type-${source.sourceType}`}>
                {source.sourceType}
              </span>
              {source.scholarMetadata && (
                <div className="claim-scholar-meta">
                  {source.scholarMetadata.authors && (
                    <span>{source.scholarMetadata.authors.join(', ')}</span>
                  )}
                  {source.scholarMetadata.year && <span>({source.scholarMetadata.year})</span>}
                  {source.scholarMetadata.citations !== undefined && (
                    <span>Cited {source.scholarMetadata.citations}x</span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Connected Claims */}
        {relatedClaims.length > 0 && (
          <div className="claim-detail-section">
            <h4>Connected Claims</h4>
            <div className="claim-related-list">
              {relatedClaims.map((rc, idx) => {
                // Determine relationship type
                const sameSource = rc.sourceId === claim.sourceId
                const sharedConcepts = rc.concepts.some((c) => claim.concepts.includes(c))
                const relLabel = sameSource
                  ? 'same source'
                  : sharedConcepts
                    ? 'shared concept'
                    : 'related'

                return (
                  <button
                    key={idx}
                    className="claim-related-item"
                    onClick={() => onClaimClick?.(rc)}
                  >
                    <span className="claim-related-label">{relLabel} &rarr;</span>
                    <span className="claim-related-text">
                      {rc.claimText.substring(0, 120)}
                      {rc.claimText.length > 120 ? '...' : ''}
                    </span>
                    <span className="claim-related-confidence">{rc.confidence.toFixed(2)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Concepts */}
        {claim.concepts.length > 0 && (
          <div className="claim-detail-section">
            <h4>Concepts</h4>
            <div className="claim-concept-tags">
              {claim.concepts.map((concept, idx) => (
                <button
                  key={idx}
                  className="claim-concept-tag"
                  onClick={() => onHighlightConcept?.(concept)}
                >
                  {concept}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
