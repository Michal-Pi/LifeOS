import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import type { CanonicalProject, CanonicalChapter, CanonicalTask } from '@/types/todo'

type SearchResult =
  | { type: 'project'; item: CanonicalProject; context?: string }
  | { type: 'chapter'; item: CanonicalChapter; context?: string }
  | { type: 'task'; item: CanonicalTask; context?: string }

export function GlobalSearch() {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.uid ?? ''
  const navigate = useNavigate()
  const { projects, chapters, tasks, loadData } = useTodoOperations({ userId })

  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Load data once on mount to ensure search index is ready
  // In a real app, this might be too heavy and we'd rely on a dedicated search index or context
  useEffect(() => {
    // Wait for auth to finish loading and ensure we have a valid userId
    if (!authLoading && userId && userId.trim() !== '') {
      void loadData()
    }
  }, [userId, loadData, authLoading])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const lowerQuery = query.toLowerCase()
    const newResults: SearchResult[] = []
    const projectById = new Map(projects.map((project) => [project.id, project]))
    const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter]))

    // Search Projects
    projects.forEach((p) => {
      if (p.title.toLowerCase().includes(lowerQuery)) {
        newResults.push({ type: 'project', item: p })
      }
    })

    // Search Chapters
    chapters.forEach((m) => {
      if (m.title.toLowerCase().includes(lowerQuery)) {
        newResults.push({ type: 'chapter', item: m })
      }
    })

    // Search Tasks
    tasks.forEach((t) => {
      const taskMatch = t.title.toLowerCase().includes(lowerQuery)
      const projectMatch = t.projectId
        ? projectById.get(t.projectId)?.title.toLowerCase().includes(lowerQuery)
        : false
      const chapterMatch = t.chapterId
        ? chapterById.get(t.chapterId)?.title.toLowerCase().includes(lowerQuery)
        : false

      if (taskMatch || projectMatch || chapterMatch) {
        const projectTitle = t.projectId ? projectById.get(t.projectId)?.title : undefined
        const chapterTitle = t.chapterId ? chapterById.get(t.chapterId)?.title : undefined
        const contextParts = [projectTitle, chapterTitle].filter(Boolean)
        newResults.push({
          type: 'task',
          item: t,
          context: contextParts.length > 0 ? contextParts.join(' / ') : undefined,
        })
      }
    })

    return newResults.slice(0, 10)
  }, [query, projects, chapters, tasks])

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
    // For now, we just go to the Planner page with a query param or state
    // Ideally, PlannerPage would read these params to open the item
    if (result.type === 'task') {
      navigate(`/planner?taskId=${result.item.id}`)
    } else if (result.type === 'project') {
      navigate(`/planner?projectId=${result.item.id}`)
    } else if (result.type === 'chapter') {
      navigate(`/planner?chapterId=${result.item.id}`)
    }
  }

  return (
    <div className="global-search" ref={wrapperRef}>
      <span className="global-search__icon" aria-hidden="true">
        🔍
      </span>
      <input
        type="text"
        className="global-search__input"
        placeholder="Search tasks, events, notes..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
      />
      <span className="global-search__hint" aria-hidden="true">
        ⌘K
      </span>

      {isOpen && results.length > 0 && (
        <ul className="search-results">
          {results.map((result) => (
            <li key={`${result.type}-${result.item.id}`} onClick={() => handleSelect(result)}>
              <span className="result-type">
                {result.type === 'chapter' ? 'chapter' : result.type}
              </span>
              <span className="result-title">{result.item.title}</span>
              {result.context && <span className="result-context">{result.context}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
