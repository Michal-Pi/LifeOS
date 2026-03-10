import type { Dispatch, SetStateAction } from 'react'
import type { EvalResult, Run } from '@lifeos/agents'
import { WorkflowDetailPanel } from '@/components/evaluation/WorkflowDetailPanel'

function formatScore(value?: number | null) {
  if (typeof value !== 'number') return 'n/a'
  return value.toFixed(2)
}

function formatUsd(value?: number) {
  return typeof value === 'number' ? `$${value.toFixed(value < 1 ? 3 : 2)}` : 'n/a'
}

interface CompareFacetRow {
  key: string
  label: string
  left: string
  right: string
}

interface CompareFacetProfile {
  key: string
  label: string
  leftScore: number | null
  rightScore: number | null
}

interface BenchmarkCompareSectionProps {
  leftRun: Run | null
  rightRun: Run | null
  leftResult: EvalResult | null
  rightResult: EvalResult | null
  leftSharedScore: number | null
  rightSharedScore: number | null
  canDirectlyCompare: boolean
  compareFacetRows: CompareFacetRow[]
  compareFacetProfiles: CompareFacetProfile[]
  compareWarnings: string[]
  leftHints: Array<{ title: string; detail: string }>
  rightHints: Array<{ title: string; detail: string }>
  expandedSide: 'left' | 'right' | null
  setExpandedSide: Dispatch<SetStateAction<'left' | 'right' | null>>
  reviewDraft: string
  setReviewDraft: Dispatch<SetStateAction<string>>
  existingReviewUpdatedAt?: number | null
  submitting: boolean
  onSaveReviewNote: () => void | Promise<void>
}

