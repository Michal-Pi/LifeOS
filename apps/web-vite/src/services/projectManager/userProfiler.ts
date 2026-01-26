import type { ProjectManagerRepository, UserProfile } from '@lifeos/agents'

export async function updateProfileFromInteraction(
  userId: string,
  interaction: {
    questionsAsked: number
    questionsAnswered: number
    expertCouncilUsed: boolean
    decisionsMade: number
    satisfactionRating?: number
  },
  repository: ProjectManagerRepository
): Promise<UserProfile> {
  let profile = await repository.getProfile(userId)
  if (!profile) {
    profile = await repository.createProfile(userId)
  }

  const totalInteractions = profile.totalInteractions + 1
  const avgQuestions =
    (profile.averageQuestionsPerSession * profile.totalInteractions + interaction.questionsAsked) /
    totalInteractions

  const councilUsageRate =
    (profile.expertCouncilUsageRate * profile.totalInteractions +
      (interaction.expertCouncilUsed ? 1 : 0)) /
    totalInteractions

  const satisfactionScore =
    interaction.satisfactionRating !== undefined
      ? (profile.satisfactionScore * profile.totalInteractions + interaction.satisfactionRating) /
        totalInteractions
      : profile.satisfactionScore

  const expertiseLevel = inferExpertiseLevel({
    avgQuestions,
    councilUsageRate,
    totalInteractions,
  })

  return repository.updateProfile(userId, {
    totalInteractions,
    averageQuestionsPerSession: avgQuestions,
    expertCouncilUsageRate: councilUsageRate,
    satisfactionScore,
    expertiseLevel,
    updatedAtMs: Date.now(),
  })
}

export function inferExpertiseLevel(data: {
  avgQuestions: number
  councilUsageRate: number
  totalInteractions: number
}): 'beginner' | 'intermediate' | 'expert' {
  if (data.totalInteractions < 5) return 'beginner'
  if (data.avgQuestions < 3 && data.councilUsageRate < 0.3) return 'expert'
  if (data.avgQuestions < 5 && data.councilUsageRate < 0.5) return 'intermediate'
  return 'beginner'
}
