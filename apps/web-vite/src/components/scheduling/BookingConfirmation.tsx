/**
 * @fileoverview Success screen shown after a booking is confirmed.
 * Includes .ics download for Apple Calendar / other calendar apps.
 */

interface BookingConfirmationProps {
  title: string
  startTime: string
  endTime: string
  duration: number
  guestEmail: string
  location?: string
  conferenceLink?: string | null
  timezone: string
}

function formatDateTime(iso: string, timezone: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
  })
}

function toICSDate(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')
}

function generateICS(params: {
  title: string
  start: string
  end: string
  location?: string
  description?: string
}): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//LifeOS//Scheduling//EN',
    'BEGIN:VEVENT',
    `DTSTART:${toICSDate(params.start)}`,
    `DTEND:${toICSDate(params.end)}`,
    `SUMMARY:${params.title}`,
  ]
  if (params.location) lines.push(`LOCATION:${params.location}`)
  if (params.description) lines.push(`DESCRIPTION:${params.description.replace(/\n/g, '\\n')}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

function downloadICS(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function BookingConfirmation({
  title,
  startTime,
  endTime,
  duration,
  guestEmail,
  location,
  conferenceLink,
  timezone,
}: BookingConfirmationProps) {
  const handleDownloadICS = () => {
    const ics = generateICS({
      title,
      start: startTime,
      end: endTime,
      location: location || conferenceLink || undefined,
      description: `${duration}-minute meeting`,
    })
    downloadICS(`${title.replace(/\s+/g, '-')}.ics`, ics)
  }

  return (
    <div className="booking-confirmation">
      <div className="booking-confirmation__icon">&#x2713;</div>
      <h2 className="booking-confirmation__title">Booking Confirmed</h2>
      <div className="booking-confirmation__details">
        <strong>{title}</strong>
        <br />
        {formatDateTime(startTime, timezone)}
        <br />
        {duration} minutes
        {location && (
          <>
            <br />
            {location}
          </>
        )}
        {conferenceLink && (
          <>
            <br />
            <a href={conferenceLink} target="_blank" rel="noopener noreferrer">
              Join Google Meet
            </a>
          </>
        )}
      </div>

      <p className="booking-confirmation__invite-note">
        A calendar invitation has been sent to {guestEmail}
      </p>

      <div className="booking-confirmation__actions">
        <button type="button" className="ghost-button" onClick={handleDownloadICS}>
          Download .ics
        </button>
      </div>
    </div>
  )
}
