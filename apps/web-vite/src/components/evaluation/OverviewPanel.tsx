import type {
  BenchmarkCohort,
  CapabilitySuite,
  DriftAlert,
  EvalResult,
  Experiment,
  PromptVariant,
} from '@lifeos/agents'
import type { AgentPerformanceSummary } from '@/components/evaluation/agentEvalPolicy'
import type { EvaluationAttentionItem, WorkflowDashboardCard } from '@/hooks/useEvaluationDashboard'

interface OverviewPanelProps {
  global: {
    completedRuns: number
    activeRuns: number
    averageJudgedQuality: number | null
    successRate: number
    averageCost: number
    activeDriftAlerts: number
    requiresHumanReview: number
    highDisagreementResults: number
    holdoutCases: number
    hardCases: number
    activeCapabilitySuites: number
    capabilityFamilyCoverage: number
    trackedAgents: number
  }
  workflowCards: WorkflowDashboardCard[]
  agentCards: AgentPerformanceSummary[]
  recentResults: EvalResult[]
  driftAlerts: DriftAlert[]
  experiments: Experiment[]
  promptVariants: PromptVariant[]
  benchmarkCohorts: BenchmarkCohort[]
  capabilitySuites: CapabilitySuite[]
  capabilityFamilyCoverage: Array<[string, number]>
  attentionItems: EvaluationAttentionItem[]
}

function formatPercent(value: number | null): string {
  if (value === null) return 'n/a'
  return `${Math.round(value * 100)}%`
}

function formatScore(value: number | null): string {
  if (value === null) return 'n/a'
  return value.toFixed(2)
}

function formatUsd(value: number): string {
  return `$${value.toFixed(value < 1 ? 3 : 2)}`
}

