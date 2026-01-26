import { useEffect, useMemo, useState, useCallback } from 'react'
import type {
  PromptTemplate,
  PromptVariable,
  PromptVersion,
  PromptType,
  PromptCategory,
} from '@lifeos/agents'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { getFirestoreClient as getDb } from '@/lib/firestoreClient'
import { createFirestorePromptLibraryRepository } from '@/adapters/agents/firestorePromptLibraryRepository'
import { VersionHistoryPanel } from './VersionHistoryPanel'
import './PromptEditor.css'

type PromptEditorProps = {
  userId: string
  templateId?: string
  mode?: 'create' | 'edit'
  initialTemplate?: Partial<PromptTemplate>
  onClose: () => void
  onSaved?: (template: PromptTemplate) => void
  onDeleted?: (templateId: string) => void
}

const emptyVariable = (): PromptVariable => ({
  name: '',
  description: '',
  required: false,
  defaultValue: '',
  exampleValue: '',
})

const PROMPT_TYPES: PromptType[] = ['agent', 'tone-of-voice', 'workflow', 'tool', 'synthesis']
const PROMPT_CATEGORIES: PromptCategory[] = [
  'project-management',
  'content-creation',
  'research',
  'review',
  'coordination',
  'general',
]

export function PromptEditor({
  userId,
  templateId,
  mode = 'edit',
  initialTemplate,
  onClose,
  onSaved,
  onDeleted,
}: PromptEditorProps) {
  const repository = useMemo(() => createFirestorePromptLibraryRepository(), [])
  const [template, setTemplate] = useState<PromptTemplate | null>(null)
  const [content, setContent] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<PromptType>('agent')
  const [category, setCategory] = useState<PromptCategory>('general')
  const [tags, setTags] = useState('')
  const [variables, setVariables] = useState<PromptVariable[]>([])
  const [changeDescription, setChangeDescription] = useState('')
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const isCreateMode = mode === 'create'

  const loadTemplate = useCallback(async () => {
    if (!userId || !templateId || isCreateMode) return
    const data = await repository.get(userId, templateId)
    if (!data) return
    setTemplate(data)
    setContent(data.content)
    setName(data.name)
    setDescription(data.description)
    setType(data.type)
    setCategory(data.category)
    setTags(data.tags.join(', '))
    setVariables(data.variables)
  }, [isCreateMode, repository, templateId, userId])

  const loadVersions = useCallback(async () => {
    if (!userId || !templateId || isCreateMode) return
    const db = await getDb()
    const versionsRef = collection(db, `users/${userId}/promptLibrary/${templateId}/versions`)
    const snapshot = await getDocs(query(versionsRef, orderBy('version', 'desc')))
    const list = snapshot.docs.map((doc) => doc.data() as PromptVersion)
    setVersions(list)
  }, [isCreateMode, templateId, userId])

  useEffect(() => {
    if (isCreateMode) {
      const starter = initialTemplate ?? {}
      setTemplate(null)
      setContent(starter.content ?? '')
      setName(starter.name ?? '')
      setDescription(starter.description ?? '')
      setType((starter.type as PromptType) ?? 'agent')
      setCategory((starter.category as PromptCategory) ?? 'general')
      setTags(starter.tags ? starter.tags.join(', ') : '')
      setVariables(starter.variables ?? [])
      setVersions([])
      setChangeDescription('')
      return
    }
    void loadTemplate()
  }, [initialTemplate, isCreateMode, loadTemplate])

  useEffect(() => {
    void loadVersions()
  }, [loadVersions])

  const handleVariableChange = (index: number, updates: Partial<PromptVariable>) => {
    setVariables((prev) =>
      prev.map((variable, variableIndex) =>
        variableIndex === index ? { ...variable, ...updates } : variable
      )
    )
  }

  const handleSave = async () => {
    if (!userId) return
    setIsSaving(true)
    try {
      const tagList = tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
      if (isCreateMode) {
        const created = await repository.create(userId, {
          name: name.trim(),
          description: description.trim(),
          type,
          category,
          tags: tagList,
          content,
          variables,
        })
        setTemplate(created)
        onSaved?.(created)
        setChangeDescription('')
      } else if (template) {
        const updated = await repository.update(userId, template.templateId, {
          name: name.trim(),
          description: description.trim(),
          category,
          tags: tagList,
          content,
          variables,
          changeDescription: changeDescription.trim() || 'Updated prompt',
        })
        setTemplate(updated)
        onSaved?.(updated)
        setChangeDescription('')
        await loadVersions()
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleRestore = async (version: number) => {
    if (!template || isCreateMode) return
    const restored = await repository.restoreVersion(userId, template.templateId, version)
    setTemplate(restored)
    setContent(restored.content)
  }

  const handleDelete = async () => {
    if (!template || isCreateMode) return
    setIsDeleting(true)
    try {
      await repository.delete(userId, template.templateId)
      onDeleted?.(template.templateId)
      onClose()
    } finally {
      setIsDeleting(false)
    }
  }

  if (!template && !isCreateMode) {
    return (
      <div className="prompt-editor prompt-editor--loading">
        <p>Loading prompt...</p>
      </div>
    )
  }

  return (
    <div className="prompt-editor">
      <div className="prompt-editor__main">
        <div className="prompt-editor__header">
          <div>
            <input
              type="text"
              value={name}
              placeholder="Prompt Name"
              onChange={(event) => setName(event.target.value)}
            />
            <textarea
              value={description}
              placeholder="Description"
              rows={2}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="prompt-editor__actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Close
            </button>
            {!isCreateMode && (
              <button
                type="button"
                className="ghost-button danger"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
            <button type="button" className="primary-button" onClick={handleSave} disabled={isSaving}>
              {isCreateMode ? 'Create' : 'Save'}
            </button>
          </div>
        </div>

        <div className="prompt-editor__meta-grid">
          <label>
            <span>Type</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value as PromptType)}
              disabled={!isCreateMode}
            >
              {PROMPT_TYPES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as PromptCategory)}
              disabled={!isCreateMode}
            >
              {PROMPT_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label htmlFor="prompt-tags">Tags (comma separated)</label>
        <input
          id="prompt-tags"
          type="text"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />

        <textarea
          className="prompt-editor__content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Enter prompt content..."
          rows={18}
        />

        <div className="prompt-editor__variables">
          <div className="prompt-editor__variables-header">
            <h4>Variables</h4>
            <button type="button" className="ghost-button" onClick={() => setVariables((prev) => [...prev, emptyVariable()])}>
              + Add Variable
            </button>
          </div>
          {variables.map((variable, index) => (
            <div key={`${variable.name}-${index}`} className="prompt-editor__variable-row">
              <input
                type="text"
                placeholder="Name"
                value={variable.name}
                onChange={(event) => handleVariableChange(index, { name: event.target.value })}
              />
              <input
                type="text"
                placeholder="Description"
                value={variable.description}
                onChange={(event) => handleVariableChange(index, { description: event.target.value })}
              />
              <label>
                <input
                  type="checkbox"
                  checked={variable.required}
                  onChange={(event) => handleVariableChange(index, { required: event.target.checked })}
                />
                Required
              </label>
              <input
                type="text"
                placeholder="Default value"
                value={variable.defaultValue ?? ''}
                onChange={(event) => handleVariableChange(index, { defaultValue: event.target.value })}
              />
              <input
                type="text"
                placeholder="Example value"
                value={variable.exampleValue ?? ''}
                onChange={(event) => handleVariableChange(index, { exampleValue: event.target.value })}
              />
              <button
                type="button"
                className="ghost-button danger"
                onClick={() =>
                  setVariables((prev) => prev.filter((_, variableIndex) => variableIndex !== index))
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <label htmlFor="change-description">Change description</label>
        <input
          id="change-description"
          type="text"
          value={changeDescription}
          onChange={(event) => setChangeDescription(event.target.value)}
          placeholder="What changed?"
        />
      </div>

      <aside className="prompt-editor__sidebar">
        {!isCreateMode && <VersionHistoryPanel versions={versions} onRestore={handleRestore} />}
      </aside>
    </div>
  )
}
