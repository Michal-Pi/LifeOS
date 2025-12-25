import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import type { CanonicalProject, CanonicalMilestone, CanonicalTask } from '@/types/todo'

type SearchResult = 
  | { type: 'project'; item: CanonicalProject; context?: string }
  | { type: 'milestone'; item: CanonicalMilestone; context?: string }
  | { type: 'task'; item: CanonicalTask; context?: string }

export function GlobalSearch() {
  const { user } = useAuth()
  const userId = user?.uid ?? ''
  const navigate = useNavigate()
  const { projects, milestones, tasks, loadData } = useTodoOperations({ userId })
  
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Load data once on mount to ensure search index is ready
  // In a real app, this might be too heavy and we'd rely on a dedicated search index or context
  useEffect(() => {
    if (userId) {
      void loadData()
    }
  }, [userId, loadData])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const lowerQuery = query.toLowerCase()
    const newResults: SearchResult[] = []
    const projectById = new Map(projects.map(project => [project.id, project]))
    const milestoneById = new Map(milestones.map(milestone => [milestone.id, milestone]))

    // Search Projects
    projects.forEach(p => {
      if (p.title.toLowerCase().includes(lowerQuery)) {
        newResults.push({ type: 'project', item: p })
      }
    })

    // Search Milestones
    milestones.forEach(m => {
      if (m.title.toLowerCase().includes(lowerQuery)) {
        newResults.push({ type: 'milestone', item: m })
      }
    })

    // Search Tasks
    tasks.forEach(t => {
      const taskMatch = t.title.toLowerCase().includes(lowerQuery)
      const projectMatch = t.projectId
        ? projectById.get(t.projectId)?.title.toLowerCase().includes(lowerQuery)
        : false
      const milestoneMatch = t.milestoneId
        ? milestoneById.get(t.milestoneId)?.title.toLowerCase().includes(lowerQuery)
        : false

      if (taskMatch || projectMatch || milestoneMatch) {
        const projectTitle = t.projectId ? projectById.get(t.projectId)?.title : undefined
        const milestoneTitle = t.milestoneId ? milestoneById.get(t.milestoneId)?.title : undefined
        const contextParts = [projectTitle, milestoneTitle].filter(Boolean)
        newResults.push({
          type: 'task',
          item: t,
          context: contextParts.length > 0 ? contextParts.join(' / ') : undefined
        })
      }
    })

    return newResults.slice(0, 10)
  }, [query, projects, milestones, tasks])

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (result: SearchResult) => {
    setIsOpen(false)
    setQuery('')
    
    // Navigate based on type
    // For now, we just go to the Todo page with a query param or state
    // Ideally, TodoPage would read these params to open the item
    if (result.type === 'task') {
      navigate(`/todo?taskId=${result.item.id}`)
    } else if (result.type === 'project') {
      navigate(`/todo?projectId=${result.item.id}`)
    } else if (result.type === 'milestone') {
      navigate(`/todo?milestoneId=${result.item.id}`)
    }
  }

  return (
    <div className="global-search" ref={wrapperRef}>
      <input
        type="text"
        placeholder="Search..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
      />
      
      {isOpen && results.length > 0 && (
        <ul className="search-results">
          {results.map((result) => (
            <li key={`${result.type}-${result.item.id}`} onClick={() => handleSelect(result)}>
              <span className="result-type">{result.type}</span>
              <span className="result-title">{result.item.title}</span>
              {result.context && <span className="result-context">{result.context}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
