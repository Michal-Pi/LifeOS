/**
 * Habit Consistency Chart Component
 *
 * Visualizes weekly habit consistency with stacked bar charts.
 * Shows done/tiny/skip/missed breakdown for each habit.
 */

interface HabitConsistencyChartProps {
  stats: Array<{
    habit: { habitId: string; title: string }
    doneCount: number
    tinyCount: number
    skipCount: number
    missedCount: number
    consistencyPercent: number
  }>
}

export function HabitConsistencyChart({ stats }: HabitConsistencyChartProps) {
  if (stats.length === 0) {
    return (
      <div className="consistency-chart-empty">
        <p>No habit data for this week</p>
      </div>
    )
  }

  return (
    <div className="consistency-chart">
      {stats.map((stat) => (
        <div key={stat.habit.habitId} className="consistency-bar-container">
          <div className="habit-label" title={stat.habit.title}>
            {stat.habit.title}
          </div>

          <div
            className="consistency-bar"
            role="progressbar"
            aria-label={`${stat.habit.title} consistency`}
          >
            {stat.doneCount > 0 && (
              <div
                className="bar-segment done"
                style={{ width: `${(stat.doneCount / 7) * 100}%` }}
                title={`Done: ${stat.doneCount} days`}
              />
            )}
            {stat.tinyCount > 0 && (
              <div
                className="bar-segment tiny"
                style={{ width: `${(stat.tinyCount / 7) * 100}%` }}
                title={`Tiny: ${stat.tinyCount} days`}
              />
            )}
            {stat.skipCount > 0 && (
              <div
                className="bar-segment skip"
                style={{ width: `${(stat.skipCount / 7) * 100}%` }}
                title={`Skipped: ${stat.skipCount} days`}
              />
            )}
            {stat.missedCount > 0 && (
              <div
                className="bar-segment missed"
                style={{ width: `${(stat.missedCount / 7) * 100}%` }}
                title={`Missed: ${stat.missedCount} days`}
              />
            )}
          </div>

          <div
            className="consistency-percent"
            aria-label={`${stat.consistencyPercent}% consistent`}
          >
            {stat.consistencyPercent}%
          </div>
        </div>
      ))}

      <div className="consistency-legend">
        <div className="legend-item">
          <span className="legend-color done"></span>
          <span className="legend-label">Done</span>
        </div>
        <div className="legend-item">
          <span className="legend-color tiny"></span>
          <span className="legend-label">Tiny</span>
        </div>
        <div className="legend-item">
          <span className="legend-color skip"></span>
          <span className="legend-label">Skipped</span>
        </div>
        <div className="legend-item">
          <span className="legend-color missed"></span>
          <span className="legend-label">Missed</span>
        </div>
      </div>
    </div>
  )
}
