# Agent Prompt — Task 3.3: Calendar & Scheduling — Scheduling Links

> **Scope:** Build a Calendly-like scheduling link system — users create shareable booking pages backed by their Google Calendar availability.
>
> **Deferred:** Availability sharing (3.3.2), smart scheduling suggestions (3.3.3), and recurring event intelligence (3.3.4) are nice-to-haves that don't justify the complexity. The scheduling link feature alone replaces an external tool dependency.

---

## 0. Context & References

| Item                      | Path (relative to repo root)                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| **Design tokens**         | `apps/web-vite/src/tokens.css`                                                                    |
| **UI primitives**         | `apps/web-vite/src/components/ui/`                                                                |
| **CalendarPage**          | `apps/web-vite/src/pages/CalendarPage.tsx`                                                        |
| **Calendar event model**  | `packages/calendar/src/domain/providers/google/googleCalendarEvent.ts` — `CanonicalCalendarEvent` |
| **Google Calendar API**   | `functions/src/google/calendarApi.ts` — `getValidAccessToken()`, event CRUD                       |
| **Calendar hooks**        | `apps/web-vite/src/hooks/useCalendarEvents.ts`                                                    |
| **CalendarSettingsPanel** | `apps/web-vite/src/components/CalendarSettingsPanel.tsx`                                          |
| **SettingsPage**          | `apps/web-vite/src/pages/SettingsPage.tsx`                                                        |
| **Firebase config**       | `firebase.json`, `functions/src/index.ts`                                                         |
| **Router**                | `apps/web-vite/src/App.tsx`                                                                       |

**Existing infrastructure:**

- Google Calendar OAuth integration with token refresh
- Event CRUD via `calendarApi.ts` (insert, update, delete, list)
- Event model with `attendees`, `startMs/endMs`, `timezone`, `conferencing`

---

## Phase A — Scheduling Link Model & CRUD

### A1. Domain Model

Create `packages/calendar/src/domain/schedulingLink.ts`:

```ts
export interface SchedulingLink {
  linkId: string
  userId: string
  slug: string // URL-friendly identifier, e.g., "30min-chat"
  title: string // Display name, e.g., "30-Minute Chat"
  description?: string
  durations: number[] // Available durations in minutes, e.g., [15, 30, 60]
  defaultDuration: number
  calendarAccountId: string // Which Google Calendar to check/write
  calendarId: string // Specific calendar within the account
  availability: {
    daysOfWeek: number[] // 0=Sun, 1=Mon, ..., 6=Sat
    startHour: number // e.g., 9
    endHour: number // e.g., 17
    timezone: string
  }
  bufferMinutes: number // Buffer before/after meetings
  dailyLimit: number // Max bookings per day (0 = unlimited)
  location?: string // Default location or conferencing
  addConferencing: boolean // Auto-add Google Meet
  active: boolean
  createdAtMs: number
  updatedAtMs: number
}

export interface Booking {
  bookingId: string
  linkId: string
  userId: string // Owner
  guestName: string
  guestEmail: string
  guestNote?: string
  duration: number
  startMs: number
  endMs: number
  timezone: string
  calendarEventId?: string // Google Calendar event ID after creation
  status: 'confirmed' | 'cancelled'
  createdAtMs: number
}
```

Firestore paths:

- `/users/{userId}/schedulingLinks/{linkId}`
- `/users/{userId}/schedulingLinks/{linkId}/bookings/{bookingId}`

### A2. Settings UI for Managing Links

Create `apps/web-vite/src/components/settings/SchedulingLinksPanel.tsx`:

```tsx
export function SchedulingLinksPanel() {
  const { links, createLink, updateLink, deleteLink } = useSchedulingLinks()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<SchedulingLink | null>(null)

  return (
    <div className="scheduling-links-panel">
      <div className="scheduling-links-panel__header">
        <h3>Scheduling Links</h3>
        <button
          className="primary-button"
          onClick={() => {
            setEditing(null)
            setShowForm(true)
          }}
        >
          + New Link
        </button>
      </div>

      {links.map((link) => (
        <div key={link.linkId} className="scheduling-link-card">
          <div className="scheduling-link-card__info">
            <h4>{link.title}</h4>
            <p className="scheduling-link-card__url">/schedule/{link.slug}</p>
            <p className="scheduling-link-card__meta">
              {link.durations.join('/')} min · {link.availability.daysOfWeek.length} days/week ·{' '}
              {link.bufferMinutes}min buffer
            </p>
          </div>
          <div className="scheduling-link-card__actions">
            <button className="ghost-button" onClick={() => copyToClipboard(getFullUrl(link.slug))}>
              Copy Link
            </button>
            <button
              className="ghost-button"
              onClick={() => {
                setEditing(link)
                setShowForm(true)
              }}
            >
              Edit
            </button>
            <button className="ghost-button danger" onClick={() => deleteLink(link.linkId)}>
              Delete
            </button>
          </div>
        </div>
      ))}

      {showForm && (
        <SchedulingLinkForm
          link={editing}
          onSave={() => {
            setShowForm(false)
            setEditing(null)
          }}
          onClose={() => {
            setShowForm(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
```

