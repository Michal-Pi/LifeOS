import type { ConversationContext, UserProfile } from '@lifeos/agents'

export interface QuestioningStrategy {
  maxQuestions: number
  detailLevel: 'high-level' | 'detailed' | 'technical'
  questionTypes: Array<'what' | 'why' | 'how' | 'constraints' | 'assumptions'>
}

export function determineQuestioningStrategy(
  profile: UserProfile,
  context: ConversationContext
): QuestioningStrategy {
  void context
  const strategyMap: Record<UserProfile['expertiseLevel'], QuestioningStrategy> = {
    beginner: {
      maxQuestions: 8,
      detailLevel: 'high-level',
      questionTypes: ['what', 'why', 'constraints'],
    },
    intermediate: {
      maxQuestions: 5,
      detailLevel: 'detailed',
      questionTypes: ['what', 'how', 'constraints', 'assumptions'],
    },
    expert: {
      maxQuestions: 3,
      detailLevel: 'technical',
      questionTypes: ['constraints', 'assumptions'],
    },
  }

  return strategyMap[profile.expertiseLevel]
}
