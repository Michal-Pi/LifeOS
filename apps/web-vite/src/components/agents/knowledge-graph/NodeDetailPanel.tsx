/**
 * Node Detail Panel
 *
 * Displays detailed information about a selected node in the knowledge graph.
 * Renders type-specific details based on the node type.
 */

import type { Claim, Concept, Mechanism, Contradiction, Regime, Community } from '@lifeos/agents'
import type { NodeDetailPanelProps } from './types'
import { NODE_TYPE_CONFIG } from './types'
import { formatTimestamp, capitalize } from './utils'
import {
  ClaimDetails,
  ConceptDetails,
  MechanismDetails,
  ContradictionDetails,
  RegimeDetails,
  CommunityDetails,
} from './NodeDetails'

export function NodeDetailPanel({ node, onClose, onViewLineage }: NodeDetailPanelProps) {
  const config = NODE_TYPE_CONFIG[node.type]

  return (
    <div className="node-detail">
      <header className="node-detail-header">
        <div className="node-detail-title">
          <span className="node-detail-icon" aria-hidden="true">
            {config.icon}
          </span>
          <h4>{capitalize(node.type)}</h4>
        </div>
        <button onClick={onClose} className="close-btn" aria-label="Close detail panel">
          ×
        </button>
      </header>

      <div className="node-detail-body">
        <div className="detail-section">
          <label>ID</label>
          <code className="detail-value mono">{node.id}</code>
        </div>

        <div className="detail-section">
          <label>Label</label>
          <p className="detail-value">{node.label}</p>
        </div>

        {/* Type-specific details */}
        {node.type === 'claim' && <ClaimDetails claim={node.data as Claim} />}
        {node.type === 'concept' && <ConceptDetails concept={node.data as Concept} />}
        {node.type === 'mechanism' && <MechanismDetails mechanism={node.data as Mechanism} />}
        {node.type === 'contradiction' && (
          <ContradictionDetails contradiction={node.data as Contradiction} />
        )}
        {node.type === 'regime' && <RegimeDetails regime={node.data as Regime} />}
        {node.type === 'community' && <CommunityDetails community={node.data as Community} />}

        {/* Temporal Info */}
        <div className="detail-section temporal-section">
          <label>Temporal</label>
          <div className="temporal-details">
            <div className="temporal-row">
              <span>Valid:</span>
              <span>{formatTimestamp(node.temporal.tValid)}</span>
            </div>
            {node.temporal.tInvalid && (
              <div className="temporal-row invalid">
                <span>Invalid:</span>
                <span>{formatTimestamp(node.temporal.tInvalid)}</span>
              </div>
            )}
            <div className="temporal-row">
              <span>Created:</span>
              <span>{formatTimestamp(node.temporal.tCreated)}</span>
            </div>
            {node.temporal.tExpired && (
              <div className="temporal-row expired">
                <span>Expired:</span>
                <span>{formatTimestamp(node.temporal.tExpired)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {onViewLineage && (
          <div className="detail-actions">
            <button onClick={onViewLineage} className="action-btn lineage-btn">
              View Concept Lineage
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default NodeDetailPanel
