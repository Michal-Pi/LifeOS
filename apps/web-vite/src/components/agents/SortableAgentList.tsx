/**
 * SortableAgentList Component
 *
 * Drag-and-drop reorderable list of selected agents for sequential workflows.
 * Uses @dnd-kit/sortable with vertical list strategy.
 */

import { DndContext, DragOverlay, PointerSensor, useSensor, closestCenter } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useState } from 'react'
import type { AgentConfig, AgentId, AgentRole } from '@lifeos/agents'
import './SortableAgentList.css'

interface SortableAgentListProps {
  agents: AgentConfig[]
  orderedIds: AgentId[]
  onReorder: (ids: AgentId[]) => void
}

const ROLE_ICON_MAP: Record<AgentRole, { light: string; dark: string }> = {
  researcher: {
    light: '/assets/icons/agents/researcher-light.svg',
    dark: '/assets/icons/agents/researcher-dark.svg',
  },
  planner: {
    light: '/assets/icons/agents/planner-light.svg',
    dark: '/assets/icons/agents/planner-dark.svg',
  },
  critic: {
    light: '/assets/icons/agents/critic-light.svg',
    dark: '/assets/icons/agents/critic-dark.svg',
  },
  synthesizer: {
    light: '/assets/icons/agents/synthesizer-light.svg',
    dark: '/assets/icons/agents/synthesizer-dark.svg',
  },
  executor: {
    light: '/assets/icons/agents/executor-light.svg',
    dark: '/assets/icons/agents/executor-dark.svg',
  },
  supervisor: {
    light: '/assets/icons/agents/supervisor-light.svg',
    dark: '/assets/icons/agents/supervisor-dark.svg',
  },
  custom: {
    light: '/assets/icons/agents/custom-light.svg',
    dark: '/assets/icons/agents/custom-dark.svg',
  },
}

const ROLE_LABELS: Record<AgentRole, string> = {
  researcher: 'Researcher',
  planner: 'Planner',
  critic: 'Critic',
  synthesizer: 'Synthesizer',
  executor: 'Executor',
  supervisor: 'Supervisor',
  custom: 'Custom',
}

function SortableAgentItem({ agent, index }: { agent: AgentConfig; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: agent.agentId,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const icon = ROLE_ICON_MAP[agent.role]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`sortable-agent-item ${isDragging ? 'sortable-agent-item--dragging' : ''}`}
      {...attributes}
    >
      <div className="sortable-agent-item__handle" {...listeners}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
          <circle cx="3" cy="2" r="1.2" />
          <circle cx="9" cy="2" r="1.2" />
          <circle cx="3" cy="6" r="1.2" />
          <circle cx="9" cy="6" r="1.2" />
          <circle cx="3" cy="10" r="1.2" />
          <circle cx="9" cy="10" r="1.2" />
        </svg>
      </div>
      <div className="sortable-agent-item__index">{index + 1}</div>
      <div className="sortable-agent-item__icon">
        <picture>
          <source srcSet={icon.dark} media="(prefers-color-scheme: dark)" />
          <img src={icon.light} alt={`${agent.role} icon`} width="20" height="20" loading="lazy" />
        </picture>
      </div>
      <div className="sortable-agent-item__info">
        <span className="sortable-agent-item__name">{agent.name}</span>
        <span className="sortable-agent-item__role">{ROLE_LABELS[agent.role]}</span>
      </div>
    </div>
  )
}

export function SortableAgentList({ agents, orderedIds, onReorder }: SortableAgentListProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8,
    },
  })

  const agentMap = new Map(agents.map((a) => [a.agentId, a]))
  const orderedAgents = orderedIds.map((id) => agentMap.get(id)).filter(Boolean) as AgentConfig[]

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over || active.id === over.id) return

    const oldIndex = orderedIds.indexOf(active.id as AgentId)
    const newIndex = orderedIds.indexOf(over.id as AgentId)
    if (oldIndex === -1 || newIndex === -1) return

    onReorder(arrayMove(orderedIds, oldIndex, newIndex))
  }

  const activeAgent = activeId ? agentMap.get(activeId as AgentId) : null

  return (
    <div className="sortable-agent-list">
      <DndContext
        sensors={[sensor]}
        collisionDetection={closestCenter}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          {orderedAgents.map((agent, index) => (
            <SortableAgentItem key={agent.agentId} agent={agent} index={index} />
          ))}
        </SortableContext>
        <DragOverlay>
          {activeAgent ? (
            <div className="sortable-agent-item sortable-agent-item--overlay">
              <div className="sortable-agent-item__handle">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <circle cx="3" cy="2" r="1.2" />
                  <circle cx="9" cy="2" r="1.2" />
                  <circle cx="3" cy="6" r="1.2" />
                  <circle cx="9" cy="6" r="1.2" />
                  <circle cx="3" cy="10" r="1.2" />
                  <circle cx="9" cy="10" r="1.2" />
                </svg>
              </div>
              <div className="sortable-agent-item__index">
                {orderedIds.indexOf(activeAgent.agentId) + 1}
              </div>
              <div className="sortable-agent-item__info">
                <span className="sortable-agent-item__name">{activeAgent.name}</span>
                <span className="sortable-agent-item__role">{ROLE_LABELS[activeAgent.role]}</span>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
