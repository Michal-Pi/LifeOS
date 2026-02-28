/**
 * @fileoverview Public booking page for scheduling links.
 *
 * Accessible at /schedule/:slug without authentication.
 * 4-step flow: loading → select-time → confirm-details → success
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { DatePicker } from '@/components/scheduling/DatePicker'
import { TimeSlotList } from '@/components/scheduling/TimeSlotList'
import { DurationSelector } from '@/components/scheduling/DurationSelector'
import { BookingForm } from '@/components/scheduling/BookingForm'
import { BookingConfirmation } from '@/components/scheduling/BookingConfirmation'

interface PublicLinkData {
  title: string
  description?: string
  durations: number[]
  defaultDuration: number
  timezone: string
  maxDaysAhead: number
  location?: string
  branding?: { accentColor?: string; welcomeMessage?: string }
  availability: Record<string, Array<{ start: string; end: string }>>
}

interface TimeSlot {
  startMs: number
  endMs: number
}

interface BookingResult {
  bookingId: string
  startTime: string
  endTime: string
  title: string
  location?: string
  conferenceLink?: string | null
}

type Step = 'loading' | 'select-time' | 'confirm-details' | 'success' | 'error'

const FUNCTIONS_URL = import.meta.env.VITE_FUNCTIONS_URL || ''

/**
 * Map WeeklyAvailability to an array of available day-of-week numbers (0=Sun..6=Sat).
 */
function getAvailableDayNumbers(
  availability: Record<string, Array<{ start: string; end: string }>>
): number[] {
  const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
  return Object.entries(availability)
    .filter(([, windows]) => windows.length > 0)
    .map(([key]) => dayMap[key])
    .filter((n) => n !== undefined)
}

