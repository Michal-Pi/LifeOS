/**
 * Phase 49 — Historical Calibration
 *
 * Queries completed todos from the past 90 days, calculates average task
 * duration and completion rate, and injects calibration data into planner
 * system prompts at runtime so time estimates are grounded in reality.
 */

export interface HistoricalEstimate {
  averageHoursPerTask: number
  completionRatePercent: number
  commonDelayReasons: string[]
  sampleSize: number
}

/**
 * Query completed todos for the last 90 days and compute calibration stats.
 * Returns null when fewer than 10 completed tasks exist (insufficient data).
 */
export async function getHistoricalCalibration(
  userId: string,
  firestore: FirebaseFirestore.Firestore
): Promise<HistoricalEstimate | null> {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const completedSnap = await firestore
    .collection(`users/${userId}/todos`)
    .where('status', '==', 'done')
    .where('completedAt', '>=', ninetyDaysAgo)
    .get()

  const totalSnap = await firestore
    .collection(`users/${userId}/todos`)
    .where('createdAt', '>=', ninetyDaysAgo)
    .get()

  const completedDocs = completedSnap.docs
  if (completedDocs.length < 10) return null

  let totalHours = 0
  let measurableCount = 0

  for (const doc of completedDocs) {
    const data = doc.data()
    const createdAt = data.createdAt?.toDate?.() ?? new Date(data.createdAt)
    const completedAt = data.completedAt?.toDate?.() ?? new Date(data.completedAt)
    const diffMs = completedAt.getTime() - createdAt.getTime()
    if (diffMs > 0) {
      totalHours += diffMs / (1000 * 60 * 60)
      measurableCount++
    }
  }

  const averageHoursPerTask = measurableCount > 0 ? Math.round((totalHours / measurableCount) * 10) / 10 : 0
  const completionRatePercent =
    totalSnap.docs.length > 0
      ? Math.round((completedDocs.length / totalSnap.docs.length) * 100)
      : 0

  // Derive common delay reasons from overdue tasks (estimated vs actual)
  const delayReasons: Record<string, number> = {}
  for (const doc of completedDocs) {
    const data = doc.data()
    if (data.estimatedMinutes && data.createdAt && data.completedAt) {
      const createdAt = data.createdAt?.toDate?.() ?? new Date(data.createdAt)
      const completedAt = data.completedAt?.toDate?.() ?? new Date(data.completedAt)
      const actualMinutes = (completedAt.getTime() - createdAt.getTime()) / (1000 * 60)
      if (actualMinutes > data.estimatedMinutes * 1.5) {
        const reason = data.category ?? 'general'
        delayReasons[reason] = (delayReasons[reason] ?? 0) + 1
      }
    }
  }

  const commonDelayReasons = Object.entries(delayReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason]) => reason)

  return {
    averageHoursPerTask,
    completionRatePercent,
    commonDelayReasons,
    sampleSize: completedDocs.length,
  }
}

/**
 * Inject historical calibration data into a planner system prompt.
 * Only applies when calibration data is present.
 */
export function injectHistoricalCalibration(
  systemPrompt: string,
  calibration?: HistoricalEstimate | null
): string {
  if (!calibration) return systemPrompt

  const sections: string[] = ['\n\nHISTORICAL CALIBRATION DATA:']
  sections.push(`- Average task completion time: ${calibration.averageHoursPerTask} hours`)
  sections.push(`- Task completion rate: ${calibration.completionRatePercent}%`)
  if (calibration.commonDelayReasons.length > 0) {
    sections.push(`- Common delays: ${calibration.commonDelayReasons.join(', ')}`)
  }
  sections.push(`- Based on ${calibration.sampleSize} past tasks`)
  sections.push(
    '\nUse this data to adjust time estimates. If the user typically underestimates, inflate estimates accordingly.'
  )

  return systemPrompt + sections.join('\n')
}
