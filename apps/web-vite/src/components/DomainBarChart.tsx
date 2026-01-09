import type { Domain } from '@/types/todo'

interface DomainBarChartProps {
  domainSplit: Record<Domain, number> // percentages
}

const DOMAIN_COLORS: Record<Domain, string> = {
  work: 'var(--chart-work)',
  projects: 'var(--chart-projects)',
  life: 'var(--chart-life)',
  learning: 'var(--chart-learning)',
  wellbeing: 'var(--chart-wellbeing)',
}

const DOMAIN_LABELS: Record<Domain, string> = {
  work: 'Work',
  projects: 'Projects',
  life: 'Life',
  learning: 'Learning',
  wellbeing: 'Wellbeing',
}

export function DomainBarChart({ domainSplit }: DomainBarChartProps) {
  const domains: Domain[] = ['work', 'projects', 'life', 'learning', 'wellbeing']

  // Only show domains that have tasks
  const activeDomains = domains.filter((domain) => domainSplit[domain] > 0)

  if (activeDomains.length === 0) {
    return (
      <div className="domain-bar-chart-empty">
        <span className="empty-text">No tasks</span>
      </div>
    )
  }

  return (
    <div className="domain-bar-chart">
      <div className="domain-bar">
        {activeDomains.map((domain) => {
          const percentage = domainSplit[domain]
          if (percentage === 0) return null

          return (
            <div
              key={domain}
              className="domain-segment"
              style={{
                width: `${percentage}%`,
                backgroundColor: DOMAIN_COLORS[domain],
              }}
              title={`${DOMAIN_LABELS[domain]}: ${percentage}%`}
            />
          )
        })}
      </div>
      <div className="domain-legend">
        {activeDomains.map((domain) => (
          <div key={domain} className="domain-legend-item">
            <span className="domain-color-dot" style={{ backgroundColor: DOMAIN_COLORS[domain] }} />
            <span className="domain-legend-label">{DOMAIN_LABELS[domain]}</span>
            <span className="domain-legend-value">{domainSplit[domain]}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
