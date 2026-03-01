/**
 * ToolsTab — Tools grid (built-in + custom) with CRUD.
 * Extracted from AgentsPage for the unified Agentic Workflows page.
 */

import { useMemo } from 'react'
import { EmptyState } from '@/components/EmptyState'
import { Button } from '@/components/ui/button'
import { useDialog } from '@/contexts/useDialog'
import { builtinTools } from '@/agents/builtinTools'
import type { ToolDefinition } from '@lifeos/agents'

export interface ToolsTabProps {
  tools: ToolDefinition[]
  isLoading: boolean
  onNew: () => void
  onEdit: (tool: ToolDefinition) => void
  onDelete: (toolId: string) => void
}

export function ToolsTab({ tools, isLoading, onNew, onEdit, onDelete }: ToolsTabProps) {
  const { confirm } = useDialog()

  const builtinToolDefs: ToolDefinition[] = useMemo(
    () =>
      builtinTools.map((bt) => ({
        toolId: bt.toolId as ToolDefinition['toolId'],
        name: bt.name,
        description: bt.description,
        parameters: {},
        requiresAuth: false,
        source: 'builtin' as const,
        createdAtMs: 0,
        updatedAtMs: 0,
      })),
    []
  )

  const allDisplayTools = useMemo(() => [...builtinToolDefs, ...tools], [builtinToolDefs, tools])

  if (isLoading) {
    return <div className="loading">Loading tools...</div>
  }

  if (allDisplayTools.length === 0) {
    return (
      <EmptyState
        label="Tools"
        title="System idle"
        description="Create reusable tools so agents can call structured operations."
        actionLabel="Create Tool"
        onAction={onNew}
      />
    )
  }

  return (
    <div className="agents-grid">
      {allDisplayTools.map((tool) => {
        const isBuiltin = tool.source === 'builtin'
        return (
          <div key={tool.toolId} className="agent-card">
            <div className="card-header">
              <h3>{tool.name}</h3>
              <span className="badge">{isBuiltin ? 'built-in' : 'custom'}</span>
            </div>
            <p className="description">{tool.description}</p>
            <div className="card-meta">
              <div>
                <strong>Params:</strong> {Object.keys(tool.parameters ?? {}).length}
              </div>
              <div>
                <strong>Auth:</strong> {tool.requiresAuth ? 'Required' : 'None'}
              </div>
            </div>
            <div className="card-actions">
              <Button variant="ghost" onClick={() => onEdit(tool)}>
                Edit
              </Button>
              {!isBuiltin && (
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const confirmed = await confirm({
                      title: 'Delete tool',
                      description: `Delete tool "${tool.name}"?`,
                      confirmLabel: 'Delete',
                      confirmVariant: 'danger',
                    })
                    if (confirmed) {
                      onDelete(tool.toolId)
                    }
                  }}
                  className="danger"
                >
                  Delete
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
