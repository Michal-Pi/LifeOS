import { useState } from 'react'
import type { Conflict, UserProfile } from '@lifeos/agents'
import { ConflictResolutionPanel } from './ConflictResolutionPanel'
import './ProjectManagerChat.css'

type ClarificationQuestion = {
  questionId: string
  text: string
}

type DecisionOption = {
  optionId: string
  label: string
  description?: string
}

type ProjectManagerChatProps = {
  contextSummary?: string
  clarificationQuestions?: ClarificationQuestion[]
  decisionOptions?: DecisionOption[]
  conflicts?: Conflict[]
  profile?: UserProfile | null
  onAnswerQuestion?: (questionId: string, answer: string) => void
  onSelectDecision?: (optionId: string) => void
  onResolveConflict?: (conflict: Conflict) => void
  onRequestExpertCouncil?: () => void
  onRecordInteraction?: (interaction: {
    questionsAsked: number
    questionsAnswered: number
    expertCouncilUsed: boolean
    decisionsMade: number
    satisfactionRating?: number
  }) => Promise<void> | void
}

export function ProjectManagerChat({
  contextSummary,
  clarificationQuestions = [],
  decisionOptions = [],
  conflicts = [],
  profile,
  onAnswerQuestion,
  onSelectDecision,
  onResolveConflict,
  onRequestExpertCouncil,
  onRecordInteraction,
}: ProjectManagerChatProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(new Set())
  const [decisionsMadeCount, setDecisionsMadeCount] = useState(0)
  const [expertCouncilUsed, setExpertCouncilUsed] = useState(false)
  const [hasRecordedInteraction, setHasRecordedInteraction] = useState(false)

  const showRatingPrompt =
    !hasRecordedInteraction &&
    ((clarificationQuestions.length > 0 &&
      answeredQuestionIds.size >= clarificationQuestions.length) ||
      decisionsMadeCount > 0)

  const recordInteraction = async (rating?: number) => {
    if (hasRecordedInteraction || !onRecordInteraction) {
      setHasRecordedInteraction(true)
      return
    }
    await onRecordInteraction({
      questionsAsked: clarificationQuestions.length,
      questionsAnswered: answeredQuestionIds.size,
      expertCouncilUsed,
      decisionsMade: decisionsMadeCount,
      satisfactionRating: rating,
    })
    setHasRecordedInteraction(true)
  }

  return (
    <div className="pm-chat">
      <div className="pm-chat__main">
        {clarificationQuestions.length > 0 && (
          <section className="pm-section">
            <header className="pm-section__header">
              <h3>Clarification Questions</h3>
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setExpertCouncilUsed(true)
                  onRequestExpertCouncil?.()
                }}
              >
                Consult Expert Council
              </button>
            </header>
            <div className="pm-questions">
              {clarificationQuestions.map((question) => (
                <div key={question.questionId} className="pm-question-card">
                  <p>{question.text}</p>
                  <textarea
                    rows={3}
                    value={answers[question.questionId] ?? ''}
                    onChange={(event) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [question.questionId]: event.target.value,
                      }))
                    }
                    placeholder="Share your answer..."
                  />
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      const answer = answers[question.questionId] ?? ''
                      onAnswerQuestion?.(question.questionId, answer)
                      setAnsweredQuestionIds((prev) => new Set(prev).add(question.questionId))
                    }}
                  >
                    Submit answer
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {decisionOptions.length > 0 && (
          <section className="pm-section">
            <h3>Decision Options</h3>
            <div className="pm-options">
              {decisionOptions.map((option) => (
                <button
                  key={option.optionId}
                  type="button"
                  className="pm-option-card"
                  onClick={() => {
                    onSelectDecision?.(option.optionId)
                    setDecisionsMadeCount((prev) => prev + 1)
                  }}
                >
                  <strong>{option.label}</strong>
                  {option.description && <p>{option.description}</p>}
                </button>
              ))}
            </div>
          </section>
        )}

        <ConflictResolutionPanel
          conflicts={conflicts}
          onResolve={(conflict) => onResolveConflict?.(conflict)}
        />

        {showRatingPrompt && (
          <section className="pm-section">
            <h3>How helpful was this Project Manager session?</h3>
            <div className="pm-options">
              {[1, 2, 3, 4, 5].map((rating) => (
                <button
                  key={rating}
                  type="button"
                  className="pm-option-card"
                  onClick={() => void recordInteraction(rating)}
                >
                  {rating} Star{rating === 1 ? '' : 's'}
                </button>
              ))}
              <button
                type="button"
                className="ghost-button"
                onClick={() => void recordInteraction()}
              >
                Skip
              </button>
            </div>
          </section>
        )}
      </div>

      <aside className="pm-chat__sidebar">
        <div className="pm-section">
          <h3>Context Summary</h3>
          <pre>{contextSummary || 'No summary yet.'}</pre>
        </div>
        {profile && (
          <div className="pm-section">
            <h3>User Profile</h3>
            <div>
              <strong>Expertise:</strong> {profile.expertiseLevel}
            </div>
            <div>
              <strong>Avg questions:</strong> {profile.averageQuestionsPerSession.toFixed(1)}
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
