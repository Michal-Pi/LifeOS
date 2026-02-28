/**
 * WorkflowFormModals
 *
 * Auxiliary modals rendered alongside the main WorkflowFormModal:
 * prompt editor, graph docs, graph preview, and custom builder.
 */

import { Button } from '@/components/ui/button'
import { PromptEditor } from './PromptEditor'
import { WorkflowGraphDocsModal } from './WorkflowGraphDocsModal'
import { CustomWorkflowBuilder } from './CustomWorkflowBuilder'
import { WorkflowGraphView } from './WorkflowGraphView'
import type { WorkflowFormModalsProps } from './workflowFormConstants'

export function WorkflowFormModals({
  promptEditorTemplate,
  setPromptEditorTemplate,
  userId,
  showGraphDocs,
  setShowGraphDocs,
  showGraphPreview,
  setShowGraphPreview,
  parsedGraph,
  showCustomBuilder,
  setShowCustomBuilder,
  workflowGraphInput,
  setWorkflowGraphInput,
  activeAgents,
  selectedAgentIds,
  onCreateAgent,
}: WorkflowFormModalsProps) {
  return (
    <>
      {promptEditorTemplate && userId && (
        <div className="modal-overlay" onClick={() => setPromptEditorTemplate(null)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <PromptEditor
              userId={userId}
              templateId={promptEditorTemplate.templateId}
              onClose={() => setPromptEditorTemplate(null)}
            />
          </div>
        </div>
      )}

      <WorkflowGraphDocsModal isOpen={showGraphDocs} onClose={() => setShowGraphDocs(false)} />

      {showGraphPreview && parsedGraph && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1100 }}
          onClick={() => setShowGraphPreview(false)}
        >
          <div
            className="modal-content"
            style={{ width: '90vw', maxWidth: 1100, height: '75vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem 1rem',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <h3 style={{ margin: 0 }}>Workflow Preview</h3>
              <Button type="button" variant="secondary" onClick={() => setShowGraphPreview(false)}>
                Close
              </Button>
            </div>
            <div style={{ flex: 1, height: 'calc(100% - 52px)' }}>
              <WorkflowGraphView graph={parsedGraph} />
            </div>
          </div>
        </div>
      )}

      <CustomWorkflowBuilder
        isOpen={showCustomBuilder}
        onClose={() => setShowCustomBuilder(false)}
        initialGraph={
          workflowGraphInput
            ? (() => {
                try {
                  return JSON.parse(workflowGraphInput)
                } catch {
                  return undefined
                }
              })()
            : undefined
        }
        agents={activeAgents.filter((a) => selectedAgentIds.includes(a.agentId))}
        onSave={(graph) => {
          setWorkflowGraphInput(JSON.stringify(graph, null, 2))
          setShowCustomBuilder(false)
        }}
        onCreateAgent={onCreateAgent}
      />
    </>
  )
}
