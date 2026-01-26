import type { ExpertCouncilTurn } from '@lifeos/agents'
import { AgreementMatrix } from './AgreementMatrix'

interface ConsensusGaugeProps {
  turn: ExpertCouncilTurn
}

const getAgreementLabel = (score: number) => {
  if (score >= 80) return 'High'
  if (score >= 60) return 'Medium'
  return 'Low'
}

export function ConsensusGauge({ turn }: ConsensusGaugeProps) {
  const aggregate = turn.stage2?.aggregateRanking
  const metrics = turn.stage2?.consensusMetrics

  if (!aggregate || !metrics) return null

  const score = metrics.consensusScore ?? 0
  const tau = metrics.kendallTau ?? 0
  const completeness = metrics.rankingCompleteness ?? 100
  const agreement = getAgreementLabel(score)
  const gaugePercent = Math.min(100, Math.max(0, score))
  const angle = (gaugePercent / 100) * 180
  const x = 100 + 80 * Math.cos((Math.PI * (180 - angle)) / 180)
  const y = 100 - 80 * Math.sin((Math.PI * (180 - angle)) / 180)

  return (
    <div className="consensus-gauge">
      <div className="gauge-container">
        <svg className="gauge-svg" viewBox="0 0 200 120">
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="var(--border)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d={`M 20 100 A 80 80 0 0 1 ${x} ${y}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <circle cx="100" cy="100" r="4" fill="var(--text-primary)" />
        </svg>
        <div className="gauge-score">{Math.round(score)}</div>
        <div className="gauge-label">Consensus Score</div>
      </div>

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Kendall's Tau</div>
          <div className="metric-value">{tau.toFixed(2)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Ranking Completeness</div>
          <div className="metric-value">{completeness.toFixed(0)}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Agreement</div>
          <div className="metric-value">{agreement}</div>
        </div>
      </div>

      <AgreementMatrix rankings={aggregate} controversial={metrics.controversialResponses ?? []} />
    </div>
  )
}
