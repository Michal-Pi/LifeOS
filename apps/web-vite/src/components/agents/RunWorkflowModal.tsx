/**
 * RunWorkflowModal Component
 *
 * Modal for starting a new run in a workflow.
 * Features:
 * - Enter goal for the run
 * - Provide optional context
 * - Start execution
 * - Form validation
 */

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAiProviderKeys } from '@/hooks/useAiProviderKeys'
import { useWorkflowOperations } from '@/hooks/useWorkflowOperations'
import { useNoteOperations } from '@/hooks/useNoteOperations'
import { Button } from '@/components/ui/button'
import type { AgentConfig, ExecutionMode, Workflow, CreateRunInput } from '@lifeos/agents'
import type { Note } from '@lifeos/notes'
import { useAuth } from '@/hooks/useAuth'
import { useDeepResearch } from '@/hooks/useDeepResearch'
import { ExpertCouncilModeSelector } from './ExpertCouncilModeSelector'
import { ResearchQueueSidebar } from './ResearchQueueSidebar'
import { TipTapEditor } from '@/components/editor/TipTapEditor'
import type { JSONContent } from '@tiptap/react'

type ContextMode = 'json' | 'note' | 'file'

interface AttachedNote {
  noteId: string
  title: string
  content: string
}

interface UploadedFile {
  name: string
  type: 'json' | 'markdown'
  content: string
}

function stripHtml(html: string | undefined): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, '').trim()
}

interface RunWorkflowModalProps {
  workflow: Workflow | null
  agents: AgentConfig[]
  isOpen: boolean
  onClose: () => void
  onRunCreated: () => void
  initialGoal?: string
  initialContext?: Record<string, unknown>
}

