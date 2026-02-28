/**
 * AI Tool Settings Page
 *
 * Allows users to customize AI tool configurations including prompts and models.
 */

import { useState } from 'react'
import { useAIToolSettings } from '@/hooks/useAIToolSettings'
import { useMailboxAIToolSettings } from '@/hooks/useMailboxAIToolSettings'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/Select'
import type { AIToolId, AIToolConfig, MailboxAIToolId, MailboxAIToolConfig } from '@lifeos/agents'
import { DEFAULT_AI_TOOLS, DEFAULT_MAILBOX_AI_TOOLS, ALL_MODEL_OPTIONS } from '@lifeos/agents'
import '@/styles/pages/AIToolSettingsPage.css'

const TOOL_ORDER: AIToolId[] = [
  'summarize',
  'factCheck',
  'linkedIn',
  'writeWithAI',
  'tagWithAI',
  'suggestNoteTags',
]

const MAILBOX_TOOL_ORDER: MailboxAIToolId[] = ['responseDraft', 'mailboxCleanup', 'senderResearch']

interface AIToolCardProps {
  tool: AIToolConfig
  onUpdate: (updates: Partial<AIToolConfig>) => Promise<void>
  onReset: () => Promise<void>
}

function AIToolCard({ tool, onUpdate, onReset }: AIToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [localPrompt, setLocalPrompt] = useState(tool.systemPrompt)
  const [localModel, setLocalModel] = useState(tool.modelName)
  const [localMaxTokens, setLocalMaxTokens] = useState(tool.maxTokens)
  const [hasChanges, setHasChanges] = useState(false)

  const defaultTool = DEFAULT_AI_TOOLS[tool.toolId]
  const isModified =
    tool.systemPrompt !== defaultTool.systemPrompt ||
    tool.modelName !== defaultTool.modelName ||
    tool.maxTokens !== defaultTool.maxTokens

  const handlePromptChange = (value: string) => {
    setLocalPrompt(value)
    setHasChanges(
      value !== tool.systemPrompt ||
        localModel !== tool.modelName ||
        localMaxTokens !== tool.maxTokens
    )
  }

  const handleModelChange = (value: string) => {
    setLocalModel(value)
    setHasChanges(
      localPrompt !== tool.systemPrompt ||
        value !== tool.modelName ||
        localMaxTokens !== tool.maxTokens
    )
  }

  const handleMaxTokensChange = (value: number) => {
    setLocalMaxTokens(value)
    setHasChanges(
      localPrompt !== tool.systemPrompt || localModel !== tool.modelName || value !== tool.maxTokens
    )
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onUpdate({
        systemPrompt: localPrompt,
        modelName: localModel,
        maxTokens: localMaxTokens,
      })
      setHasChanges(false)
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setLocalPrompt(tool.systemPrompt)
    setLocalModel(tool.modelName)
    setLocalMaxTokens(tool.maxTokens)
    setHasChanges(false)
  }

  const handleReset = async () => {
    if (!confirm(`Reset "${tool.name}" to default settings? Your customizations will be lost.`)) {
      return
    }
    setIsSaving(true)
    try {
      await onReset()
      setLocalPrompt(defaultTool.systemPrompt)
      setLocalModel(defaultTool.modelName)
      setLocalMaxTokens(defaultTool.maxTokens)
      setHasChanges(false)
    } catch (err) {
      console.error('Failed to reset:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleEnabled = async () => {
    await onUpdate({ enabled: !tool.enabled })
  }

  return (
    <div className={`ai-tool-card ${!tool.enabled ? 'disabled' : ''}`}>
      <div className="ai-tool-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="ai-tool-info">
          <div className="ai-tool-name">
            {tool.name}
            {isModified && <span className="modified-badge">Modified</span>}
          </div>
          <p className="ai-tool-description">{tool.description}</p>
        </div>
        <div className="ai-tool-controls">
          <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={tool.enabled} onChange={handleToggleEnabled} />
            <span className="toggle-slider"></span>
          </label>
          <button type="button" className="expand-btn" aria-label="Expand">
            {isExpanded ? '▼' : '▶'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="ai-tool-body">
          <div className="ai-tool-form-row">
            <div className="form-group">
              <label>Model</label>
              <Select
                value={localModel}
                onChange={handleModelChange}
                options={ALL_MODEL_OPTIONS}
                disabled={isSaving}
              />
            </div>
            <div className="form-group">
              <label>Max Tokens</label>
              <input
                type="number"
                value={localMaxTokens}
                onChange={(e) => handleMaxTokensChange(parseInt(e.target.value, 10) || 4096)}
                min={256}
                max={16384}
                step={256}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="form-group">
            <label>System Prompt</label>
            <textarea
              value={localPrompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              rows={12}
              disabled={isSaving}
              placeholder="Enter the system prompt for this tool..."
            />
            <span className="prompt-hint">
              This prompt defines how the AI behaves when executing this tool.
            </span>
          </div>

          <div className="ai-tool-actions">
            {isModified && (
              <Button variant="ghost" size="sm" onClick={handleReset} disabled={isSaving}>
                Reset to Default
              </Button>
            )}
            <div className="action-spacer" />
            {hasChanges && (
              <>
                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            )}
          </div>

          {tool.updatedAtMs && (
            <div className="ai-tool-updated">
              Last updated: {new Date(tool.updatedAtMs).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface MailboxAIToolCardProps {
  tool: MailboxAIToolConfig
  onUpdate: (updates: Partial<MailboxAIToolConfig>) => Promise<void>
  onReset: () => Promise<void>
}

function MailboxAIToolCard({ tool, onUpdate, onReset }: MailboxAIToolCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [localPrompt, setLocalPrompt] = useState(tool.systemPrompt)
  const [localModel, setLocalModel] = useState(tool.modelName)
  const [localMaxTokens, setLocalMaxTokens] = useState(tool.maxTokens)
  const [hasChanges, setHasChanges] = useState(false)

  const defaultTool = DEFAULT_MAILBOX_AI_TOOLS[tool.toolId]
  const isModified =
    tool.systemPrompt !== defaultTool.systemPrompt ||
    tool.modelName !== defaultTool.modelName ||
    tool.maxTokens !== defaultTool.maxTokens

  const handlePromptChange = (value: string) => {
    setLocalPrompt(value)
    setHasChanges(
      value !== tool.systemPrompt ||
        localModel !== tool.modelName ||
        localMaxTokens !== tool.maxTokens
    )
  }

  const handleModelChange = (value: string) => {
    setLocalModel(value)
    setHasChanges(
      localPrompt !== tool.systemPrompt ||
        value !== tool.modelName ||
        localMaxTokens !== tool.maxTokens
    )
  }

  const handleMaxTokensChange = (value: number) => {
    setLocalMaxTokens(value)
    setHasChanges(
      localPrompt !== tool.systemPrompt || localModel !== tool.modelName || value !== tool.maxTokens
    )
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onUpdate({
        systemPrompt: localPrompt,
        modelName: localModel,
        maxTokens: localMaxTokens,
      })
      setHasChanges(false)
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setLocalPrompt(tool.systemPrompt)
    setLocalModel(tool.modelName)
    setLocalMaxTokens(tool.maxTokens)
    setHasChanges(false)
  }

  const handleReset = async () => {
    if (!confirm(`Reset "${tool.name}" to default settings? Your customizations will be lost.`)) {
      return
    }
    setIsSaving(true)
    try {
      await onReset()
      setLocalPrompt(defaultTool.systemPrompt)
      setLocalModel(defaultTool.modelName)
      setLocalMaxTokens(defaultTool.maxTokens)
      setHasChanges(false)
    } catch (err) {
      console.error('Failed to reset:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleEnabled = async () => {
    await onUpdate({ enabled: !tool.enabled })
  }

  return (
    <div className={`ai-tool-card ${!tool.enabled ? 'disabled' : ''}`}>
      <div className="ai-tool-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="ai-tool-info">
          <div className="ai-tool-name">
            {tool.name}
            {isModified && <span className="modified-badge">Modified</span>}
          </div>
          <p className="ai-tool-description">{tool.description}</p>
        </div>
        <div className="ai-tool-controls">
          <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={tool.enabled} onChange={handleToggleEnabled} />
            <span className="toggle-slider"></span>
          </label>
          <button type="button" className="expand-btn" aria-label="Expand">
            {isExpanded ? '\u25BC' : '\u25B6'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="ai-tool-body">
          <div className="ai-tool-form-row">
            <div className="form-group">
              <label>Model</label>
              <Select
                value={localModel}
                onChange={handleModelChange}
                options={ALL_MODEL_OPTIONS}
                disabled={isSaving}
              />
            </div>
            <div className="form-group">
              <label>Max Tokens</label>
              <input
                type="number"
                value={localMaxTokens}
                onChange={(e) => handleMaxTokensChange(parseInt(e.target.value, 10) || 4096)}
                min={256}
                max={16384}
                step={256}
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="form-group">
            <label>System Prompt</label>
            <textarea
              value={localPrompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              rows={12}
              disabled={isSaving}
              placeholder="Enter the system prompt for this tool..."
            />
            <span className="prompt-hint">
              This prompt defines how the AI behaves when executing this tool.
            </span>
          </div>

          <div className="ai-tool-actions">
            {isModified && (
              <Button variant="ghost" size="sm" onClick={handleReset} disabled={isSaving}>
                Reset to Default
              </Button>
            )}
            <div className="action-spacer" />
            {hasChanges && (
              <>
                <Button variant="ghost" size="sm" onClick={handleCancel} disabled={isSaving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </>
            )}
          </div>

          {tool.updatedAtMs && (
            <div className="ai-tool-updated">
              Last updated: {new Date(tool.updatedAtMs).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AIToolSettingsPage() {
  const { settings, isLoading, error, updateTool, resetTool, resetAllTools } = useAIToolSettings()
  const {
    settings: mailboxSettings,
    isLoading: mailboxIsLoading,
    updateTool: updateMailboxTool,
    resetTool: resetMailboxTool,
    resetAllTools: resetAllMailboxTools,
  } = useMailboxAIToolSettings()
  const [isResetting, setIsResetting] = useState(false)

  const handleResetAll = async () => {
    if (!confirm('Reset all AI tools to default settings? This cannot be undone.')) {
      return
    }
    setIsResetting(true)
    try {
      await resetAllTools()
    } catch (err) {
      console.error('Failed to reset:', err)
    } finally {
      setIsResetting(false)
    }
  }

  const handleResetAllMailbox = async () => {
    if (!confirm('Reset all mailbox AI tools to default settings? This cannot be undone.')) {
      return
    }
    setIsResetting(true)
    try {
      await resetAllMailboxTools()
    } catch (err) {
      console.error('Failed to reset:', err)
    } finally {
      setIsResetting(false)
    }
  }

  if (isLoading || mailboxIsLoading) {
    return (
      <div className="ai-tool-settings-page">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading AI tool settings...</p>
        </div>
      </div>
    )
  }

  if (error || !settings) {
    return (
      <div className="ai-tool-settings-page">
        <div className="error-state">
          <h2>Failed to load settings</h2>
          <p>{error?.message || 'An unknown error occurred'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="ai-tool-settings-page">
      <div className="page-header">
        <div>
          <h1>AI Tools</h1>
          <p className="page-description">
            Customize the AI tools used for note analysis. Edit prompts, change models, and
            configure behavior.
          </p>
        </div>
        <Button variant="ghost" onClick={handleResetAll} disabled={isResetting}>
          {isResetting ? 'Resetting...' : 'Reset All to Defaults'}
        </Button>
      </div>

      <div className="ai-tools-list">
        {TOOL_ORDER.map((toolId) => {
          const tool = settings.tools[toolId]
          return (
            <AIToolCard
              key={toolId}
              tool={tool}
              onUpdate={(updates) => updateTool(toolId, updates)}
              onReset={() => resetTool(toolId)}
            />
          )
        })}
      </div>

      {/* Mailbox AI Tools Section */}
      {mailboxSettings && (
        <>
          <div className="section-header">
            <div>
              <h2>Mailbox AI Tools</h2>
              <p className="section-description">
                AI tools for the unified mailbox — draft replies, clean up messages, and research
                senders.
              </p>
            </div>
            <Button variant="ghost" onClick={handleResetAllMailbox} disabled={isResetting}>
              {isResetting ? 'Resetting...' : 'Reset All to Defaults'}
            </Button>
          </div>

          <div className="ai-tools-list">
            {MAILBOX_TOOL_ORDER.map((toolId) => {
              const tool = mailboxSettings.tools[toolId]
              return (
                <MailboxAIToolCard
                  key={toolId}
                  tool={tool}
                  onUpdate={(updates) => updateMailboxTool(toolId, updates)}
                  onReset={() => resetMailboxTool(toolId)}
                />
              )
            })}
          </div>
        </>
      )}

      <div className="info-card">
        <h3>About AI Tools</h3>
        <ul>
          <li>
            <strong>System Prompt</strong> defines the AI's behavior and personality for each tool
          </li>
          <li>
            <strong>Model</strong> determines which AI model processes the request
          </li>
          <li>
            <strong>Max Tokens</strong> limits the response length (higher = longer responses, more
            cost)
          </li>
          <li>
            <strong>Disabled tools</strong> will not appear in the AI Tools panel
          </li>
        </ul>
      </div>
    </div>
  )
}
