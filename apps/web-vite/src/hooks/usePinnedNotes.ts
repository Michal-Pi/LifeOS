import { useState, useCallback, useEffect } from 'react'
import type { NoteId } from '@lifeos/notes'

const STORAGE_KEY = 'lifeos:pinned-notes'

function loadPinned(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set()
    return new Set(JSON.parse(raw) as string[])
  } catch {
    return new Set()
  }
}

function savePinned(ids: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]))
}

export function usePinnedNotes() {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(loadPinned)

  useEffect(() => {
    savePinned(pinnedIds)
  }, [pinnedIds])

  const togglePin = useCallback((noteId: NoteId | string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev)
      if (next.has(noteId)) {
        next.delete(noteId)
      } else {
        next.add(noteId)
      }
      return next
    })
  }, [])

  const isPinned = useCallback((noteId: NoteId | string) => pinnedIds.has(noteId), [pinnedIds])

  return { pinnedIds, togglePin, isPinned }
}
