import type { CapabilitySnapshot, CapabilityRunRecord } from '@/hooks/evaluationWorkspaceTypes'

export function buildCapabilityFamilySummaries(records: CapabilityRunRecord[]) {
  const summaries = new Map<
    string,
    {
      taskFamily: string
      total: number
      passed: number
      avgScore: number | null
      holdout: number
      humanReview: number
    }
  >()

  for (const record of records) {
    const key = record.taskFamily ?? 'unassigned'
    const current = summaries.get(key) ?? {
      taskFamily: key,
      total: 0,
      passed: 0,
      avgScore: null,
      holdout: 0,
      humanReview: 0,
    }
    current.total += 1
    if (record.passed) current.passed += 1
    if (record.isHoldout) current.holdout += 1
    if (record.requiresHumanReview) current.humanReview += 1
    current.avgScore =
      typeof record.qualityScore === 'number'
        ? current.avgScore === null
          ? record.qualityScore
          : (current.avgScore * (current.total - 1) + record.qualityScore) / current.total
        : current.avgScore
    summaries.set(key, current)
  }

  return Array.from(summaries.values()).sort((left, right) =>
    left.taskFamily.localeCompare(right.taskFamily)
  )
}

export function buildCapabilitySnapshotDiffs(snapshots: CapabilitySnapshot[]) {
  return snapshots.map((snapshot, index) => {
    const previous = snapshots[index + 1] ?? null
    const previousMap = new Map(previous?.summary.map((item) => [item.taskFamily, item]) ?? [])
    const familyDiffs = snapshot.summary.map((item) => {
      const prev = previousMap.get(item.taskFamily)
      return {
        taskFamily: item.taskFamily,
        qualityDelta:
          typeof item.avgScore === 'number' && typeof prev?.avgScore === 'number'
            ? item.avgScore - prev.avgScore
            : null,
        passDelta: prev
          ? item.total > 0 && prev.total > 0
            ? item.passed / item.total - prev.passed / prev.total
            : null
          : null,
        humanReviewDelta: prev ? item.humanReview - prev.humanReview : null,
      }
    })

    return { snapshot, previous, familyDiffs }
  })
}
