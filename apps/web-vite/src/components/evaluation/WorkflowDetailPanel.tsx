import type { EvalResult, Run } from '@lifeos/agents'
import type { RunEvent } from '@/hooks/useRunEvents'
import { useWorkflowEvalAdapter } from '@/hooks/useWorkflowEvalAdapter'

interface WorkflowDetailPanelProps {
  run: Run | null
  events?: RunEvent[]
  compact?: boolean
  result?: EvalResult | null
}

function formatScore(value?: number | null) {
  if (typeof value !== 'number') return 'n/a'
  return value.toFixed(2)
}

export function WorkflowDetailPanel({
  run,
  events,
  compact = false,
  result = null,
}: WorkflowDetailPanelProps) {
  const { adapter } = useWorkflowEvalAdapter(run ?? null, run?.workflowState ?? null)
  if (!run) return <div className="eval-empty">Select a run to inspect workflow details.</div>
  const detailSections = adapter.buildDetailSections({
    run,
    workflowState: run.workflowState ?? null,
    result,
    eventCount: events?.length ?? 0,
  })

  return (
    <section className={`eval-card ${compact ? 'eval-card--compact' : ''}`}>
      <div className="eval-section-heading">
        <h3>Workflow Detail</h3>
        <p>{run.workflowType}</p>
      </div>

      {detailSections.length === 0 ? (
        <div className="eval-empty">No workflow detail available for this run.</div>
      ) : (
        <div className="eval-detail-stack">
          {detailSections.map((section) => (
            <div key={section.title} className="eval-detail-callout">
              <strong>{section.title}</strong>
              <div className="eval-detail-facet-grid">
                {section.items.map((item) => (
                  <div key={`${section.title}-${item.label}`} className="eval-detail-facet">
                    <span className="eval-stat-label">{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {result ? (
            <div className="eval-detail-callout">
              <strong>Evaluation Review</strong>
              <div className="eval-detail-facet-grid">
                <div className="eval-detail-facet">
                  <span className="eval-stat-label">mode</span>
                  <strong>{result.evaluationMode ?? 'single_judge'}</strong>
                </div>
                <div className="eval-detail-facet">
                  <span className="eval-stat-label">aggregate</span>
                  <strong>{formatScore(result.aggregateScore)}</strong>
                </div>
                <div className="eval-detail-facet">
                  <span className="eval-stat-label">judge count</span>
                  <strong>{result.individualJudgeResults?.length ?? 1}</strong>
                </div>
                <div className="eval-detail-facet">
                  <span className="eval-stat-label">variance</span>
                  <strong>{formatScore(result.scoreVariance)}</strong>
                </div>
                <div className="eval-detail-facet">
                  <span className="eval-stat-label">human review</span>
                  <strong>{result.requiresHumanReview ? 'required' : 'not flagged'}</strong>
                </div>
                <div className="eval-detail-facet">
                  <span className="eval-stat-label">resolved by</span>
                  <strong>
                    {result.judgeProvider} / {result.judgeModel}
                  </strong>
                </div>
              </div>

              {result.councilSynthesis ? (
                <div className="eval-judge-summary">
                  <div className="eval-judge-summary__header">
                    <span className="eval-stat-label">Council synthesis</span>
                    <strong>
                      {result.councilSynthesis.reconciledByProvider &&
                      result.councilSynthesis.reconciledByModel
                        ? `${result.councilSynthesis.reconciledByProvider} / ${result.councilSynthesis.reconciledByModel}`
                        : 'summary only'}
                    </strong>
                  </div>
                  <p>{result.councilSynthesis.summary}</p>
                  {result.councilSynthesis.dissentNotes?.length ? (
                    <ul className="eval-note-list">
                      {result.councilSynthesis.dissentNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              {result.individualJudgeResults?.length ? (
                <div className="eval-judge-grid">
                  {result.individualJudgeResults.map((judge) => (
                    <article key={judge.judgeId} className="eval-judge-card">
                      <div className="eval-judge-card__header">
                        <strong>{judge.role ?? judge.judgeId}</strong>
                        <span>{formatScore(judge.aggregateScore)}</span>
                      </div>
                      <p className="eval-shell__small">
                        {judge.judgeProvider} / {judge.judgeModel}
                      </p>
                      <div className="eval-judge-criteria">
                        {Object.entries(judge.normalizedScores).map(([criterion, value]) => (
                          <div
                            key={`${judge.judgeId}-${criterion}`}
                            className="eval-judge-criteria__row"
                          >
                            <span className="eval-stat-label">{criterion}</span>
                            <strong>{formatScore(value)}</strong>
                          </div>
                        ))}
                      </div>
                      {judge.reasoning ? (
                        <p className="eval-judge-reasoning">{judge.reasoning}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
