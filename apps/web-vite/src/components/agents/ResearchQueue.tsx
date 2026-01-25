import { useMemo, useState } from 'react'
import type { DeepResearchRequest, DeepResearchSource, WorkspaceId } from '@lifeos/agents'
import { toast } from 'sonner'
import { useDeepResearch } from '@/hooks/useDeepResearch'
import {
  buildResearchPrompt,
  synthesizeResearchFindings,
  validateResearchCompleteness,
} from '@/services/deepResearch/resultProcessor'
import { ResearchRequestCard } from './ResearchRequestCard'
import { ResearchUploadModal } from './ResearchUploadModal'
import styles from './ResearchQueue.module.css'

interface ResearchQueueProps {
  workspaceId: WorkspaceId
}

const formatStatus = (status: DeepResearchRequest['status']) =>
  status.replace('_', ' ').replace(/\b\w/g, (char) => char.toUpperCase())

const formatDateTime = (timestampMs: number) => new Date(timestampMs).toLocaleString()

const RESEARCH_SOURCES: DeepResearchSource[] = ['claude', 'chatgpt', 'gemini', 'other']

export function ResearchQueue({ workspaceId }: ResearchQueueProps) {
  const { requests, isLoading, uploadResults, updateRequest } = useDeepResearch(workspaceId)
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | DeepResearchRequest['status']>('all')
  const [search, setSearch] = useState('')
  const [selectedModel, setSelectedModel] = useState<DeepResearchSource>('claude')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [fallbackPrompt, setFallbackPrompt] = useState<{
    requestId: string
    prompt: string
  } | null>(null)

  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      if (statusFilter !== 'all' && request.status !== statusFilter) return false
      if (search.trim()) {
        const term = search.trim().toLowerCase()
        return request.topic.toLowerCase().includes(term)
      }
      return true
    })
  }, [requests, statusFilter, search])

  const selectedRequest =
    filteredRequests.find((request) => request.requestId === selectedRequestId) ??
    filteredRequests[0] ??
    null

  const combinedResultsContent = useMemo(() => {
    if (!selectedRequest?.results || selectedRequest.results.length === 0) return ''
    return selectedRequest.results.map((result) => result.content).join('\n\n')
  }, [selectedRequest])

  const completeness = selectedRequest
    ? validateResearchCompleteness(selectedRequest, combinedResultsContent)
    : null

  const handleCopyPrompt = async () => {
    if (!selectedRequest) return
    const prompt = buildResearchPrompt(selectedRequest)
    if (!navigator.clipboard?.writeText) {
      setFallbackPrompt({ requestId: selectedRequest.requestId, prompt })
      toast.error('Clipboard unavailable', {
        description: 'Copy the prompt from the text area below.',
      })
      return
    }
    try {
      await navigator.clipboard.writeText(prompt)
      toast.success('Prompt copied to clipboard')
      setFallbackPrompt(null)
    } catch {
      setFallbackPrompt({ requestId: selectedRequest.requestId, prompt })
      toast.error('Failed to copy prompt', { description: 'Please try again or copy manually' })
    }
  }

  const handleExportJson = () => {
    if (!selectedRequest) return
    const payload = JSON.stringify(selectedRequest, null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${selectedRequest.topic.replace(/\s+/g, '_')}_research.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleMarkComplete = async () => {
    if (!selectedRequest) return
    const synthesizedFindings =
      selectedRequest.results && selectedRequest.results.length > 0
        ? synthesizeResearchFindings(selectedRequest)
        : selectedRequest.synthesizedFindings
    await updateRequest(selectedRequest, {
      status: 'completed',
      synthesizedFindings,
      integratedAtMs: Date.now(),
    })
  }

  return (
    <div className={styles['research-queue']}>
      <div className={styles['research-queue__sidebar']}>
        <div className={styles['research-queue__header']}>
          <h3>Research Queue</h3>
          <span className={styles['research-queue__count']}>{filteredRequests.length}</span>
        </div>

        <div className={styles['research-queue__filters']}>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <input
            type="search"
            placeholder="Search topics..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className={styles['research-queue__list']}>
          {isLoading && <div className={styles['research-empty']}>Loading requests...</div>}
          {!isLoading && filteredRequests.length === 0 && (
            <div className={styles['research-empty']}>No research requests yet.</div>
          )}
          {filteredRequests.map((request) => (
            <ResearchRequestCard
              key={request.requestId}
              request={request}
              isActive={selectedRequest?.requestId === request.requestId}
              onSelect={() => setSelectedRequestId(request.requestId)}
            />
          ))}
        </div>
      </div>

      <div className={styles['research-queue__content']}>
        {!selectedRequest ? (
          <div className={styles['research-empty']}>Select a request to view details.</div>
        ) : (
          <div className={styles['research-detail']}>
            <div className={styles['research-detail__header']}>
              <div>
                <h2>{selectedRequest.topic}</h2>
                <div className={styles['research-detail__meta']}>
                  <span
                    className={`${styles['research-status']} ${
                      styles[`research-status--${selectedRequest.status}`]
                    }`}
                  >
                    {formatStatus(selectedRequest.status)}
                  </span>
                  <span
                    className={`${styles['research-priority']} ${
                      styles[`research-priority--${selectedRequest.priority}`]
                    }`}
                  >
                    {selectedRequest.priority}
                  </span>
                  <span>Created {formatDateTime(selectedRequest.createdAtMs)}</span>
                </div>
              </div>
              <div className={styles['research-detail__actions']}>
                <div className={styles['research-models']}>
                  {RESEARCH_SOURCES.map((model) => (
                    <button
                      key={model}
                      type="button"
                      className={`${styles['research-model']} ${
                        selectedModel === model ? styles['is-active'] : ''
                      }`}
                      onClick={() => setSelectedModel(model)}
                    >
                      {model}
                    </button>
                  ))}
                </div>
                <div className={styles['research-action-buttons']}>
                  <button className="primary-button" type="button" onClick={handleCopyPrompt}>
                    Copy prompt for {selectedModel}
                  </button>
                  <button className="ghost-button" type="button" onClick={handleExportJson}>
                    Export JSON
                  </button>
                </div>
              </div>
            </div>

            {fallbackPrompt?.requestId === selectedRequest.requestId && (
              <div className={styles['research-section']}>
                <div className={styles['research-section__header']}>
                  <h4>Copy prompt</h4>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setFallbackPrompt(null)}
                  >
                    Dismiss
                  </button>
                </div>
                <textarea
                  className={styles['research-prompt-fallback']}
                  readOnly
                  rows={6}
                  value={fallbackPrompt.prompt}
                />
              </div>
            )}

            {selectedRequest.context && (
              <div className={styles['research-section']}>
                <h4>Context</h4>
                <pre>{JSON.stringify(selectedRequest.context, null, 2)}</pre>
              </div>
            )}

            <div className={styles['research-section']}>
              <h4>Questions</h4>
              <ol>
                {selectedRequest.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ol>
            </div>

            <div className={styles['research-section']}>
              <div className={styles['research-section__header']}>
                <h4>Results</h4>
                <div className={styles['research-action-buttons']}>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleMarkComplete}
                    disabled={selectedRequest.status === 'completed'}
                  >
                    Mark complete
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => setShowUploadModal(true)}
                  >
                    Upload results
                  </button>
                </div>
              </div>
              {selectedRequest.results && selectedRequest.results.length > 0 ? (
                <div className={styles['research-results']}>
                  {selectedRequest.results.map((result, index) => (
                    <div
                      key={`${result.source}-${index}`}
                      className={styles['research-result-card']}
                    >
                      <div className={styles['research-result-card__header']}>
                        <strong>
                          {result.source} - {result.model}
                        </strong>
                        <span>{formatDateTime(result.uploadedAtMs)}</span>
                      </div>
                      <p>{result.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles['research-empty']}>No results uploaded yet.</div>
              )}
              {completeness && !completeness.isComplete && (
                <div className={styles['research-warning']}>
                  Missing coverage for {completeness.missingQuestions.length} question
                  {completeness.missingQuestions.length === 1 ? '' : 's'}.
                </div>
              )}
            </div>

            {selectedRequest.synthesizedFindings && (
              <div className={styles['research-section']}>
                <h4>Synthesized findings</h4>
                <pre>{selectedRequest.synthesizedFindings}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      <ResearchUploadModal
        isOpen={showUploadModal}
        request={selectedRequest}
        onClose={() => setShowUploadModal(false)}
        onUpload={async (payload) => {
          if (!selectedRequest) return
          await uploadResults({ request: selectedRequest, ...payload })
        }}
      />
    </div>
  )
}