export function BenchmarkCompareSection({
  leftRun,
  rightRun,
  leftResult,
  rightResult,
  leftSharedScore,
  rightSharedScore,
  canDirectlyCompare,
  compareFacetRows,
  compareFacetProfiles,
  compareWarnings,
  leftHints,
  rightHints,
  expandedSide,
  setExpandedSide,
  reviewDraft,
  setReviewDraft,
  existingReviewUpdatedAt,
  submitting,
  onSaveReviewNote,
}: BenchmarkCompareSectionProps) {
  return (
    <section className="eval-card">
      <div className="eval-section-heading">
        <h3>Compare Runs</h3>
        <p>Review heterogeneous workflow outputs side by side.</p>
      </div>

      <div className="eval-compare-grid">
        {[leftRun, rightRun].map((run, index) => {
          const result = index === 0 ? leftResult : rightResult
          const shared = index === 0 ? leftSharedScore : rightSharedScore
          return (
            <article key={run?.runId ?? index} className="eval-compare-card">
              <div className="eval-workflow-card__header">
                <h4>{run?.workflowType ?? 'No run selected'}</h4>
                <span>{run?.status ?? 'n/a'}</span>
              </div>
              <p>{run?.goal ?? 'Choose a run to compare.'}</p>
              <dl className="eval-metric-list">
                <div>
                  <dt>Native score</dt>
                  <dd>{formatScore(result?.aggregateScore ?? null)}</dd>
                </div>
                <div>
                  <dt>Shared score</dt>
                  <dd>{formatScore(shared)}</dd>
                </div>
                <div>
                  <dt>Cost</dt>
                  <dd>{formatUsd(run?.estimatedCost)}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>
                    {run?.completedAtMs && run.startedAtMs
                      ? `${Math.round((run.completedAtMs - run.startedAtMs) / 1000)}s`
                      : 'n/a'}
                  </dd>
                </div>
                <div>
                  <dt>Eval mode</dt>
                  <dd>{result?.evaluationMode ?? 'single_judge'}</dd>
                </div>
                <div>
                  <dt>Judge count</dt>
                  <dd>{result?.individualJudgeResults?.length ?? 1}</dd>
                </div>
              </dl>
              {typeof result?.scoreVariance === 'number' || result?.requiresHumanReview ? (
                <div className="eval-badge-row">
                  {typeof result?.scoreVariance === 'number' ? (
                    <span className="eval-pill neutral">
                      variance {formatScore(result.scoreVariance)}
                    </span>
                  ) : null}
                  {result?.requiresHumanReview ? (
                    <span className="eval-pill warning">human review required</span>
                  ) : null}
                  {result?.councilSynthesis ? (
                    <span className="eval-pill neutral">council synthesis</span>
                  ) : null}
                </div>
              ) : null}
              <pre className="eval-output-preview">
                {run?.output?.slice(0, 1400) || 'No final output.'}
              </pre>
            </article>
          )
        })}
      </div>

      <div className={`eval-compare-status ${canDirectlyCompare ? 'ok' : 'warning'}`}>
        {canDirectlyCompare
          ? 'Direct quality comparison is valid: both runs share the same rubric and workflow type.'
          : 'Direct quality comparison is not fully aligned. Prefer shared cohort scores or manual review notes for cross-workflow comparisons.'}
      </div>
      {compareFacetRows.length > 0 ? (
        <section className="eval-card">
          <div className="eval-section-heading">
            <h3>Shared Benchmark Facets</h3>
            <p>Generic structural signals for any workflow pair.</p>
          </div>
          <div className="eval-facet-compare-list">
            {compareFacetRows.map((row) => (
              <div key={row.key} className="eval-facet-compare-row">
                <span className="eval-facet-compare-row__value">{row.left}</span>
                <span className="eval-facet-compare-row__label">{row.label}</span>
                <span className="eval-facet-compare-row__value">{row.right}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {compareFacetProfiles.length > 0 ? (
        <section className="eval-card">
          <div className="eval-section-heading">
            <h3>Normalized Structural Profile</h3>
            <p>Relative comparison of shared signals across this run pair.</p>
          </div>
          <div className="eval-card-grid">
            {compareFacetProfiles.map((profile) => (
              <article key={profile.key} className="eval-stat-card">
                <span className="eval-stat-label">{profile.label}</span>
                <strong>
                  {formatScore(profile.leftScore)} / {formatScore(profile.rightScore)}
                </strong>
                <span className="eval-shell__small">left / right</span>
              </article>
            ))}
          </div>
          {compareWarnings.length > 0 ? (
            <div className="eval-warning-list">
              {compareWarnings.map((warning) => (
                <div key={warning} className="eval-inline-warning">
                  {warning}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
      <div className="eval-badge-row">
        <button
          type="button"
          className={`eval-subtab ${expandedSide === 'left' ? 'active' : ''}`}
          onClick={() => setExpandedSide((value) => (value === 'left' ? null : 'left'))}
        >
          {expandedSide === 'left' ? 'Hide left detail' : 'Show left detail'}
        </button>
        <button
          type="button"
          className={`eval-subtab ${expandedSide === 'right' ? 'active' : ''}`}
          onClick={() => setExpandedSide((value) => (value === 'right' ? null : 'right'))}
        >
          {expandedSide === 'right' ? 'Hide right detail' : 'Show right detail'}
        </button>
      </div>
      {expandedSide === 'left' && leftRun ? (
        <WorkflowDetailPanel run={leftRun} compact result={leftResult ?? null} />
      ) : null}
      {expandedSide === 'right' && rightRun ? (
        <WorkflowDetailPanel run={rightRun} compact result={rightResult ?? null} />
      ) : null}
      <div className="eval-split-grid">
        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>{leftRun?.workflowType ?? 'Left'} review hints</h3>
          </div>
          <div className="eval-list">
            {leftHints.map((hint) => (
              <div key={hint.title} className="eval-list-item">
                <div>
                  <strong>{hint.title}</strong>
                  <p>{hint.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
        <article className="eval-card">
          <div className="eval-section-heading">
            <h3>{rightRun?.workflowType ?? 'Right'} review hints</h3>
          </div>
          <div className="eval-list">
            {rightHints.map((hint) => (
              <div key={hint.title} className="eval-list-item">
                <div>
                  <strong>{hint.title}</strong>
                  <p>{hint.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>
      <section className="eval-card">
        <div className="eval-section-heading">
          <h3>Manual Review Notes</h3>
          <p>Persist reviewer notes for this run pair and cohort context.</p>
        </div>
        <textarea
          className="eval-textarea"
          rows={6}
          value={reviewDraft}
          onChange={(event) => setReviewDraft(event.target.value)}
          placeholder="Record qualitative differences, caveats, contradictions, and preferred workflow for this use-case."
        />
        <div className="eval-form-actions">
          <button
            type="button"
            className="eval-refresh-button"
            onClick={() => void onSaveReviewNote()}
            disabled={!leftRun || submitting}
          >
            {submitting
              ? 'Saving...'
              : existingReviewUpdatedAt
                ? 'Update Review Note'
                : 'Save Review Note'}
          </button>
          {existingReviewUpdatedAt ? (
            <span className="eval-stat-label">
              Last updated {new Date(existingReviewUpdatedAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      </section>
    </section>
  )
}
