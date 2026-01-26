import type { ExpertCouncilTurn } from '@lifeos/agents'

interface AgreementMatrixProps {
  rankings: ExpertCouncilTurn['stage2']['aggregateRanking']
  controversial: string[]
}

const buildAgreementMatrix = (rankings: AgreementMatrixProps['rankings']) => {
  return rankings.map((left) =>
    rankings.map((right) => {
      if (left.label === right.label) return 'self'
      const distance = Math.abs(left.averageRank - right.averageRank)
      return distance <= 1 ? 'agree' : 'disagree'
    })
  )
}

export function AgreementMatrix({ rankings, controversial }: AgreementMatrixProps) {
  if (rankings.length === 0) return null
  const matrix = buildAgreementMatrix(rankings)

  return (
    <div className="agreement-matrix">
      <div className="matrix-title">Model Agreement</div>
      <div
        className="matrix-grid"
        style={{ gridTemplateColumns: `repeat(${rankings.length}, 1fr)` }}
      >
        {rankings.map((row, rowIndex) =>
          rankings.map((column, colIndex) => {
            const cellKey = `${row.label}-${column.label}`
            const status = matrix[rowIndex][colIndex]
            const isControversial = status === 'self' && controversial.includes(row.label)
            const className = [
              'matrix-cell',
              status === 'agree' ? 'agree' : '',
              status === 'disagree' ? 'disagree' : '',
              isControversial ? 'controversial' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <div key={cellKey} className={className}>
                {status === 'self' ? row.label : status === 'agree' ? '✓' : '✗'}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