export function RunWorkflowModal({
  workflow,
  agents,
  isOpen,
  onClose,
  onRunCreated,
  initialGoal,
  initialContext,
}: RunWorkflowModalProps) {
  const { createRun } = useWorkflowOperations()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { keys } = useAiProviderKeys(user?.uid)
  const memoryLimitPlaceholder = workflow?.memoryMessageLimit
    ? `Workflow default: ${workflow.memoryMessageLimit}`
    : 'Use workflow/global default'

  const { searchNotes, listNotes } = useNoteOperations()

  const [goal, setGoal] = useState('')
  const [inputMode, setInputMode] = useState<'simple' | 'rich'>('simple')
  const [richContent, setRichContent] = useState<JSONContent>({ type: 'doc', content: [] })
  const [contextInput, setContextInput] = useState('')
  const [contextMode, setContextMode] = useState<ContextMode>('json')
  const [attachedNotes, setAttachedNotes] = useState<AttachedNote[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [noteSearchQuery, setNoteSearchQuery] = useState('')
  const [noteSearchResults, setNoteSearchResults] = useState<Note[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [memoryMessageLimitInput, setMemoryMessageLimitInput] = useState('')
  const [expertCouncilMode, setExpertCouncilMode] = useState<ExecutionMode>('full')
  const [showResearchQueue, setShowResearchQueue] = useState(false)
  const [skipResearch, setSkipResearch] = useState(false)

  // Deep research configuration (only shown for deep_research workflows)
  const isDeepResearch = workflow?.workflowType === 'deep_research'
  const [drBudget, setDrBudget] = useState(10)
  const [drSearchDepth, setDrSearchDepth] = useState<'shallow' | 'standard' | 'deep'>('standard')
  const [drIncludeAcademic, setDrIncludeAcademic] = useState(true)
  const [drMaxGapIterations, setDrMaxGapIterations] = useState(3)
  const [drMaxDialecticalCycles, setDrMaxDialecticalCycles] = useState(2)

  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { requests } = useDeepResearch(isOpen ? (workflow?.workflowId ?? null) : null)
  const resumeRunId =
    initialContext && typeof initialContext === 'object'
      ? (initialContext as { resumeRunId?: string }).resumeRunId
      : undefined
  const runRequests = useMemo(() => {
    if (!resumeRunId) return []
    return requests.filter((request) => request.runId === resumeRunId)
  }, [requests, resumeRunId])

  const missingProviders = useMemo(() => {
    if (!workflow) return []
    const providers = new Set<string>()

    if (workflow.expertCouncilConfig?.enabled) {
      workflow.expertCouncilConfig.councilModels.forEach((model) => providers.add(model.provider))
      workflow.expertCouncilConfig.judgeModels?.forEach((model) => providers.add(model.provider))
      providers.add(workflow.expertCouncilConfig.chairmanModel.provider)
    } else {
      agents
        .filter((agent) => workflow.agentIds.includes(agent.agentId))
        .forEach((agent) => providers.add(agent.modelProvider))
    }

    const missing: string[] = []
    providers.forEach((provider) => {
      if (provider === 'openai' && !keys.openaiKey) missing.push('OpenAI')
      if (provider === 'anthropic' && !keys.anthropicKey) missing.push('Anthropic')
      if (provider === 'google' && !keys.googleKey) missing.push('Google')
      if (provider === 'xai' && !keys.xaiKey) missing.push('xAI (Grok)')
    })

    return missing
  }, [agents, keys, workflow])

  // Debounced note search
  useEffect(() => {
    if (!isOpen || contextMode !== 'note') return

    const timer = setTimeout(async () => {
      if (noteSearchQuery.trim()) {
        const results = await searchNotes(noteSearchQuery)
        setNoteSearchResults(results.slice(0, 8))
      } else {
        // Show recent notes when search is empty
        const recent = await listNotes()
        setNoteSearchResults(recent.slice(0, 5))
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [noteSearchQuery, isOpen, contextMode, searchNotes, listNotes])

  const handleAttachNote = useCallback((note: Note) => {
    setAttachedNotes((prev) => {
      if (prev.some((n) => n.noteId === note.noteId)) return prev
      return [
        ...prev,
        {
          noteId: note.noteId,
          title: note.title,
          content: stripHtml(note.contentHtml),
        },
      ]
    })
    setNoteSearchQuery('')
  }, [])

  const handleRemoveNote = useCallback((noteId: string) => {
    setAttachedNotes((prev) => prev.filter((n) => n.noteId !== noteId))
  }, [])

  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      if (file.size > 5 * 1024 * 1024) {
        setError(`File "${file.name}" is too large. Maximum size is 5MB.`)
        continue
      }

      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext !== 'json' && ext !== 'md' && ext !== 'markdown') {
        setError(`Unsupported file type: .${ext}. Use .json or .md files.`)
        continue
      }

      const text = await file.text()
      const fileType: 'json' | 'markdown' = ext === 'json' ? 'json' : 'markdown'

      // Validate JSON files
      if (fileType === 'json') {
        try {
          JSON.parse(text)
        } catch {
          setError(`File "${file.name}" contains invalid JSON.`)
          continue
        }
      }

      setUploadedFiles((prev) => {
        if (prev.some((f) => f.name === file.name)) return prev
        return [...prev, { name: file.name, type: fileType, content: text }]
      })
    }
    setError(null)
  }, [])

  const handleRemoveFile = useCallback((name: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.name !== name))
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      void handleFileSelect(e.dataTransfer.files)
    },
    [handleFileSelect]
  )

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setGoal(initialGoal ?? '')
      setInputMode('simple')
      setRichContent({ type: 'doc', content: [] })
      setContextInput(initialContext ? JSON.stringify(initialContext, null, 2) : '')
      setContextMode('json')
      setAttachedNotes([])
      setUploadedFiles([])
      setNoteSearchQuery('')
      setNoteSearchResults([])
      setIsDragging(false)
      setSkipResearch(false)
      setMemoryMessageLimitInput('')
      setExpertCouncilMode(workflow?.expertCouncilConfig?.defaultMode ?? 'full')
      setError(null)
    }
  }, [initialContext, initialGoal, isOpen, workflow])

  const handleStart = async () => {
    // Get goal text based on input mode
    let goalText = ''
    if (inputMode === 'simple') {
      goalText = goal.trim()
    } else {
      // Convert rich content to plain text
      const extractText = (content: JSONContent): string => {
        if (!content) return ''
        if (content.text) return content.text
        if (content.content) {
          return content.content.map(extractText).join(' ')
        }
        return ''
      }
      goalText = extractText(richContent).trim()
    }

    // Validation
    if (!goalText) {
      setError('Goal is required')
      return
    }

    if (!workflow) {
      setError('No workflow selected')
      return
    }

    if (missingProviders.length > 0) {
      setError(
        `Missing API key${missingProviders.length > 1 ? 's' : ''}: ${missingProviders.join(
          ', '
        )}. Add keys in Settings to continue.`
      )
      return
    }

    const memoryMessageLimit = memoryMessageLimitInput
      ? Number.parseInt(memoryMessageLimitInput, 10)
      : undefined

    if (
      memoryMessageLimitInput &&
      (Number.isNaN(memoryMessageLimit) || memoryMessageLimit <= 0 || memoryMessageLimit > 200)
    ) {
      setError('Context budget must be a number between 1 and 200.')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      // Merge all context sources
      let context: Record<string, unknown> | undefined

      // 1. Parse JSON input if provided
      if (contextInput.trim()) {
        try {
          context = JSON.parse(contextInput)
        } catch {
          setError('Context must be valid JSON')
          setIsCreating(false)
          return
        }
      }

      // 2. Add attached notes
      if (attachedNotes.length > 0) {
        context = { ...(context ?? {}), attachedNotes }
      }

      // 3. Add uploaded files
      if (uploadedFiles.length > 0) {
        context = { ...(context ?? {}), uploadedFiles }
      }

      // 4. Add skipResearch flag
      if (skipResearch) {
        context = { ...(context ?? {}), skipResearch: true }
      }

      const councilConfig = workflow.expertCouncilConfig
      if (councilConfig?.enabled && councilConfig.allowModeOverride) {
        context = { ...(context ?? {}), expertCouncilMode }
      }

      // 5. Add deep research config
      if (isDeepResearch) {
        context = {
          ...(context ?? {}),
          deepResearchConfig: {
            query: goalText,
            maxBudgetUsd: drBudget,
            searchDepth: drSearchDepth,
            includeAcademic: drIncludeAcademic,
            includeSemanticSearch: true,
            thesisLenses: ['economic', 'systems', 'adversarial'],
            maxGapIterations: drMaxGapIterations,
            maxDialecticalCycles: drMaxDialecticalCycles,
          },
        }
      }

      // Build run input, only include memoryMessageLimit if it's defined
      const runInput: CreateRunInput = {
        workflowId: workflow.workflowId,
        goal: goalText,
        context,
      }

      if (memoryMessageLimit !== undefined) {
        runInput.memoryMessageLimit = memoryMessageLimit
      }

      await createRun(runInput)

      onRunCreated()
      onClose()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setIsCreating(false)
    }
  }

  if (!isOpen || !workflow) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="run-modal-layout">
          <div className="run-modal-main">
            <div className="modal-header">
              <div>
                <h2>Start New Run</h2>
                <p className="workflow-name">
                  Workflow: <strong>{workflow.name}</strong>
                </p>
              </div>
              {resumeRunId && runRequests.length > 0 && (
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setShowResearchQueue((prev) => !prev)}
                >
                  {showResearchQueue ? 'Hide' : 'Show'} Research ({runRequests.length})
                </Button>
              )}
            </div>

            {resumeRunId && (
              <div className="info-message">
                This run will include conversation history from run {resumeRunId}.
              </div>
            )}

            {error && <div className="error-message">{error}</div>}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleStart()
              }}
            >
              {workflow.expertCouncilConfig?.enabled &&
                workflow.expertCouncilConfig.allowModeOverride && (
                  <ExpertCouncilModeSelector
                    config={workflow.expertCouncilConfig}
                    initialMode={expertCouncilMode}
                    onSelect={setExpertCouncilMode}
                  />
                )}
              <div className="form-group">
                <div className="form-label-with-toggle">
                  <label htmlFor="goal">Goal *</label>
                  <div className="input-mode-toggle">
                    <button
                      type="button"
                      className={`toggle-btn ${inputMode === 'simple' ? 'active' : ''}`}
                      onClick={() => setInputMode('simple')}
                    >
                      Simple Text
                    </button>
                    <button
                      type="button"
                      className={`toggle-btn ${inputMode === 'rich' ? 'active' : ''}`}
                      onClick={() => setInputMode('rich')}
                    >
                      Rich Editor
                    </button>
                  </div>
                </div>
                {inputMode === 'simple' ? (
                  <textarea
                    id="goal"
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="What do you want the workflow to accomplish?"
                    rows={4}
                    required
                  />
                ) : (
                  <div className="rich-editor-container">
                    <TipTapEditor
                      content={richContent}
                      onChange={setRichContent}
                      placeholder="What do you want the workflow to accomplish?"
                      editable={true}
                    />
                  </div>
                )}
                <small>Describe the task or goal for this run</small>
              </div>

              <div className="form-group">
                <div className="form-label-with-toggle">
                  <label>Context (optional)</label>
                  <div className="input-mode-toggle">
                    <button
                      type="button"
                      className={`toggle-btn ${contextMode === 'json' ? 'active' : ''}`}
                      onClick={() => setContextMode('json')}
                    >
                      JSON
                    </button>
                    <button
                      type="button"
                      className={`toggle-btn ${contextMode === 'note' ? 'active' : ''}`}
                      onClick={() => setContextMode('note')}
                    >
                      Note
                    </button>
                    <button
                      type="button"
                      className={`toggle-btn ${contextMode === 'file' ? 'active' : ''}`}
                      onClick={() => setContextMode('file')}
                    >
                      File
                    </button>
                  </div>
                </div>

                {contextMode === 'json' && (
                  <>
                    <textarea
                      id="context"
                      value={contextInput}
                      onChange={(e) => setContextInput(e.target.value)}
                      placeholder='{"key": "value"}'
                      rows={6}
                    />
                    <small>Additional context as JSON (e.g., user preferences, data)</small>
                  </>
                )}

                {contextMode === 'note' && (
                  <div className="context-note-picker">
                    <input
                      type="text"
                      className="note-search-input"
                      value={noteSearchQuery}
                      onChange={(e) => setNoteSearchQuery(e.target.value)}
                      placeholder="Search notes..."
                    />
                    {noteSearchResults.length > 0 && (
                      <div className="note-search-results">
                        {noteSearchResults
                          .filter((n) => !attachedNotes.some((a) => a.noteId === n.noteId))
                          .slice(0, 5)
                          .map((note) => (
                            <button
                              key={note.noteId}
                              type="button"
                              className="note-search-result"
                              onClick={() => handleAttachNote(note)}
                            >
                              <span className="note-result-title">{note.title}</span>
                              <span className="note-result-preview">
                                {stripHtml(note.contentHtml).slice(0, 80)}
                              </span>
                            </button>
                          ))}
                      </div>
                    )}
                    {attachedNotes.length > 0 && (
                      <div className="attached-items">
                        {attachedNotes.map((note) => (
                          <div key={note.noteId} className="attached-item">
                            <span className="attached-item-name">{note.title}</span>
                            <button
                              type="button"
                              className="attached-item-remove"
                              onClick={() => handleRemoveNote(note.noteId)}
                            >
                              x
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <small>Search and attach notes as context for this run</small>
                  </div>
                )}

                {contextMode === 'file' && (
                  <div className="context-file-upload">
                    <div
                      className={`context-drop-zone ${isDragging ? 'dragging' : ''}`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <p className="drop-zone-text">
                        {isDragging ? 'Drop your file here' : 'Click to upload or drag and drop'}
                      </p>
                      <p className="drop-zone-hint">JSON (.json) or Markdown (.md) up to 5MB</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,.md,.markdown"
                        multiple
                        onChange={(e) => {
                          void handleFileSelect(e.target.files)
                          if (fileInputRef.current) fileInputRef.current.value = ''
                        }}
                        style={{ display: 'none' }}
                      />
                    </div>
                    {uploadedFiles.length > 0 && (
                      <div className="attached-items">
                        {uploadedFiles.map((file) => (
                          <div key={file.name} className="attached-item">
                            <span className="attached-item-badge">
                              {file.type === 'json' ? 'JSON' : 'MD'}
                            </span>
                            <span className="attached-item-name">{file.name}</span>
                            <button
                              type="button"
                              className="attached-item-remove"
                              onClick={() => handleRemoveFile(file.name)}
                            >
                              x
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <small>Upload JSON or Markdown files as context</small>
                  </div>
                )}

                {(attachedNotes.length > 0 || uploadedFiles.length > 0) &&
                  contextMode === 'json' && (
                    <small className="context-summary">
                      Also attached:{' '}
                      {attachedNotes.length > 0 ? `${attachedNotes.length} note(s)` : ''}
                      {attachedNotes.length > 0 && uploadedFiles.length > 0 ? ', ' : ''}
                      {uploadedFiles.length > 0 ? `${uploadedFiles.length} file(s)` : ''}
                    </small>
                  )}
              </div>

              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={skipResearch}
                    onChange={(e) => setSkipResearch(e.target.checked)}
                  />
                  Skip research (use only provided context)
                </label>
                <small>
                  When enabled, agents won't use search tools and will reason from context only
                </small>
              </div>

              {isDeepResearch && (
                <div className="form-group deep-research-config">
                  <label>Deep Research Configuration</label>
                  <div className="dr-config-grid">
                    <div className="dr-config-item">
                      <label htmlFor="drBudget">Budget (USD)</label>
                      <select
                        id="drBudget"
                        value={drBudget}
                        onChange={(e) => setDrBudget(Number(e.target.value))}
                      >
                        <option value={1}>$1 (Quick scan)</option>
                        <option value={5}>$5 (Standard)</option>
                        <option value={10}>$10 (Thorough)</option>
                        <option value={25}>$25 (Deep)</option>
                        <option value={50}>$50 (Exhaustive)</option>
                      </select>
                    </div>
                    <div className="dr-config-item">
                      <label htmlFor="drSearchDepth">Search Depth</label>
                      <select
                        id="drSearchDepth"
                        value={drSearchDepth}
                        onChange={(e) =>
                          setDrSearchDepth(e.target.value as 'shallow' | 'standard' | 'deep')
                        }
                      >
                        <option value="shallow">Shallow (fewer sources)</option>
                        <option value="standard">Standard</option>
                        <option value="deep">Deep (more sources)</option>
                      </select>
                    </div>
                    <div className="dr-config-item">
                      <label htmlFor="drGapIterations">Research Loops (1-10)</label>
                      <input
                        id="drGapIterations"
                        type="number"
                        min={1}
                        max={10}
                        value={drMaxGapIterations}
                        onChange={(e) =>
                          setDrMaxGapIterations(
                            Math.min(10, Math.max(1, Number(e.target.value) || 3))
                          )
                        }
                      />
                      <small>How many search-extract-analyze iterations</small>
                    </div>
                    <div className="dr-config-item">
                      <label htmlFor="drDialecticalCycles">Reasoning Cycles (1-5)</label>
                      <input
                        id="drDialecticalCycles"
                        type="number"
                        min={1}
                        max={5}
                        value={drMaxDialecticalCycles}
                        onChange={(e) =>
                          setDrMaxDialecticalCycles(
                            Math.min(5, Math.max(1, Number(e.target.value) || 2))
                          )
                        }
                      />
                      <small>How many dialectical cycles per loop</small>
                    </div>
                    <div className="dr-config-item">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={drIncludeAcademic}
                          onChange={(e) => setDrIncludeAcademic(e.target.checked)}
                        />
                        Include academic search (Google Scholar)
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label htmlFor="memoryMessageLimit">Context Budget (optional)</label>
                <input
                  id="memoryMessageLimit"
                  type="number"
                  min={1}
                  max={200}
                  value={memoryMessageLimitInput}
                  onChange={(e) => setMemoryMessageLimitInput(e.target.value)}
                  placeholder={memoryLimitPlaceholder}
                />
                <small>
                  Number of recent messages to include when resuming runs (1-200). Overrides
                  workflow and global defaults.
                </small>
              </div>

              <div className="modal-actions">
                <Button variant="ghost" type="button" onClick={onClose} disabled={isCreating}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? 'Starting...' : 'Start Run'}
                </Button>
              </div>
            </form>
          </div>

          {showResearchQueue && resumeRunId && (
            <ResearchQueueSidebar
              workflowId={workflow.workflowId}
              runId={resumeRunId}
              onOpenFullQueue={() => {
                navigate(`/agents/research?workflowId=${workflow.workflowId}`)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
