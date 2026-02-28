/**
 * WorkflowPromptConfigSection
 *
 * Prompt configuration for agent prompts, tone of voice, and synthesis prompts.
 */

import { PromptSelector } from './PromptSelector'
import type { PromptConfigSectionProps } from './workflowFormConstants'

export function WorkflowPromptConfigSection({
  selectedAgentIds,
  agents,
  promptConfig,
  updateAgentPrompt,
  updateSynthesisPrompt,
  setPromptConfig,
  onEditPromptTemplate,
}: PromptConfigSectionProps) {
  return (
    <div className="form-section">
      <div className="section-label">Prompts (optional)</div>

      <div className="form-group">
        <label>Agent Prompts</label>
        {selectedAgentIds.map((agentId) => {
          const agent = agents.find((entry) => entry.agentId === agentId)
          return (
            <div key={agentId} className="prompt-config-row">
              <span className="agent-prompt-name">{agent?.name ?? agentId}</span>
              <PromptSelector
                type="agent"
                value={promptConfig?.agentPrompts?.[agentId] ?? { type: 'custom' }}
                onChange={(ref) => updateAgentPrompt(agentId, ref)}
                onEditTemplate={onEditPromptTemplate}
                agentName={agent?.name}
              />
            </div>
          )
        })}
      </div>

      <div className="form-group">
        <label>Tone of Voice</label>
        <PromptSelector
          type="tone-of-voice"
          value={promptConfig?.toneOfVoicePrompt ?? { type: 'custom' }}
          onChange={(ref) =>
            setPromptConfig((prev) => ({
              ...prev,
              toneOfVoicePrompt: ref,
            }))
          }
          onEditTemplate={onEditPromptTemplate}
        />
      </div>

      <div className="form-group">
        <label>Synthesis Prompt</label>
        <PromptSelector
          type="synthesis"
          value={promptConfig?.synthesisPrompts?.default ?? { type: 'custom' }}
          onChange={(ref) => updateSynthesisPrompt('default', ref)}
          onEditTemplate={onEditPromptTemplate}
        />
      </div>
    </div>
  )
}