export function OverviewPanel({
  global,
  workflowCards,
  agentCards,
  recentResults,
  driftAlerts,
  experiments,
  promptVariants,
  benchmarkCohorts,
  capabilitySuites,
  capabilityFamilyCoverage,
  attentionItems,
}: OverviewPanelProps) {
  return (
    <div className="eval-panel">
      <section className="eval-card-grid">
        <article className="eval-stat-card">
          <span className="eval-stat-label">Completed Runs</span>
          <strong>{global.completedRuns}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Active Runs</span>
          <strong>{global.activeRuns}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Avg Judged Quality</span>
          <strong>{formatScore(global.averageJudgedQuality)}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Success Rate</span>
          <strong>{formatPercent(global.successRate)}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Avg Cost</span>
          <strong>{formatUsd(global.averageCost)}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Active Drift Alerts</span>
          <strong>{global.activeDriftAlerts}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Human Review Queue</span>
          <strong>{global.requiresHumanReview}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">High Disagreement</span>
          <strong>{global.highDisagreementResults}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Holdout Cases</span>
          <strong>{global.holdoutCases}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Hard / Frontier Cases</span>
          <strong>{global.hardCases}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Capability Suites</span>
          <strong>{global.activeCapabilitySuites}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Capability Families Covered</span>
          <strong>{global.capabilityFamilyCoverage}</strong>
        </article>
        <article className="eval-stat-card">
          <span className="eval-stat-label">Tracked Agents</span>
          <strong>{global.trackedAgents}</strong>
        </article>
      </section>

      <section className="eval-section">
        <div className="eval-section-heading">
          <h3>Workflow Health</h3>
          <p>Quality and throughput by workflow type.</p>
        </div>
        <div className="eval-workflow-grid">
          {workflowCards.length === 0 ? (
            <div className="eval-empty">No workflow runs yet.</div>
          ) : (
            workflowCards.map((summary) => (
              <article key={summary.workflowType} className="eval-workflow-card">
                <div className="eval-workflow-card__header">
                  <h4>{summary.workflowType}</h4>
                  <span>{summary.runCount} runs</span>
                </div>
                <dl className="eval-metric-list">
                  <div>
                    <dt>Active</dt>
                    <dd>{summary.activeRuns}</dd>
                  </div>
                  <div>
                    <dt>Success</dt>
                    <dd>{formatPercent(summary.successRate)}</dd>
                  </div>
                  <div>
                    <dt>Avg Cost</dt>
                    <dd>{formatUsd(summary.averageCost)}</dd>
                  </div>
                  <div>
                    <dt>Avg Score</dt>
                    <dd>{formatScore(summary.averageScore)}</dd>
                  </div>
                  <div>
                    <dt>Variance</dt>
                    <dd>{formatScore(summary.averageVariance)}</dd>
                  </div>
                  <div>
                    <dt>Human Review</dt>
                    <dd>{formatPercent(summary.humanReviewRate)}</dd>
                  </div>
                  <div>
                    <dt>Holdout Cases</dt>
                    <dd>{summary.holdoutRunCount}</dd>
                  </div>
                </dl>
                {summary.capabilityFamilies.length > 0 ? (
                  <p className="eval-shell__small">
                    capability families: {summary.capabilityFamilies.join(', ')}
                  </p>
                ) : null}
                <div className="eval-workflow-highlights">
                  {summary.metrics.map((metric) => (
                    <span
                      key={`${summary.workflowType}-${metric.label}`}
                      className="eval-pill neutral"
                    >
                      {metric.label}: {metric.value}
                    </span>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="eval-split-grid">
        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Recent Eval Results</h3>
            <p>Most recent judged outputs.</p>
          </div>
          {recentResults.length === 0 ? (
            <div className="eval-empty">No evaluation results found.</div>
          ) : (
            <div className="eval-list">
              {recentResults.map((result) => (
                <div key={result.evalResultId} className="eval-list-item">
                  <div>
                    <strong>{result.runId.slice(0, 8)}</strong>
                    <p>
                      {result.judgeModel} · {result.evaluationMode ?? 'single_judge'}
                      {typeof result.scoreVariance === 'number'
                        ? ` · variance ${formatScore(result.scoreVariance)}`
                        : ''}
                    </p>
                  </div>
                  <div className="eval-inline-actions">
                    <span>{formatScore(result.aggregateScore)}</span>
                    {result.requiresHumanReview ? (
                      <span className="eval-pill warning">human review</span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Needs Attention</h3>
            <p>Signals from drift, experiments, and runs.</p>
          </div>
          <div className="eval-list">
            {attentionItems.map((item) => (
              <div key={item.id} className="eval-list-item">
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <span className={`eval-pill ${item.severity}`}>{item.workflowType}</span>
              </div>
            ))}
            {attentionItems.length === 0 && (
              <div className="eval-empty">No urgent issues detected yet.</div>
            )}
          </div>
        </article>
      </section>

      <section className="eval-split-grid">
        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Agent Drift & Performance</h3>
            <p>Step-level signals grouped by agent across workflows and experiments.</p>
          </div>
          {agentCards.length === 0 ? (
            <div className="eval-empty">No agent step evals recorded yet.</div>
          ) : (
            <div className="eval-list">
              {agentCards.map((agent) => (
                <div key={agent.agentId} className="eval-list-item">
                  <div>
                    <strong>{agent.agentName}</strong>
                    <p>
                      {agent.observations} observations · judged {agent.judgedObservations} ·
                      unjudged {agent.unjudgedObservations} · workflows{' '}
                      {agent.workflows.join(', ') || 'n/a'}
                    </p>
                    <p>
                      effective {formatScore(agent.avgEffectiveScore)} · judged{' '}
                      {formatScore(agent.avgJudgedScore)} · auto{' '}
                      {formatScore(agent.avgAutomaticScore)} · manual{' '}
                      {formatScore(agent.avgManualScore)} · review {formatPercent(agent.reviewRate)}
                    </p>
                  </div>
                  <div className="eval-inline-actions">
                    {typeof agent.recentScoreDelta === 'number' ? (
                      <span
                        className={`eval-pill ${agent.recentScoreDelta < -0.12 ? 'warning' : 'neutral'}`}
                      >
                        delta {agent.recentScoreDelta.toFixed(2)}
                      </span>
                    ) : null}
                    {agent.activeExperiments > 0 ? (
                      <span className="eval-pill active">
                        {agent.activeExperiments} experiments
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Drift Alerts</h3>
            <p>Active and recent metric changes.</p>
          </div>
          {driftAlerts.length === 0 ? (
            <div className="eval-empty">No drift alerts.</div>
          ) : (
            <div className="eval-list">
              {driftAlerts.map((alert) => (
                <div key={alert.alertId} className="eval-list-item">
                  <div>
                    <strong>{alert.workflowType}</strong>
                    <p>
                      {alert.metric} {alert.direction} {Math.abs(alert.percentChange).toFixed(1)}%
                    </p>
                  </div>
                  <span className={`eval-pill ${alert.severity}`}>{alert.status}</span>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Experiments, Benchmarks & Capabilities</h3>
            <p>
              Active experiment surfaces plus shared comparison spaces and reasoning-family
              coverage.
            </p>
          </div>
          <div className="eval-list">
            {experiments.map((experiment) => (
              <div key={experiment.experimentId} className="eval-list-item">
                <div>
                  <strong>{experiment.name}</strong>
                  <p>
                    {experiment.workflowType}
                    {experiment.agentId ? ` · ${experiment.agentId}` : ''} · {experiment.status}
                  </p>
                </div>
                <span
                  className={`eval-pill ${experiment.status === 'running' ? 'active' : 'neutral'}`}
                >
                  {experiment.variantIds.length} variants
                </span>
              </div>
            ))}
            {promptVariants.slice(0, 4).map((variant) => (
              <div key={variant.variantId} className="eval-list-item">
                <div>
                  <strong>{variant.name}</strong>
                  <p>
                    {variant.agentId} · avg {variant.avgScore.toFixed(2)} · {variant.sampleCount}{' '}
                    samples
                  </p>
                </div>
                <span className={`eval-pill ${variant.status === 'winner' ? 'active' : 'neutral'}`}>
                  {variant.status}
                </span>
              </div>
            ))}
            {benchmarkCohorts.map((cohort) => (
              <div key={cohort.cohortId} className="eval-list-item">
                <div>
                  <strong>{cohort.name}</strong>
                  <p>
                    {cohort.workflowTypes.join(', ')} ·{' '}
                    {cohort.evaluationMode?.mode ?? 'single_judge'}
                  </p>
                </div>
                <span className={`eval-pill ${cohort.isActive ? 'active' : 'archived'}`}>
                  {cohort.comparisonMode}
                </span>
              </div>
            ))}
            {capabilitySuites.map((suite) => (
              <div key={suite.suiteId} className="eval-list-item">
                <div>
                  <strong>{suite.name}</strong>
                  <p>
                    {suite.taskFamilies.join(', ')} · {suite.testCaseIds.length} test cases
                  </p>
                </div>
                <span className={`eval-pill ${suite.isActive ? 'active' : 'archived'}`}>
                  capability
                </span>
              </div>
            ))}
            {benchmarkCohorts.length === 0 && capabilitySuites.length === 0 ? (
              <div className="eval-empty">No benchmark cohorts or capability suites defined.</div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="eval-split-grid">
        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>Capability Family Coverage</h3>
            <p>Coverage of broader reasoning families in test cases.</p>
          </div>
          {capabilityFamilyCoverage.length === 0 ? (
            <div className="eval-empty">No capability-tagged test cases yet.</div>
          ) : (
            <div className="eval-list">
              {capabilityFamilyCoverage.map(([family, count]) => (
                <div key={family} className="eval-list-item">
                  <div>
                    <strong>{family}</strong>
                    <p>{count} test cases</p>
                  </div>
                  <span className="eval-pill neutral">covered</span>
                </div>
              ))}
            </div>
          )}
        </article>
      </section>
    </div>
  )
}
