/**
 * useGoogleSuggestions Hook
 *
 * Provides suggestions for event creation.
 * NOTE: This is a mock implementation. A real implementation would call a Google API.
 */
import { useState, useCallback } from 'react'

interface Suggestion {
  id: string
  label: string
}

interface UseGoogleSuggestionsResult {
  suggestions: Suggestion[]
  loading: boolean
  fetchSuggestions: (query: string) => Promise<void>
}

const MOCK_SUGGESTIONS: Suggestion[] = [
  { id: '1', label: 'Team Meeting' },
  { id: '2', label: 'Project Sync' },
  { id: '3', label: '1:1 with John Doe' },
  { id: '4', label: 'Design Review' },
  { id: '5', label: 'Lunch with the team' },
]

export function useGoogleSuggestions(): UseGoogleSuggestionsResult {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)

  const fetchSuggestions = useCallback(async (query: string) => {
    if (!query) {
      setSuggestions([])
      return
    }

    setLoading(true)
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500))

    const filteredSuggestions = MOCK_SUGGESTIONS.filter((s) =>
      s.label.toLowerCase().includes(query.toLowerCase())
    )
    setSuggestions(filteredSuggestions)
    setLoading(false)
  }, [])

  return {
    suggestions,
    loading,
    fetchSuggestions,
  }
}
