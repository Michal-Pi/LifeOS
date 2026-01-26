import { useEffect, useState } from 'react'
import type { ExpertCouncilTurn } from '@lifeos/agents'
import { ProgressIndicator } from './ProgressIndicator'
import { ConsensusGauge } from './ConsensusGauge'

interface ExpertCouncilInspectorProps {
  turn: ExpertCouncilTurn
}

type StageTab = 1 | 2 | 3

export function ExpertCouncilInspector({ turn }: ExpertCouncilInspectorProps) {
  const [activeStage, setActiveStage] = useState<StageTab>(1)
  const [activeStage1Index, setActiveStage1Index] = useState(0)
  const [activeStage2Index, setActiveStage2Index] = useState(0)
  const [revealModels, setRevealModels] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('expertCouncilRevealModels') === 'true'
  })

  useEffect(() => {
    window.localStorage.setItem('expertCouncilRevealModels', String(revealModels))
  }, [revealModels])

  const stage1Responses = turn.stage1.responses
  const stage2Reviews = turn.stage2?.reviews ?? []
  const stage2Aggregate = turn.stage2?.aggregateRanking ?? []
  const rankingCompleteness = turn.stage2?.consensusMetrics?.rankingCompleteness ?? 100
  const excludedResponses = turn.stage2?.consensusMetrics?.excludedResponses ?? []
  const stage1Complete =
    stage1Responses.length > 0 &&
    stage1Responses.every((response) => response.status === 'completed' || response.status === 'failed')
  const isExecuting =
    turn.executionMode === 'single' ? !stage1Complete : !turn.stage3?.finalResponse

  return (
    <div>
      {isExecuting && <ProgressIndicator turn={turn} />}
      <div className="section-tabs">
        <button
          type="button"
          className={`section-tab ${activeStage === 1 ? 'active' : ''}`}
          onClick={() => setActiveStage(1)}
        >
          Stage 1
        </button>
        <button
          type="button"
          className={`section-tab ${activeStage === 2 ? 'active' : ''}`}
          onClick={() => setActiveStage(2)}
        >
          Stage 2
        </button>
        <button
          type="button"
          className={`section-tab ${activeStage === 3 ? 'active' : ''}`}
          onClick={() => setActiveStage(3)}
        >
          Stage 3
        </button>
        {turn.cacheHit && <span className="badge">Cached</span>}
      </div>

      {activeStage === 1 && (
        <div className="form-section">
          <div className="section-label">First Opinions</div>
          <div className="inspector-row">
            <button type="button" onClick={() => setRevealModels((prev) => !prev)}>
              {revealModels ? 'Hide models' : 'Reveal models'}
            </button>
          </div>
          {stage1Responses.length === 0 ? (
            <div className="empty-state">
              <p>No council responses available.</p>
            </div>
          ) : (
            <>
              <div className="section-tabs">
                {stage1Responses.map((response, index) => (
                  <button
                    key={response.modelId}
                    type="button"
                    className={`section-tab ${activeStage1Index === index ? 'active' : ''}`}
                    onClick={() => setActiveStage1Index(index)}
                  >
                    {revealModels
                      ? response.modelName
                      : `Response ${String.fromCharCode(65 + index)}`}
                  </button>
                ))}
              </div>
              <div className="form-section">
                <div className="section-label">Response</div>
                {revealModels && (
                  <div>
                    <strong>Model:</strong> {stage1Responses[activeStage1Index].modelName} (
                    {stage1Responses[activeStage1Index].provider})
                  </div>
                )}
                <div>
                  <strong>Status:</strong> {stage1Responses[activeStage1Index].status}
                </div>
                <div>
                  <strong>Latency:</strong> {stage1Responses[activeStage1Index].latency} ms
                </div>
                <div>
                  <strong>Tokens:</strong> {stage1Responses[activeStage1Index].tokensUsed ?? 'n/a'}
                </div>
                <div>
                  <strong>Cost:</strong> {stage1Responses[activeStage1Index].estimatedCost ?? 'n/a'}
                </div>
                <div>
                  <strong>Response:</strong>
                  <div>{stage1Responses[activeStage1Index].answerText}</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {activeStage === 2 && (
        <div className="form-section">
          <div className="section-label">Reviews & Rankings</div>
          <div className="inspector-row">
            <button type="button" onClick={() => setRevealModels((prev) => !prev)}>
              {revealModels ? 'Hide models' : 'Reveal models'}
            </button>
          </div>
          {stage2Reviews.length === 0 ? (
            <div className="empty-state">
              <p>No peer reviews available for this run.</p>
            </div>
          ) : (
            <>
              <div className="section-tabs">
                {stage2Reviews.map((review, index) => (
                  <button
                    key={review.judgeModelId}
                    type="button"
                    className={`section-tab ${activeStage2Index === index ? 'active' : ''}`}
                    onClick={() => setActiveStage2Index(index)}
                  >
                    Judge {index + 1}
                  </button>
                ))}
              </div>
              <div className="form-section">
                <div className="section-label">Critiques</div>
                {Object.entries(stage2Reviews[activeStage2Index].critiques).map(
                  ([label, critique]) => (
                    <div key={label}>
                      <strong>{label}:</strong> {critique}
                    </div>
                  )
                )}
                <div>
                  <strong>Ranking:</strong> {stage2Reviews[activeStage2Index].ranking.join(', ')}
                </div>
                {stage2Reviews[activeStage2Index].confidenceScore !== undefined && (
                  <div>
                    <strong>Confidence:</strong> {stage2Reviews[activeStage2Index].confidenceScore}
                  </div>
                )}
              </div>
            </>
          )}

          {stage2Aggregate.length > 0 && (
            <div className="form-section">
              <div className="section-label">Aggregate Leaderboard</div>
              <ConsensusGauge turn={turn} />
              {rankingCompleteness < 100 && (
                <div className="run-error">
                  <strong>Warning:</strong>
                  <p>
                    Warning: Only {rankingCompleteness.toFixed(0)}% of responses were included in
                    ranking due to inconsistent judge outputs.
                  </p>
                  {excludedResponses.length > 0 && (
                    <div>
                      {excludedResponses.map((label) => (
                        <p key={label}>Response {label} was not ranked by all judges.</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <table className="table">
                <thead>
                  <tr>
                    <th>Label</th>
                    {revealModels && <th>Model</th>}
                    <th>Avg Rank</th>
                    <th>Borda</th>
                  </tr>
                </thead>
                <tbody>
                  {stage2Aggregate.map((entry) => (
                    <tr key={entry.label}>
                      <td>{entry.label}</td>
                      {revealModels && <td>{entry.modelId}</td>}
                      <td>{entry.averageRank.toFixed(2)}</td>
                      <td>{entry.bordaScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div>
                <strong>Consensus Score:</strong> {turn.stage2.consensusMetrics.consensusScore} (
                {rankingCompleteness.toFixed(0)}% completeness)
              </div>
            </div>
          )}
        </div>
      )}

      {activeStage === 3 && (
        <div className="form-section">
          <div className="section-label">Final Synthesis</div>
          <div>
            <strong>Chairman:</strong> {turn.stage3.chairmanModelId}
          </div>
          <div>
            <strong>Tokens:</strong> {turn.stage3.tokensUsed ?? 'n/a'}
          </div>
          <div>
            <strong>Cost:</strong> {turn.stage3.estimatedCost ?? 'n/a'}
          </div>
          <div>
            <strong>Final response:</strong>
            <div>{turn.stage3.finalResponse}</div>
          </div>
          {turn.qualityScore !== undefined && (
            <div>
              <strong>Quality Score:</strong> {turn.qualityScore}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
