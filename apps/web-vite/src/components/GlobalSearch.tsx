import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { useContacts } from '@/hooks/useContacts'
import { useNoteOperations } from '@/hooks/useNoteOperations'
import { useWorkflowOperations } from '@/hooks/useWorkflowOperations'
import { CIRCLE_LABELS } from '@lifeos/agents'
import type { DunbarCircle } from '@lifeos/agents'

type SearchResultType = 'task' | 'project' | 'chapter' | 'note' | 'contact' | 'workflow'

type SearchResult = {
  type: SearchResultType
  id: string
  title: string
  context?: string
  meta?: string
}

const TYPE_ICONS: Record<SearchResultType, string> = {
  task: 'T',
  project: 'P',
  chapter: 'Ch',
  note: 'N',
  contact: 'C',
  workflow: 'W',
}

const TYPE_LABELS: Record<SearchResultType, string> = {
  task: 'Tasks',
  project: 'Projects',
  chapter: 'Chapters',
  note: 'Notes',
  contact: 'Contacts',
  workflow: 'Workflows',
}

export function GlobalSearch() {
  const { user, loading: authLoading } = useAuth()
  const userId = user?.uid ?? ''
  const navigate = useNavigate()
  const { projects, chapters, tasks, loadData } = useTodoOperations({ userId })
  const { contacts } = useContacts()
  const { notes } = useNoteOperations()
  const { workflows } = useWorkflowOperations()

  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('lifeos-recent-searches') || '[]')
    } catch {
      return []
    }
  })

  const addRecentSearch = useCallback(
    (q: string) => {
      const updated = [q, ...recentSearches.filter((s) => s !== q)].slice(0, 5)
      setRecentSearches(updated)
      localStorage.setItem('lifeos-recent-searches', JSON.stringify(updated))
    },
    [recentSearches]
  )

  // Load planner data once on mount
  useEffect(() => {
    if (!authLoading && userId && userId.trim() !== '') {
      void loadData()
    }
  }, [userId, loadData, authLoading])

  const results = useMemo(() => {
    if (!query.trim()) return []
    const q = query.toLowerCase()
    const all: SearchResult[] = []
    const projectById = new Map(projects.map((p) => [p.id, p]))

    // Tasks
    tasks.forEach((t) => {
      if (t.title.toLowerCase().includes(q)) {
        const projectTitle = t.projectId ? projectById.get(t.projectId)?.title : undefined
        all.push({ type: 'task', id: t.id, title: t.title, meta: projectTitle })
      }
    })

    // Projects
    projects.forEach((p) => {
      if (p.title.toLowerCase().includes(q)) {
        all.push({ type: 'project', id: p.id, title: p.title })
      }
    })

    // Chapters
    chapters.forEach((c) => {
      if (c.title.toLowerCase().includes(q)) {
        all.push({ type: 'chapter', id: c.id, title: c.title })
      }
    })

    // Notes
    notes.forEach((n) => {
      if (n.title?.toLowerCase().includes(q)) {
        all.push({ type: 'note', id: n.noteId, title: n.title })
      }
    })

    // Contacts
    contacts.forEach((c) => {
      const name = `${c.firstName || ''} ${c.lastName || ''}`.trim()
      if (name.toLowerCase().includes(q) || c.emails?.some((e) => e.toLowerCase().includes(q))) {
        all.push({
          type: 'contact',
          id: c.contactId,
          title: name || '(unnamed)',
          meta: CIRCLE_LABELS[c.circle as DunbarCircle],
        })
      }
    })

    // Workflows
    workflows.forEach((w) => {
      if (w.name?.toLowerCase().includes(q)) {
        all.push({ type: 'workflow', id: w.workflowId, title: w.name })
      }
    })

    return all.slice(0, 20)
  }, [query, tasks, projects, chapters, notes, contacts, workflows])

  const groupedResults = useMemo(() => {
    const groups = new Map<SearchResultType, SearchResult[]>()
    for (const result of results) {
      const existing = groups.get(result.type) || []
      existing.push(result)
      groups.set(result.type, existing)
    }
    return groups
  }, [results])

  // Compute flat index for keyboard nav across groups
  const flatIndex = useCallback(
    (type: SearchResultType, indexInGroup: number) => {
      let offset = 0
      for (const [groupType, items] of groupedResults.entries()) {
        if (groupType === type) return offset + indexInGroup
        offset += items.length
      }
      return -1
    },
    [groupedResults]
  )

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setIsOpen(false)
      if (query.trim()) addRecentSearch(query)
      setQuery('')

      switch (result.type) {
        case 'task':
          navigate(`/planner?taskId=${result.id}`)
          break
        case 'project':
          navigate(`/planner?projectId=${result.id}`)
          break
        case 'chapter':
          navigate(`/planner?chapterId=${result.id}`)
          break
        case 'note':
          navigate(`/notes?noteId=${result.id}`)
          break
        case 'contact':
          navigate(`/people?contactId=${result.id}`)
          break
        case 'workflow':
          navigate(`/workflows/${result.id}`)
          break
      }
    },
    [navigate, query, addRecentSearch]
  )

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd+K / Ctrl+K to open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setIsOpen(true)
        return
      }

      if (!isOpen) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActiveIndex((i) => Math.min(i + 1, results.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setActiveIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (activeIndex >= 0 && activeIndex < results.length) {
            handleSelect(results[activeIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          setIsOpen(false)
          setQuery('')
          inputRef.current?.blur()
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, activeIndex, results, handleSelect])

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

  return (
    <div className="global-search" ref={wrapperRef}>
      <span className="global-search__icon" aria-hidden="true">
        🔍
      </span>
      <input
        ref={inputRef}
        type="text"
        className="global-search__input"
        placeholder="Search tasks, notes, contacts..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActiveIndex(-1)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
      />
      <span className="global-search__hint" aria-hidden="true">
        ⌘K
      </span>

      {/* Recent searches */}
      {isOpen && !query.trim() && recentSearches.length > 0 && (
        <div className="search-results">
          <div className="search-results__group">
            <div className="search-results__group-header">
              <span className="search-results__group-label">Recent</span>
            </div>
            {recentSearches.map((q) => (
              <button
                key={q}
                className="search-result"
                onClick={() => {
                  setQuery(q)
                  setIsOpen(true)
                }}
              >
                <span className="search-result__icon">R</span>
                <span className="search-result__title">{q}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grouped results */}
      {isOpen && results.length > 0 && (
        <div className="search-results">
          {Array.from(groupedResults.entries()).map(([type, items]) => (
            <div key={type} className="search-results__group">
              <div className="search-results__group-header">
                <span className="search-results__group-label">{TYPE_LABELS[type]}</span>
                <span className="search-results__group-count">{items.length}</span>
              </div>
              {items.map((result, i) => (
                <button
                  key={result.id}
                  className={`search-result${flatIndex(type, i) === activeIndex ? ' search-result--active' : ''}`}
                  onClick={() => handleSelect(result)}
                >
                  <span className="search-result__icon">{TYPE_ICONS[result.type]}</span>
                  <span className="search-result__title">{result.title}</span>
                  {result.meta && <span className="search-result__meta">{result.meta}</span>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