export function BookingPage() {
  const { slug } = useParams<{ slug: string }>()

  const [step, setStep] = useState<Step>('loading')
  const [linkData, setLinkData] = useState<PublicLinkData | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  // Selection state
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedDuration, setSelectedDuration] = useState<number>(30)
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [guestTimezone, setGuestTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  )

  // Booking result
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null)
  const [guestEmail, setGuestEmail] = useState('')

  // Fetch link data on mount
  useEffect(() => {
    if (!slug) {
      setStep('error')
      setErrorMessage('No scheduling link specified')
      return
    }

    const fetchLink = async () => {
      try {
        const res = await fetch(
          `${FUNCTIONS_URL}/getSchedulingLink?slug=${encodeURIComponent(slug)}`
        )
        if (!res.ok) {
          setStep('error')
          setErrorMessage('This scheduling link was not found or is no longer active.')
          return
        }
        const data: PublicLinkData = await res.json()
        setLinkData(data)
        setSelectedDuration(data.defaultDuration)
        setStep('select-time')
      } catch {
        setStep('error')
        setErrorMessage('Failed to load scheduling link. Please try again.')
      }
    }

    void fetchLink()
  }, [slug])

  // Fetch available slots when date or duration changes
  useEffect(() => {
    if (!selectedDate || !linkData || !slug) return

    const fetchSlots = async () => {
      setSlotsLoading(true)
      setSlots([])
      setSelectedSlot(null)

      try {
        // Fetch a week of slots starting from the selected date
        const startDate = formatDateISO(selectedDate)
        const endDate = formatDateISO(selectedDate) // Single day

        const params = new URLSearchParams({
          slug,
          duration: String(selectedDuration),
          startDate,
          endDate,
          timezone: guestTimezone,
        })

        const res = await fetch(`${FUNCTIONS_URL}/getSchedulingAvailability?${params}`)
        if (!res.ok) throw new Error('Failed to fetch availability')

        const data = await res.json()
        setSlots(data.slots ?? [])
      } catch {
        setSlots([])
      } finally {
        setSlotsLoading(false)
      }
    }

    void fetchSlots()
  }, [selectedDate, selectedDuration, guestTimezone, linkData, slug])

  const handleSlotSelect = useCallback((slot: TimeSlot) => {
    setSelectedSlot(slot)
  }, [])

  const handleConfirm = useCallback(() => {
    if (selectedSlot) {
      setStep('confirm-details')
    }
  }, [selectedSlot])

  const handleBookingSubmit = useCallback(
    async (data: { guestName: string; guestEmail: string; guestNotes: string }) => {
      if (!slug || !selectedSlot || !linkData) return

      const res = await fetch(`${FUNCTIONS_URL}/createSchedulingBooking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          startTime: new Date(selectedSlot.startMs).toISOString(),
          duration: selectedDuration,
          guestName: data.guestName,
          guestEmail: data.guestEmail,
          guestNotes: data.guestNotes || undefined,
          timezone: guestTimezone,
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Booking failed' }))
        throw new Error(err.error || 'Booking failed')
      }

      const result: BookingResult = await res.json()
      setBookingResult(result)
      setGuestEmail(data.guestEmail)
      setStep('success')
    },
    [slug, selectedSlot, selectedDuration, guestTimezone, linkData]
  )

  const availableDays = linkData ? getAvailableDayNumbers(linkData.availability) : undefined
  const accentStyle = linkData?.branding?.accentColor
    ? ({ '--accent': linkData.branding.accentColor } as React.CSSProperties)
    : undefined

  return (
    <div className="booking-page">
      <div className="booking-container" style={accentStyle}>
        {/* Loading */}
        {step === 'loading' && (
          <div className="booking-loading">
            <p>Loading...</p>
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="booking-error">
            <h2>Link Not Found</h2>
            <p>{errorMessage}</p>
          </div>
        )}

        {/* Select Time */}
        {step === 'select-time' && linkData && (
          <>
            <div className="booking-header">
              <h1 className="booking-header__title">{linkData.title}</h1>
              {linkData.description && (
                <p className="booking-header__description">{linkData.description}</p>
              )}
              {linkData.branding?.welcomeMessage && (
                <p className="booking-header__welcome">{linkData.branding.welcomeMessage}</p>
              )}
            </div>

            <DurationSelector
              durations={linkData.durations}
              selected={selectedDuration}
              onSelect={(d) => {
                setSelectedDuration(d)
                setSelectedSlot(null)
              }}
            />

            <div className="booking-timezone">
              <span>Timezone:</span>
              <select value={guestTimezone} onChange={(e) => setGuestTimezone(e.target.value)}>
                <option value={guestTimezone}>{guestTimezone}</option>
              </select>
            </div>

            <div className="booking-body">
              <DatePicker
                selectedDate={selectedDate}
                onSelect={setSelectedDate}
                availableDays={availableDays}
                maxDaysAhead={linkData.maxDaysAhead}
                timezone={linkData.timezone}
              />

              <TimeSlotList
                date={selectedDate}
                slots={slots}
                selectedSlot={selectedSlot}
                onSelect={handleSlotSelect}
                timezone={guestTimezone}
                loading={slotsLoading}
              />
            </div>

            {selectedSlot && (
              <div
                style={{
                  padding: 'var(--space-4) var(--space-6, 32px)',
                  borderTop: '1px solid var(--border)',
                }}
              >
                <button
                  type="button"
                  className="primary-button"
                  onClick={handleConfirm}
                  style={{ width: '100%' }}
                >
                  Continue
                </button>
              </div>
            )}
          </>
        )}

        {/* Confirm Details */}
        {step === 'confirm-details' && linkData && selectedSlot && (
          <BookingForm
            slot={selectedSlot}
            duration={selectedDuration}
            timezone={guestTimezone}
            linkTitle={linkData.title}
            onBack={() => setStep('select-time')}
            onSubmit={handleBookingSubmit}
          />
        )}

        {/* Success */}
        {step === 'success' && bookingResult && linkData && (
          <BookingConfirmation
            title={bookingResult.title}
            startTime={bookingResult.startTime}
            endTime={bookingResult.endTime}
            duration={selectedDuration}
            guestEmail={guestEmail}
            location={bookingResult.location}
            conferenceLink={bookingResult.conferenceLink}
            timezone={guestTimezone}
          />
        )}
      </div>
    </div>
  )
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