### A3. Link Form Modal

```tsx
// Fields: title, slug, description, durations (multi-select), defaultDuration,
// calendarAccountId (select), daysOfWeek (checkboxes), startHour/endHour, timezone,
// bufferMinutes, dailyLimit, addConferencing (toggle), active (toggle)
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Public Booking Page

### B1. Add Public Route

In `App.tsx`, add a public route (no auth required):

```tsx
<Route path="/schedule/:slug" element={<BookingPage />} />
```

### B2. Availability Calculation Cloud Function

Create `functions/src/scheduling/getAvailability.ts`:

```ts
export async function getAvailableSlots(
  userId: string,
  linkId: string,
  dateRange: { startDate: string; endDate: string }
): Promise<TimeSlot[]> {
  const link = await getSchedulingLink(userId, linkId)
  const events = await listCalendarEvents(userId, link.calendarAccountId, dateRange)
  const existingBookings = await getBookingsForDateRange(userId, linkId, dateRange)

  const slots: TimeSlot[] = []

  for (const date of eachDayInRange(dateRange)) {
    const dayOfWeek = date.getDay()
    if (!link.availability.daysOfWeek.includes(dayOfWeek)) continue

    // Check daily limit
    const dayBookings = existingBookings.filter((b) => isSameDay(b.startMs, date))
    if (link.dailyLimit > 0 && dayBookings.length >= link.dailyLimit) continue

    // Generate slots within working hours
    let cursor = setHour(date, link.availability.startHour)
    const endOfDay = setHour(date, link.availability.endHour)

    while (cursor + link.defaultDuration * 60000 <= endOfDay.getTime()) {
      const slotStart = cursor
      const slotEnd = cursor + link.defaultDuration * 60000

      // Check for conflicts (existing events + buffer)
      const hasConflict = events.some(
        (e) =>
          e.startMs < slotEnd + link.bufferMinutes * 60000 &&
          e.endMs + link.bufferMinutes * 60000 > slotStart
      )

      if (!hasConflict) {
        slots.push({ startMs: slotStart, endMs: slotEnd })
      }

      cursor += 30 * 60000 // Advance by 30-min increments
    }
  }

  return slots
}
```

Register as a callable Cloud Function (no auth required, but rate-limited):

```ts
export const schedulingGetAvailability = onCall({ cors: true }, async (request) => {
  const { slug, startDate, endDate } = request.data
  // Look up link by slug (public query)
  const link = await findLinkBySlug(slug)
  if (!link || !link.active) throw new HttpsError('not-found', 'Link not found')
  return getAvailableSlots(link.userId, link.linkId, { startDate, endDate })
})
```

### B3. BookingPage Component

Create `apps/web-vite/src/pages/BookingPage.tsx`:

```tsx
export function BookingPage() {
  const { slug } = useParams()
  const [link, setLink] = useState<SchedulingLink | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [step, setStep] = useState<'select' | 'confirm'>('select')

  // Guest info
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [guestNote, setGuestNote] = useState('')

  // Fetch link info + available slots
  useEffect(() => {
    /* fetch by slug */
  }, [slug, selectedDate])

  return (
    <div className="booking-page">
      <div className="booking-page__header">
        <h1>{link?.title}</h1>
        {link?.description && <p>{link.description}</p>}
        <p className="booking-page__duration">{link?.defaultDuration} minutes</p>
      </div>

      {step === 'select' ? (
        <div className="booking-page__layout">
          {/* Date picker (simple calendar grid) */}
          <div className="booking-date-picker">
            {/* Calendar month view — only enable days matching availability */}
          </div>

          {/* Time slots for selected date */}
          <div className="booking-slots">
            <h3>{formatDate(selectedDate)}</h3>
            {slots.length === 0 ? (
              <p>No available times on this date.</p>
            ) : (
              <div className="booking-slots__grid">
                {slots.map((slot) => (
                  <button
                    key={slot.startMs}
                    className={`booking-slot ${selectedSlot?.startMs === slot.startMs ? 'booking-slot--selected' : ''}`}
                    onClick={() => setSelectedSlot(slot)}
                  >
                    {formatTime(slot.startMs)}
                  </button>
                ))}
              </div>
            )}
            {selectedSlot && (
              <button className="primary-button" onClick={() => setStep('confirm')}>
                Continue
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="booking-confirm">
          <h3>
            {formatDate(selectedSlot!.startMs)} at {formatTime(selectedSlot!.startMs)}
          </h3>
          <input
            placeholder="Your name *"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            required
          />
          <input
            placeholder="Your email *"
            type="email"
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            required
          />
          <textarea
            placeholder="Anything you'd like to share? (optional)"
            value={guestNote}
            onChange={(e) => setGuestNote(e.target.value)}
          />
          <div className="booking-confirm__actions">
            <button className="ghost-button" onClick={() => setStep('select')}>
              Back
            </button>
            <button
              className="primary-button"
              onClick={handleBook}
              disabled={!guestName || !guestEmail}
            >
              Confirm Booking
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

### B4. Booking Page CSS

```css
.booking-page {
  max-width: 700px;
  margin: 0 auto;
  padding: var(--space-6);
}
.booking-page__header {
  text-align: center;
  margin-bottom: var(--space-6);
}
.booking-page__duration {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.booking-page__layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-5);
}
.booking-slots__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2);
}
.booking-slot {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: none;
  cursor: pointer;
  font-size: var(--text-sm);
  text-align: center;
  transition: all var(--motion-fast) var(--motion-ease);
}
.booking-slot:hover {
  border-color: var(--accent);
  background: var(--accent-subtle);
}
.booking-slot--selected {
  background: var(--accent);
  color: var(--accent-foreground);
  border-color: var(--accent);
}
.booking-confirm {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: 400px;
  margin: 0 auto;
}
.booking-confirm__actions {
  display: flex;
  justify-content: space-between;
}

@media (max-width: 640px) {
  .booking-page__layout {
    grid-template-columns: 1fr;
  }
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Auto-Event Creation on Booking

### C1. Booking Cloud Function

Create `functions/src/scheduling/createBooking.ts`:

```ts
export const schedulingCreateBooking = onCall({ cors: true }, async (request) => {
  const { slug, slotStartMs, duration, guestName, guestEmail, guestNote, timezone } = request.data

  const link = await findLinkBySlug(slug)
  if (!link || !link.active) throw new HttpsError('not-found', 'Link not found')

  // Validate slot is still available (prevent double-booking)
  const isAvailable = await checkSlotAvailability(link, slotStartMs, duration)
  if (!isAvailable) throw new HttpsError('failed-precondition', 'Slot no longer available')

  // Create Google Calendar event
  const eventInput: GoogleCalendarEventInput = {
    summary: `${link.title} with ${guestName}`,
    description: `Booked via scheduling link.\n\nGuest: ${guestName} (${guestEmail})${guestNote ? `\n\nNote: ${guestNote}` : ''}`,
    start: { dateTime: new Date(slotStartMs).toISOString(), timeZone: timezone },
    end: { dateTime: new Date(slotStartMs + duration * 60000).toISOString(), timeZone: timezone },
    attendees: [{ email: guestEmail, displayName: guestName }],
    conferenceData: link.addConferencing ? { createRequest: { requestId: uuidv4() } } : undefined,
  }

  const calendarEvent = await insertCalendarEvent(
    link.userId,
    link.calendarAccountId,
    link.calendarId,
    eventInput
  )

  // Save booking record
  const booking: Booking = {
    bookingId: uuidv4(),
    linkId: link.linkId,
    userId: link.userId,
    guestName,
    guestEmail,
    guestNote,
    duration,
    startMs: slotStartMs,
    endMs: slotStartMs + duration * 60000,
    timezone,
    calendarEventId: calendarEvent.id,
    status: 'confirmed',
    createdAtMs: Date.now(),
  }

  await saveBooking(link.userId, link.linkId, booking)

  return { bookingId: booking.bookingId, eventLink: calendarEvent.htmlLink }
})
```

### C2. Confirmation Page

After successful booking, show a confirmation:

```tsx
<div className="booking-success">
  <h2>Booking Confirmed</h2>
  <p>
    {link.title} with {link.ownerName}
  </p>
  <p>
    {formatDate(selectedSlot.startMs)} at {formatTime(selectedSlot.startMs)}
  </p>
  <p>Duration: {selectedDuration} minutes</p>
  <p>A calendar invitation has been sent to {guestEmail}.</p>
</div>
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Quality Gates (run after ALL phases)

```bash
pnpm typecheck
pnpm lint --fix
pnpm vitest run --reporter=verbose apps/web-vite
pnpm vitest run --reporter=verbose functions
pnpm build
```

---

## Tests

Create `functions/src/scheduling/__tests__/getAvailability.test.ts`:

1. **Returns slots within working hours** — 9-17, M-F → verify no slots outside range
2. **Excludes conflicting times** — Existing event at 10:00 → no 10:00 slot
3. **Respects buffer** — 15min buffer, event ends at 10:30 → no 10:30 slot, 10:45 ok
4. **Respects daily limit** — Limit 3, already 3 bookings → no slots for that day
5. **Skips non-available days** — Weekend excluded → no Saturday/Sunday slots

Create `apps/web-vite/src/pages/__tests__/BookingPage.test.tsx`:

6. **Renders booking form** — Verify title, date picker, and slot grid render
7. **Slot selection** — Click slot → verify selected state
8. **Confirm step shows form** — Click Continue → verify name/email inputs
9. **Submit creates booking** — Fill form + submit → verify Cloud Function called

---

## Commit

```
feat(calendar): scheduling links with public booking page

- Scheduling Link CRUD: slug, durations, working hours, buffer, daily limit
- Availability calculation: checks Google Calendar for conflicts + buffers
- Public booking page at /schedule/:slug (no auth required)
- Two-step booking: date/time selection → guest info → confirmation
- Auto-creates Google Calendar event with attendee and optional Meet link
- Booking records stored for tracking
- Settings panel for managing scheduling links

Co-Authored-By: Claude <noreply@anthropic.com>
```
