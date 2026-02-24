/**
 * useContactDedup — hook for managing duplicate detection and merge state.
 */

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { findDuplicateContacts, mergeContacts } from '@/lib/contactDedup'
import type { DuplicateCandidate, MergeContactsResult, ContactId } from '@lifeos/agents'

export interface UseContactDedupResult {
  candidates: DuplicateCandidate[]
  totalScanned: number
  scanDurationMs: number
  scanning: boolean
  scanError: string | null
  scan: (minScore?: number) => Promise<void>
  merging: boolean
  mergeError: string | null
  merge: (primaryId: ContactId, secondaryIds: ContactId[]) => Promise<MergeContactsResult>
  dismissCandidate: (contactIdA: ContactId, contactIdB: ContactId) => void
}

export function useContactDedup(): UseContactDedupResult {
  const [candidates, setCandidates] = useState<DuplicateCandidate[]>([])
  const [totalScanned, setTotalScanned] = useState(0)
  const [scanDurationMs, setScanDurationMs] = useState(0)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  const [merging, setMerging] = useState(false)
  const [mergeError, setMergeError] = useState<string | null>(null)

  const scan = useCallback(async (minScore?: number) => {
    setScanning(true)
    setScanError(null)
    try {
      const result = await findDuplicateContacts(minScore)
      setCandidates(result.candidates)
      setTotalScanned(result.totalContactsScanned)
      setScanDurationMs(result.scanDurationMs)
    } catch (err) {
      setScanError((err as Error).message || 'Failed to scan for duplicates')
    } finally {
      setScanning(false)
    }
  }, [])

  const merge = useCallback(
    async (primaryId: ContactId, secondaryIds: ContactId[]): Promise<MergeContactsResult> => {
      setMerging(true)
      setMergeError(null)
      try {
        const result = await mergeContacts({
          primaryContactId: primaryId,
          secondaryContactIds: secondaryIds,
        })
        // Remove merged candidates from the list
        setCandidates((prev) =>
          prev.filter(
            (c) =>
              !secondaryIds.includes(c.contactIdA) && !secondaryIds.includes(c.contactIdB)
          )
        )
        toast.success('Contacts merged', {
          description: `${result.secondariesRemoved} duplicate${result.secondariesRemoved > 1 ? 's' : ''} merged, ${result.interactionsMoved} interaction${result.interactionsMoved !== 1 ? 's' : ''} moved`,
        })
        return result
      } catch (err) {
        setMergeError((err as Error).message || 'Merge failed')
        throw err
      } finally {
        setMerging(false)
      }
    },
    []
  )

  const dismissCandidate = useCallback((contactIdA: ContactId, contactIdB: ContactId) => {
    const key = [contactIdA, contactIdB].sort().join('|')
    setCandidates((prev) =>
      prev.filter((c) => {
        const k = [c.contactIdA, c.contactIdB].sort().join('|')
        return k !== key
      })
    )
  }, [])

  return {
    candidates,
    totalScanned,
    scanDurationMs,
    scanning,
    scanError,
    scan,
    merging,
    mergeError,
    merge,
    dismissCandidate,
  }
}
