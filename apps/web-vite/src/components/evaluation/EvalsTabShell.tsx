import { useEffect, useMemo, useState } from 'react'
import { useEvaluationCollections } from '@/hooks/useEvaluationCollections'
import { useEvaluationDashboard } from '@/hooks/useEvaluationDashboard'
import { OverviewPanel } from '@/components/evaluation/OverviewPanel'
import { TraceInspector } from '@/components/evaluation/TraceInspector'
import { SuitesPanel } from '@/components/evaluation/SuitesPanel'
import { BenchmarksPanel } from '@/components/evaluation/BenchmarksPanel'
import { CapabilitySuitePanel } from '@/components/evaluation/CapabilitySuitePanel'
import { AgentEvalsPanel } from '@/components/evaluation/AgentEvalsPanel'
import { LiveRunsPanel } from '@/components/evaluation/LiveRunsPanel'
import { useEvaluationWorkspaceState } from '@/hooks/useEvaluationWorkspaceState'
import './evaluationWorkspace.css'

type EvalSubview =
  | 'overview'
  | 'trace'
  | 'suites'
  | 'benchmarks'
  | 'capabilities'
  | 'agents'
  | 'live_runs'

export function EvalsTabShell() {
  const workspace = useEvaluationWorkspaceState()
  const [activeView, setActiveView] = useState<EvalSubview>(workspace.activeView)
  const collections = useEvaluationCollections()
  const dashboard = useEvaluationDashboard({
    results: collections.results,
    recentRuns: collections.recentRuns,
    testCases: collections.testCases,
    capabilitySuites: collections.capabilitySuites,
    capabilityRunRecords: collections.capabilityRunRecords,
    driftAlerts: collections.driftAlerts,
    experiments: collections.experiments,
    promptVariants: collections.promptVariants,
    benchmarkCohorts: collections.benchmarkCohorts,
    agentEvalRecords: collections.agentEvalRecords,
    agentExperimentRuns: collections.agentExperimentRuns,
  })

  useEffect(() => {
    queueMicrotask(() => setActiveView(workspace.activeView))
  }, [workspace.activeView])

  const content = useMemo(() => {
    switch (activeView) {
      case 'trace':
        return <TraceInspector recentRuns={collections.recentRuns} results={collections.results} />
      case 'suites':
        return (
          <SuitesPanel
            rubrics={collections.rubrics}
            testCases={collections.testCases}
            capabilitySuites={collections.capabilitySuites}
            benchmarkCohorts={collections.benchmarkCohorts}
            recentRuns={collections.recentRuns}
            onRefresh={collections.refresh}
            pendingCohortRunId={workspace.pendingCohortRunId}
            onSelectCohort={(cohortId) => {
              if (workspace.pendingCohortRunId) {
                workspace.setCompareRuns(workspace.pendingCohortRunId)
              }
              workspace.setSelectedCohort(cohortId)
              workspace.setActiveView('benchmarks')
            }}
            onSelectCapabilitySuite={(suiteId) => {
              workspace.setSelectedCapabilitySuite(suiteId)
              workspace.setActiveView('capabilities')
            }}
            onClearPendingRun={workspace.clearPendingCohortRun}
          />
        )
      case 'benchmarks':
        return (
          <BenchmarksPanel
            recentRuns={collections.recentRuns}
            results={collections.results}
            benchmarkCohorts={collections.benchmarkCohorts}
            sharedComparisonResults={collections.sharedComparisonResults}
            manualReviewNotes={collections.manualReviewNotes}
            benchmarkRunAssignments={collections.benchmarkRunAssignments}
            testCaseReviewDecisions={collections.testCaseReviewDecisions}
            autoAttachProposalFeedback={collections.autoAttachProposalFeedback}
            benchmarkSnapshots={collections.benchmarkSnapshots}
            regressionResults={collections.regressionResults}
            testCases={collections.testCases}
            onRefresh={collections.refresh}
            initialLeftRunId={workspace.compareLeftRunId}
            initialRightRunId={workspace.compareRightRunId}
            initialSelectedCohortId={workspace.selectedCohortId}
          />
        )
      case 'capabilities':
        return (
          <CapabilitySuitePanel
            capabilitySuites={collections.capabilitySuites}
            testCases={collections.testCases}
            recentRuns={collections.recentRuns}
            results={collections.results}
            capabilityRunRecords={collections.capabilityRunRecords}
            capabilitySnapshots={collections.capabilitySnapshots}
            onRefresh={collections.refresh}
            initialSelectedSuiteId={workspace.selectedCapabilitySuiteId}
          />
        )
      case 'agents':
        return (
          <AgentEvalsPanel
            recentRuns={collections.recentRuns}
            results={collections.results}
            experiments={collections.experiments}
            promptVariants={collections.promptVariants}
            agentEvalRecords={collections.agentEvalRecords}
            agentExperimentRuns={collections.agentExperimentRuns}
            onRefresh={collections.refresh}
          />
        )
      case 'live_runs':
        return <LiveRunsPanel />
      case 'overview':
      default:
        return (
          <OverviewPanel
            global={dashboard.global}
            workflowCards={dashboard.workflowCards}
            agentCards={dashboard.agentCards}
            recentResults={dashboard.recentResults}
            driftAlerts={dashboard.driftAlerts}
            experiments={dashboard.experiments}
            promptVariants={dashboard.promptVariants}
            benchmarkCohorts={dashboard.benchmarkCohorts}
            capabilitySuites={dashboard.capabilitySuites}
            capabilityFamilyCoverage={dashboard.capabilityFamilyCoverage}
            attentionItems={dashboard.attentionItems}
          />
        )
    }
  }, [activeView, collections, dashboard, workspace])

  return (
    <div className="evals-shell">
      <div className="evals-shell__header">
        <div>
          <p className="section-label">Workflow Review</p>
          <h2>Evaluation Workspace</h2>
          <p className="evals-shell__subtitle">
            Review runs, compare workflows, inspect traces, and manage benchmark cohorts in one
            place.
          </p>
        </div>
        <button type="button" className="eval-refresh-button" onClick={collections.refresh}>
          Refresh
        </button>
      </div>

      <div className="eval-subtabs">
        {(
          [
            ['overview', 'Overview'],
            ['trace', 'Trace'],
            ['suites', 'Suites'],
            ['benchmarks', 'Benchmarks'],
            ['capabilities', 'Capabilities'],
            ['agents', 'Agents'],
            ['live_runs', 'Live Runs'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`eval-subtab ${activeView === value ? 'active' : ''}`}
            onClick={() => {
              setActiveView(value)
              workspace.setActiveView(value)
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {collections.error ? <div className="eval-error-banner">{collections.error}</div> : null}
      {collections.loading ? (
        <div className="eval-loading">Loading evaluation workspace...</div>
      ) : (
        content
      )}
    </div>
  )
}
