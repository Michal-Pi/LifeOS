/**
 * WorkflowTypeConfigSection
 *
 * Workflow type selector, type-specific configuration (ordering, supervisor, graph, custom),
 * iteration/memory limits, execution mode toggle, and project manager config.
 */

import type { AgentId } from '@lifeos/agents'
import type { WorkflowType } from './workflowFormConstants'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/Select'
import { ProjectManagerConfig as ProjectManagerConfigForm } from './ProjectManagerConfig'
import { SortableAgentList } from './SortableAgentList'
import { ParallelMergeSelector } from './ParallelMergeSelector'
import { SupervisorPreview } from './SupervisorPreview'
import { WorkflowGraphView } from './WorkflowGraphView'
import {
  WORKFLOW_SELECT_OPTIONS,
  type WorkflowTypeConfigSectionProps,
} from './workflowFormConstants'

export function WorkflowTypeConfigSection({
  workflowType,
  setWorkflowType,
  selectedAgentIds,
  setSelectedAgentIds,
  activeAgents,
  parallelMergeStrategy,
  setParallelMergeStrategy,
  supervisorAgentId,
  setSupervisorAgentId,
  maxIterations,
  setMaxIterations,
  memoryMessageLimitInput,
  setMemoryMessageLimitInput,
  executionModeChoice,
  setExecutionModeChoice,
  expertCouncilEnabled,
  setExpertCouncilEnabled,
  workflowGraphInput,
  setWorkflowGraphInput,
  workflowPrompt,
  setWorkflowPrompt,
  isGeneratingWorkflow,
  onGenerateWorkflowFromPrompt,
  connectedProviders,
  parsedGraph,
  setShowGraphDocs,
  setShowCustomBuilder,
  setShowGraphPreview,
  validationErrors,
  setValidationErrors,
  projectManagerConfig,
  setProjectManagerConfig,
}: WorkflowTypeConfigSectionProps) {
  return (
    <>
      {/* Workflow Type */}
      <div className="form-group">
        <label htmlFor="workflowType">Workflow Type *</label>
        <Select
          id="workflowType"
          value={workflowType}
          onChange={(value) => {
            const newType = value as WorkflowType
            setWorkflowType(newType)
            if (newType !== 'supervisor') {
              setSupervisorAgentId(undefined)
            }
          }}
          options={WORKFLOW_SELECT_OPTIONS}
        />
      </div>

      {/* Sequential / Parallel ordering */}
      {(workflowType === 'sequential' || workflowType === 'parallel') &&
        selectedAgentIds.length > 1 && (
          <div className="form-group">
            <label>
              {workflowType === 'sequential' ? 'Execution Order' : 'Output Order'} (drag to reorder)
            </label>
            <SortableAgentList
              agents={activeAgents.filter((a) => selectedAgentIds.includes(a.agentId))}
              orderedIds={selectedAgentIds}
              onReorder={setSelectedAgentIds}
            />
            {workflowType === 'parallel' && (
              <small>Controls the order in which agent outputs are combined</small>
            )}
          </div>
        )}

      {/* Parallel merge strategy */}
      {workflowType === 'parallel' && (
        <div className="form-group">
          <label>Merge Strategy</label>
          <ParallelMergeSelector
            value={parallelMergeStrategy}
            onChange={setParallelMergeStrategy}
            selectedAgents={activeAgents.filter((a) => selectedAgentIds.includes(a.agentId))}
          />
        </div>
      )}

      {/* Supervisor config */}
      {workflowType === 'supervisor' &&
        selectedAgentIds.length > 0 &&
        (() => {
          const supervisorCandidates = activeAgents.filter(
            (a) => selectedAgentIds.includes(a.agentId) && a.role === 'supervisor'
          )
          const workerAgents = activeAgents.filter(
            (a) => selectedAgentIds.includes(a.agentId) && a.agentId !== supervisorAgentId
          )
          const supervisorAgent = supervisorAgentId
            ? activeAgents.find((a) => a.agentId === supervisorAgentId)
            : undefined

          return (
            <>
              <div className="form-group">
                <label htmlFor="supervisorAgent">Supervisor Agent *</label>
                {supervisorCandidates.length === 0 ? (
                  <div className="merge-selector__warning">
                    No supervisor-role agents found among selected agents. Create an agent with the
                    &quot;Supervisor&quot; role first, then select it here.
                  </div>
                ) : (
                  <Select
                    id="supervisorAgent"
                    value={supervisorAgentId ?? ''}
                    onChange={(value) => setSupervisorAgentId(value as AgentId)}
                    options={supervisorCandidates.map((a) => ({
                      value: a.agentId,
                      label: a.name,
                    }))}
                    placeholder="Select a supervisor agent"
                  />
                )}
                {validationErrors.supervisor && (
                  <span className="field-error">{validationErrors.supervisor}</span>
                )}
                <small>
                  The supervisor breaks the problem into sub-tasks, dispatches to workers, validates
                  results, and decides next steps. Worker agents and their tools are passed as
                  context automatically.
                </small>
              </div>

              {supervisorAgent && workerAgents.length > 0 && (
                <div className="form-group">
                  <label>Supervisor Overview</label>
                  <SupervisorPreview
                    supervisorAgent={supervisorAgent}
                    workerAgents={workerAgents}
                  />
                </div>
              )}
            </>
          )
        })()}

      {/* Graph workflow config */}
      {workflowType === 'graph' && (
        <>
          <div className="form-group">
            <label htmlFor="workflowPrompt">Describe Workflow (Optional)</label>
            <textarea
              id="workflowPrompt"
              value={workflowPrompt}
              onChange={(e) => setWorkflowPrompt(e.target.value)}
              placeholder="Example: Sequential workflow with researcher then writer, or Parallel research by 3 agents then synthesize..."
              rows={3}
              style={{
                marginBottom: '0.5rem',
              }}
            />
            <Button
              type="button"
              variant="secondary"
              onClick={onGenerateWorkflowFromPrompt}
              disabled={
                isGeneratingWorkflow || !workflowPrompt.trim() || connectedProviders.length === 0
              }
            >
              {isGeneratingWorkflow ? 'Generating...' : 'Generate JSON from Description'}
            </Button>
            {connectedProviders.length === 0 && (
              <small
                style={{
                  display: 'block',
                  marginTop: '0.25rem',
                  color: 'var(--destructive)',
                }}
              >
                An AI provider API key is required. Add one in Settings (OpenAI, Anthropic, xAI, or
                Google).
              </small>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="workflowGraph">
              Workflow Graph (JSON)
              <button
                type="button"
                className="help-icon-btn"
                onClick={() => setShowGraphDocs(true)}
                title="Graph documentation"
              >
                ?
              </button>
            </label>
            <textarea
              id="workflowGraph"
              value={workflowGraphInput}
              onChange={(e) => {
                setWorkflowGraphInput(e.target.value)
                if (validationErrors.workflowGraph) {
                  const { workflowGraph: _, ...rest } = validationErrors
                  setValidationErrors(rest)
                }
              }}
              placeholder='{"version":1,"startNodeId":"node_1","nodes":[],"edges":[]}'
              rows={8}
              className={validationErrors.workflowGraph ? 'error' : ''}
            />
            {validationErrors.workflowGraph ? (
              <span className="field-error">{validationErrors.workflowGraph}</span>
            ) : (
              <small>Provide a graph definition for advanced orchestration.</small>
            )}
          </div>

          <div className="form-group" style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowCustomBuilder(true)}
              disabled={!parsedGraph}
            >
              Open in Visual Builder
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowGraphPreview(true)}
              disabled={!parsedGraph}
            >
              Preview Workflow
            </Button>
          </div>

          {parsedGraph && (
            <div
              className="form-group"
              style={{
                height: 200,
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <WorkflowGraphView graph={parsedGraph} compact />
            </div>
          )}
        </>
      )}

      {/* Custom workflow config */}
      {workflowType === 'custom' && (
        <>
          <div
            className="form-group"
            style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
          >
            <Button type="button" variant="secondary" onClick={() => setShowCustomBuilder(true)}>
              Open Visual Builder
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowGraphPreview(true)}
              disabled={!parsedGraph}
            >
              Preview Workflow
            </Button>
            {parsedGraph && (
              <small style={{ color: 'var(--success)' }}>
                {parsedGraph.nodes?.length ?? 0} nodes, {parsedGraph.edges?.length ?? 0} edges
              </small>
            )}
          </div>

          {parsedGraph && (
            <div
              className="form-group"
              style={{
                height: 200,
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <WorkflowGraphView graph={parsedGraph} compact />
            </div>
          )}
        </>
      )}

      {/* Max iterations */}
      <div className="form-group">
        <label htmlFor="maxIterations">Max Iterations: {maxIterations}</label>
        <input
          id="maxIterations"
          type="range"
          min="1"
          max="50"
          step="1"
          value={maxIterations}
          onChange={(e) => setMaxIterations(parseInt(e.target.value))}
        />
        <small>Maximum number of agent interactions per run (prevents infinite loops)</small>
      </div>

      {/* Memory message limit */}
      <div className="form-group">
        <label htmlFor="memoryMessageLimit">Default Message Window (optional)</label>
        <input
          id="memoryMessageLimit"
          type="number"
          min={1}
          max={200}
          value={memoryMessageLimitInput}
          onChange={(e) => setMemoryMessageLimitInput(e.target.value)}
          placeholder="Use global default"
        />
        <small>
          Number of recent messages to include when resuming runs (1-200). Overrides the global
          default.
        </small>
      </div>

      {/* Execution mode */}
      <div className="form-group">
        <label>Execution Mode</label>
        <label>
          <input
            type="radio"
            name="executionMode"
            checked={executionModeChoice === 'workflow'}
            onChange={() => {
              setExecutionModeChoice('workflow')
              setExpertCouncilEnabled(false)
            }}
          />
          <span>Workflow</span>
        </label>
        <label>
          <input
            type="radio"
            name="executionMode"
            checked={executionModeChoice === 'expert_council'}
            onChange={() => {
              setExecutionModeChoice('expert_council')
              setExpertCouncilEnabled(true)
            }}
          />
          <span>Expert Council</span>
        </label>
        {expertCouncilEnabled && workflowType !== 'sequential' && (
          <div className="run-error">
            Note: Expert Council will execute instead of the configured workflow when enabled.
          </div>
        )}
      </div>

      {/* Project Manager Config */}
      <ProjectManagerConfigForm
        value={projectManagerConfig}
        onChange={(updates) =>
          setProjectManagerConfig((prev) => ({
            ...prev,
            ...updates,
          }))
        }
      />
    </>
  )
}
