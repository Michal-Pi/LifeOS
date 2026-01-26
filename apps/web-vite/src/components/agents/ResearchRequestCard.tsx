import type { DeepResearchRequest } from '@lifeos/agents'
import styles from './ResearchQueue.module.css'

interface ResearchRequestCardProps {
  request: DeepResearchRequest
  isActive: boolean
  onSelect: () => void
}

const formatPriority = (priority: DeepResearchRequest['priority']) => {
  return priority[0].toUpperCase() + priority.slice(1)
}

export function ResearchRequestCard({ request, isActive, onSelect }: ResearchRequestCardProps) {
  return (
    <button
      type="button"
      className={`${styles['research-queue-item']} ${isActive ? styles['is-active'] : ''}`}
      onClick={onSelect}
    >
      <div className={styles['research-queue-item__title']}>
        {request.topic}
        <span
          className={`${styles['research-priority']} ${
            styles[`research-priority--${request.priority}`]
          }`}
        >
          {formatPriority(request.priority)}
        </span>
      </div>
      <div className={styles['research-queue-item__meta']}>
        {request.questions.length} questions - {request.status.replace('_', ' ')}
      </div>
    </button>
  )
}
