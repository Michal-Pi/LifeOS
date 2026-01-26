import type { CostEstimate } from '@/services/expertCouncil/costEstimator'

interface CostEstimateCardProps {
  estimate: CostEstimate
  budget?: number
}

export function CostEstimateCard({ estimate, budget }: CostEstimateCardProps) {
  const budgetPercent = budget ? (estimate.totalCost / budget) * 100 : 0
  const budgetClass =
    budgetPercent > 90
      ? 'budget-fill danger'
      : budgetPercent > 70
        ? 'budget-fill warning'
        : 'budget-fill'

  return (
    <div className="cost-card">
      <div className="cost-header">
        <div className="cost-title">Estimated Cost</div>
        <div className="total-cost">${estimate.totalCost.toFixed(2)}</div>
      </div>

      <div className="cost-breakdown">
        <div className="cost-row">
          <span className="cost-label">Stage 1: Council Opinions</span>
          <span className="cost-value">${estimate.stages.stage1.cost.toFixed(2)}</span>
        </div>
        {estimate.stages.stage2 && (
          <div className="cost-row">
            <span className="cost-label">Stage 2: Peer Review</span>
            <span className="cost-value">${estimate.stages.stage2.cost.toFixed(2)}</span>
          </div>
        )}
        {estimate.stages.stage3 && (
          <div className="cost-row">
            <span className="cost-label">Stage 3: Synthesis</span>
            <span className="cost-value">${estimate.stages.stage3.cost.toFixed(2)}</span>
          </div>
        )}
      </div>

      {budget !== undefined && (
        <div>
          <div className="budget-header">
            <span>Budget Usage</span>
            <span>
              ${estimate.totalCost.toFixed(2)} / ${budget.toFixed(2)}
            </span>
          </div>
          <div className="budget-bar">
            <div className={budgetClass} style={{ width: `${Math.min(100, budgetPercent)}%` }} />
          </div>
          <div className="budget-label">{budgetPercent.toFixed(0)}% of budget used</div>
        </div>
      )}
    </div>
  )
}
