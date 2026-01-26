import { useMemo, useState } from 'react'
import type { DeepResearchRequest, RunId, WorkspaceId } from '@lifeos/agents'
import { useDeepResearch } from '@/hooks/useDeepResearch'
import { ResearchUploadModal } from './ResearchUploadModal'

interface ResearchQueueSidebarProps {
  workspaceId: WorkspaceId
  runId?: RunId
  onOpenFullQueue?: () => void
}

const formatStatus = (status: DeepResearchRequest['status']) =>
  status.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())

export function ResearchQueueSidebar({
  workspaceId,
  runId,
  onOpenFullQueue,
}: ResearchQueueSidebarProps) {
  const { requests, uploadResults } = useDeepResearch(workspaceId)
  const [selectedRequest, setSelectedRequest] = useState<DeepResearchRequest | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)

  const runRequests = useMemo(() => {
    return runId ? requests.filter((request) => request.runId === runId) : requests
  }, [requests, runId])

  return (
    <aside className="research-sidebar">
      <div className="research-sidebar__header">
        <h3>Research Queue</h3>
        <span className="research-sidebar__count">{runRequests.length}</span>
      </div>
      <div className="research-sidebar__list">
        {runRequests.length === 0 && <div className="research-sidebar__empty">No requests yet.</div>}
        {runRequests.map((request) => (
          <button
            key={request.requestId}
            type="button"
            className={`research-sidebar__item ${
              selectedRequest?.requestId === request.requestId ? 'is-active' : ''
            }`}
            onClick={() => setSelectedRequest(request)}
          >
            <div className="research-sidebar__item-title">{request.topic}</div>
            <div className="research-sidebar__item-meta">
              <span className={`research-status-badge status-${request.status}`}>
                {formatStatus(request.status)}
              </span>
              <span className="research-priority-badge">{request.priority}</span>
            </div>
          </button>
        ))}
      </div>
      <div className="research-sidebar__actions">
        <button
          type="button"
          className="primary-button"
          disabled={!selectedRequest}
          onClick={() => setShowUploadModal(true)}
        >
          Upload Results
        </button>
        {onOpenFullQueue && (
          <button type="button" className="ghost-button" onClick={onOpenFullQueue}>
            Open Full Queue
          </button>
        )}
      </div>

      <ResearchUploadModal
        isOpen={showUploadModal}
        request={selectedRequest}
        onClose={() => setShowUploadModal(false)}
        onUpload={async (payload) => {
          if (!selectedRequest) return
          await uploadResults({
            request: selectedRequest,
            ...payload,
          })
        }}
      />
    </aside>
  )
}
