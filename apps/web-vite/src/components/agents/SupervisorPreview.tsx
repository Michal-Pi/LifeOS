/**
 * SupervisorPreview Component
 *
 * Hub-and-spoke SVG visualization showing a supervisor agent
 * connected to its worker agents and their tools.
 */

import type { AgentConfig, ToolDefinition } from '@lifeos/agents'
import type { BuiltinToolMeta } from '@/agents/builtinTools'
import './SupervisorPreview.css'

interface SupervisorPreviewProps {
  supervisorAgent: AgentConfig
  workerAgents: AgentConfig[]
  allTools?: Array<ToolDefinition | BuiltinToolMeta>
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength).trim() + '\u2026'
}

export function SupervisorPreview({
  supervisorAgent,
  workerAgents,
  allTools = [],
}: SupervisorPreviewProps) {
  if (workerAgents.length === 0) {
    return (
      <div className="supervisor-preview">
        <div className="supervisor-preview__empty">
          Select at least one worker agent to see the supervisor overview.
        </div>
      </div>
    )
  }

  const toolMap = new Map(allTools.map((t) => [t.toolId, t.name]))

  const workerCount = workerAgents.length
  const nodeWidth = 130
  const nodeGap = 20
  const svgWidth = Math.max(400, workerCount * (nodeWidth + nodeGap) + nodeGap * 2)
  const svgHeight = 190

  const centerX = svgWidth / 2
  const supervisorY = 15
  const supervisorH = 46
  const workerY = 110
  const workerH = 60

  return (
    <div className="supervisor-preview">
      <svg
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="supervisor-preview__svg"
        role="img"
        aria-label={`Supervisor: ${supervisorAgent.name} coordinating ${workerCount} worker agents`}
      >
        {/* Connection lines from supervisor to each worker */}
        {workerAgents.map((worker, index) => {
          const workerX = ((index + 1) / (workerCount + 1)) * svgWidth
          return (
            <line
              key={worker.agentId}
              x1={centerX}
              y1={supervisorY + supervisorH}
              x2={workerX}
              y2={workerY}
              className="supervisor-preview__line"
            />
          )
        })}

        {/* Supervisor node */}
        <g className="supervisor-preview__node supervisor-preview__node--supervisor">
          <rect x={centerX - 75} y={supervisorY} width={150} height={supervisorH} rx={8} />
          <text
            x={centerX}
            y={supervisorY + 20}
            textAnchor="middle"
            className="supervisor-preview__name"
          >
            {truncate(supervisorAgent.name, 20)}
          </text>
          <text
            x={centerX}
            y={supervisorY + 36}
            textAnchor="middle"
            className="supervisor-preview__role"
          >
            SUPERVISOR
          </text>
        </g>

        {/* Worker nodes */}
        {workerAgents.map((worker, index) => {
          const workerX = ((index + 1) / (workerCount + 1)) * svgWidth
          const workerToolNames = (worker.toolIds ?? [])
            .map((id) => toolMap.get(id))
            .filter(Boolean) as string[]

          return (
            <g
              key={worker.agentId}
              className="supervisor-preview__node supervisor-preview__node--worker"
            >
              <rect
                x={workerX - nodeWidth / 2}
                y={workerY}
                width={nodeWidth}
                height={workerH}
                rx={6}
              />
              <text
                x={workerX}
                y={workerY + 18}
                textAnchor="middle"
                className="supervisor-preview__name"
              >
                {truncate(worker.name, 16)}
              </text>
              <text
                x={workerX}
                y={workerY + 33}
                textAnchor="middle"
                className="supervisor-preview__role"
              >
                {worker.role.toUpperCase()}
              </text>
              {workerToolNames.length > 0 && (
                <text
                  x={workerX}
                  y={workerY + 48}
                  textAnchor="middle"
                  className="supervisor-preview__tools"
                >
                  {truncate(workerToolNames.join(', '), 22)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
