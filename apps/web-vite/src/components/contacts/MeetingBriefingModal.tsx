/**
 * MeetingBriefingModal — AI-generated pre-meeting briefing for linked contacts.
 */

import { useState, useCallback, useEffect } from 'react'
import { createLogger } from '@lifeos/core'
import {
  getMeetingBriefing,
  type MeetingBriefing,
  type ContactBriefing,
} from '@/lib/contactAITools'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/Modal'
import '@/styles/components/MeetingBriefingModal.css'

const logger = createLogger('MeetingBriefingModal')

interface MeetingBriefingModalProps {
  isOpen: boolean
  onClose: () => void
  eventId: string
  eventTitle: string
  eventTime: string
}

export function MeetingBriefingModal({
  isOpen,
  onClose,
  eventId,
  eventTitle,
  eventTime,
}: MeetingBriefingModalProps) {
  const [briefing, setBriefing] = useState<MeetingBriefing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBriefing = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getMeetingBriefing(eventId)
      setBriefing(result)
    } catch (err) {
      logger.error('Failed to fetch meeting briefing:', err)
      setError((err as Error).message || 'Failed to generate briefing')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  // Fetch on mount when modal opens
  useEffect(() => {
    if (isOpen && !briefing && !loading && !error) {
      void fetchBriefing()
    }
  }, [isOpen, briefing, loading, error, fetchBriefing])

  return (
    <Modal open={isOpen} onClose={onClose} title={eventTitle} subtitle={eventTime} size="md" className="meeting-briefing-modal">
      {loading && (
        <div className="meeting-briefing-modal__loading">
          <p>Preparing your meeting briefing...</p>
        </div>
      )}

      {error && (
        <div className="meeting-briefing-modal__error">
          <p>{error}</p>
          <Button variant="ghost" className="small" onClick={fetchBriefing}>
            Retry
          </Button>
        </div>
      )}

      {briefing && (
        <div className="meeting-briefing-modal__body">
          {briefing.contactBriefings.map((cb: ContactBriefing) => (
            <div key={cb.contactId} className="meeting-briefing-modal__contact">
              <h3 className="meeting-briefing-modal__contact-name">{cb.displayName}</h3>
              <p className="meeting-briefing-modal__context">{cb.recentContext}</p>
              {cb.talkingPoints.length > 0 && (
                <ul className="meeting-briefing-modal__points">
                  {cb.talkingPoints.map((point, i) => (
                    <li key={i}>{point}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}

          {briefing.overallPrepNotes && (
            <div className="meeting-briefing-modal__prep">
              <h3 className="meeting-briefing-modal__prep-title">Preparation Notes</h3>
              <p>{briefing.overallPrepNotes}</p>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
