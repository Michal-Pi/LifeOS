# LifeOS Manual Testing Guide & Onboarding

**Version:** 1.1.0
**Last Updated:** December 20, 2024
**Application:** LifeOS Calendar & Productivity System (Vite SPA)

---

## Table of Contents

1. [Overview](#1-overview)
2. [Getting Started](#2-getting-started)
3. [Calendar - Basic Event Management](#3-calendar---basic-event-management)
4. [Calendar - Recurring Events](#4-calendar---recurring-events)
5. [Attendees & RSVP](#5-attendees--rsvp)
6. [Alerts & Notifications](#6-alerts--notifications)
7. [Google Calendar Sync](#7-google-calendar-sync)
8. [Offline & Outbox Functionality](#8-offline--outbox-functionality)
9. [Today Dashboard](#9-today-dashboard)
10. [Month View](#10-month-view)
11. [Calendar View Toggles](#11-calendar-view-toggles)
12. [Weekly View](#12-weekly-view)
13. [Settings - Quote Management](#13-settings---quote-management)
14. [Permissions & Security](#14-permissions--security)
15. [Edge Cases & Special Scenarios](#15-edge-cases--special-scenarios)
16. [Complete Testing Checklist](#16-complete-testing-checklist)

---

## 1. Overview

### What is LifeOS?

LifeOS is a productivity application centered around calendar management with offline-first capabilities and Google Calendar synchronization. The application currently has four fully implemented pages:

- **Calendar Page** - Full-featured calendar with events, recurring events, RSVP, alerts, and sync
- **Today Page** - Dashboard with daily stats, customizable inspirational quotes, and event previews
- **Todo Page** - Projects, milestones, tasks, and scheduling to calendar
- **Settings Page** - Quote management system with up to 1,000 custom quotes

Other modules (Notes, People, Projects, Todos) are placeholder pages awaiting Phase 2 implementation.

### Key Features

✅ **Implemented:**
- Create, edit, and delete calendar events
- Recurring events with complex patterns (daily, weekly, monthly, yearly)
- RSVP to events as an attendee
- Event alerts with customizable timing
- Google Calendar two-way sync
- Offline mode with automatic sync queue
- Multi-device sync with conflict resolution
- Calendar permissions (read-only vs writable)
- Today dashboard with stats and customizable quotes
- Quote management with add, edit, delete, and reset functionality
- Deterministic daily quote selection (same quote for same date)

❌ **Not Yet Implemented:**
- Notes, People, Projects modules (placeholder pages only)

---

## 2. Getting Started

### Prerequisites

- Modern web browser (Chrome 120+, Firefox 121+, Safari 17+, Edge 120+)
- Internet connection for Google Calendar sync
- Google Account (optional, for sync features)

### Accessing the Application

1. **Start Development Server:**
   ```bash
   pnpm dev
   ```

2. **Open Browser:**
   Navigate to `http://localhost:5173`

3. **Navigate to Calendar:**
   Click "Calendar" in the sidebar or visit `http://localhost:5173/calendar`

### Application Structure

```
┌─────────────┐
│   Sidebar   │  Navigation to all modules
├─────────────┤
│             │  Today      - Dashboard view
│   Main      │  Calendar   - Full calendar (implemented)
│   Content   │  Todos      - Placeholder
│   Area      │  Projects   - Placeholder
│             │  Notes      - Placeholder
│             │  People     - Placeholder
└─────────────┘  Settings   - Placeholder
```

---

## 3. Calendar - Basic Event Management

### 3.1 Creating a New Event

**Test Case:** Create a basic calendar event

**Location:** [Calendar Page](apps/web-vite/src/pages/CalendarPage.tsx) > Header

**Steps:**
1. Click the **"+ New Event"** button in the calendar header
2. Fill in the event form:
   - **Title:** "Team Standup"
   - **Start Date:** Today
   - **Start Time:** 10:00 AM
   - **End Time:** 10:30 AM
   - **Location:** "Conference Room A"
   - **Description:** "Daily sync meeting"
3. Click **"Save"**

**Expected Output:**
- ✅ Modal closes immediately
- ✅ Event appears in the Event Timeline (left panel)
- ✅ Event shows with sync indicator: **○ Local** or **↻ Syncing to Google…**
- ✅ Event displays:
  ```
  10:00 AM — 10:30 AM
  Conference Room A

  Team Standup
  Daily sync meeting
  Private focus time
  ```
- ✅ If online: status changes to **✓ Synced** after a few seconds
- ✅ If offline: remains **○ Local** until reconnected

**Edge Cases to Test:**
- ❌ **No title:** Form shows error "Title is required"
- ❌ **End before start:** Error "End time must be after start time"
- ✅ **All-day event:** Toggle "All day" and verify time pickers disappear
- ✅ **Multi-day event:** Set end date to tomorrow, verify spans multiple days

---

### 3.2 Viewing Event Details

**Test Case:** View full event information

**Steps:**
1. Click any event in the Event Timeline
2. Observe the Event Details panel (right side)

**Expected Output:**
Event details panel shows:
```
┌─────────────────────────────────────┐
│ Team Standup                    ↻✓  │  ← Title + Sync indicator
├─────────────────────────────────────┤
│ 10:00 AM – 10:30 AM                 │  ← Time
│ Daily sync meeting                  │  ← Description
│ Hosted in Conference Room A         │  ← Location
├─────────────────────────────────────┤
│ Alert                               │
│ 🔔 10 minutes before          ▼    │  ← Alert dropdown
├─────────────────────────────────────┤
│ Sync Status                         │
│ ✓ Synced                           │  ← Status badge
│ Last synced: 2:30 PM               │  ← Timestamp
├─────────────────────────────────────┤
│ [Edit]  [Delete]                    │  ← Actions
└─────────────────────────────────────┘
```

**Sync Status Indicators:**
- **✓ Synced** - Event synchronized with Google Calendar
- **↻ Syncing to Google…** - Currently uploading changes
- **! Sync failed** - Error occurred, retry available
- **⚠ Conflict** - Conflicting changes detected
- **◎ Read-only** - Event or calendar is read-only
- **○ Local** - Local event, not yet synced

---

### 3.3 Editing an Event

**Test Case:** Modify event details

**Steps:**
1. Select an event
2. Click **"Edit"** button in Event Details
3. Change the title to "Daily Standup"
4. Change the time to 9:00 AM – 9:30 AM
5. Click **"Save"**

**Expected Output:**
- ✅ Modal closes
- ✅ Event updates immediately in timeline (optimistic update)
- ✅ Sync status changes to **↻ Syncing to Google…**
- ✅ After sync completes: status changes to **✓ Synced**
- ✅ Updated details visible in event details panel
- ✅ Event remains selected

**Special Case - Recurring Event:**
If editing a recurring event, a scope selector appears:

```
┌────────────────────────────────────┐
│ Which events do you want to edit?  │
├────────────────────────────────────┤
│ ○ This event only                  │
│ ○ This and future events           │
│ ○ All events                       │
├────────────────────────────────────┤
│ [Cancel]  [Continue]               │
└────────────────────────────────────┘
```

**Scope Behavior:**
- **This event only:** Creates an exception (override) for this instance
- **This and future events:** Splits the series, truncates original
- **All events:** Modifies the master recurring series

---

### 3.4 Deleting an Event

**Test Case:** Remove an event

**Steps:**
1. Select an event
2. Click **"Delete"** button (red text)
3. Confirm deletion in modal

**Expected Output:**
- ✅ Confirmation modal appears:
  ```
  ┌────────────────────────────────────┐
  │ Delete "Team Standup"?             │
  ├────────────────────────────────────┤
  │ This action cannot be undone.      │
  ├────────────────────────────────────┤
  │ [Cancel]  [Delete]                 │
  └────────────────────────────────────┘
  ```
- ✅ After clicking Delete:
  - Event removed from timeline immediately
  - Selection clears (no event selected)
  - Event marked for deletion in outbox
  - Syncs deletion to Google Calendar when online

**Special Case - Recurring Event:**
Delete modal shows scope options:
- **This event only:** Removes only this occurrence
- **This and future events:** Truncates the series
- **All events:** Deletes entire recurring series

---

## 4. Calendar - Recurring Events

### 4.1 Creating a Recurring Event

**Test Case:** Create weekly recurring meeting

**Steps:**
1. Click **"+ New Event"**
2. Fill in basic details:
   - **Title:** "Weekly Team Sync"
   - **Start:** Today at 2:00 PM
   - **End:** Today at 3:00 PM
3. In **Repeat** section:
   - **Frequency:** Weekly
   - **Interval:** Every 1 week
   - **Days:** Check Monday, Wednesday, Friday
4. In **Ends** section:
   - Select **"Until"**
   - Set date 3 months from now
5. Click **"Save"**

**Expected Output:**
- ✅ Event appears with recurrence indicator: **↻**
- ✅ Event detail shows recurrence description:
  ```
  ↻ Weekly on Mon, Wed, Fri
  ```
- ✅ In Month View, event appears on all Mon/Wed/Fri dates
- ✅ Each occurrence can be selected individually

**Recurrence Patterns Supported:**

| Frequency | Options | Example Description |
|-----------|---------|-------------------|
| Daily | Interval | "Daily" or "Every 2 days" |
| Weekly | Interval + Days | "Weekly on Mon, Wed, Fri" |
| Monthly | Interval + Day | "Monthly on day 15" |
| Yearly | Interval | "Yearly" |

**End Conditions:**
- **Never:** Infinite recurrence
- **Until [date]:** Ends on specified date
- **Count:** After N occurrences (e.g., "After 10 events")

---

### 4.2 Editing Recurring Events

**Test Case:** Modify one instance of recurring event

**Steps:**
1. Select any instance of "Weekly Team Sync"
2. Click **"Edit"**
3. Scope selector appears - choose **"This event only"**
4. Change title to "Weekly Team Sync (Extended)"
5. Change end time to 3:30 PM
6. Click **"Save"**

**Expected Output:**
- ✅ Scope dialog appears before form opens
- ✅ After saving:
  - **This instance:** Shows new title and time
  - **Other instances:** Remain unchanged
  - Exception created in recurrence data
- ✅ Event marked with **↻ Syncing to Google…**
- ✅ After sync: **✓ Synced**

**Test Case:** Modify all future instances

**Steps:**
1. Select an instance
2. Edit → Select **"This and future events"**
3. Change location to "Virtual - Zoom"
4. Save

**Expected Output:**
- ✅ **Current instance and all future:** Updated location
- ✅ **Past instances:** Remain unchanged
- ✅ Series splits into two:
  - Original series truncated at selected date
  - New series created from selected date forward

**Test Case:** Modify entire series

**Steps:**
1. Select any instance
2. Edit → Select **"All events"**
3. Change time to 1:00 PM – 2:00 PM
4. Save

**Expected Output:**
- ✅ **All instances** (past, present, future) update to new time
- ✅ Master recurring series modified
- ✅ All instances show new time in timeline

---

### 4.3 Deleting Recurring Events

**Test Case:** Delete one occurrence

**Steps:**
1. Select an instance of recurring event
2. Click **"Delete"**
3. Scope selector appears - choose **"This event only"**
4. Confirm deletion

**Expected Output:**
- ✅ **This instance:** Removed from timeline and month view
- ✅ **Other instances:** Still visible
- ✅ Deletion syncs to Google Calendar

**Test Case:** Delete all future occurrences

**Steps:**
1. Delete → Select **"This and future events"**
2. Confirm

**Expected Output:**
- ✅ **Current and future instances:** Deleted
- ✅ **Past instances:** Remain visible
- ✅ Series ends at selected date

**Test Case:** Delete entire series

**Steps:**
1. Delete → Select **"All events"**
2. Confirm

**Expected Output:**
- ✅ **All instances** removed from timeline and month view
- ✅ Event list updates immediately
- ✅ No instances remain

---

## 5. Attendees & RSVP

### 5.1 Viewing Attendees

**Test Case:** View attendee list for event with guests

**Setup:** Event must have attendees (sync from Google Calendar or view demo event)

**Location:** Event Details > People section

**Expected Output:**

```
┌─────────────────────────────────────┐
│ Organizer                           │
│ 👤 John Smith (You)                 │
├─────────────────────────────────────┤
│ 3 Guests                            │
│                                     │
│ ✓ 👤 Alice Johnson                  │  ← Accepted
│      alice@example.com              │
│                                     │
│ ? 👤 Bob Wilson (Optional)          │  ← Maybe (Tentative)
│      bob@example.com                │
│                                     │
│ ○ 👤 Carol Davis                    │  ← Pending
│      carol@example.com              │
├─────────────────────────────────────┤
│ Response Summary:                   │
│ ✓ 1 accepted, ? 1 maybe, ○ 1 pending│
└─────────────────────────────────────┘
```

**Attendee Display Elements:**
- **Avatar:** Initial or profile picture
- **Name and Email:** Guest identification
- **"You" Badge:** Marks current user
- **"Optional" Badge:** Optional attendees
- **Response Icon:**
  - ✓ Accepted (green)
  - ? Maybe/Tentative (yellow)
  - ✗ Declined (red)
  - ○ Pending/No response (gray)
- **Comment:** RSVP message (if provided)

**Response Summary:**
Shows aggregate counts when multiple guests:
- ✓ X accepted
- ? X maybe
- ✗ X declined
- ○ X pending

---

### 5.2 RSVP to Events

**Test Case:** Respond to meeting invitation

**Prerequisites:**
- User must be an **attendee** (not organizer)
- Event must have attendees list

**Steps:**
1. Select an event where you are an attendee
2. Locate **"Your Response"** section in Event Details
3. Click one of three buttons:
   - ✓ **Accept**
   - ? **Maybe**
   - ✗ **Decline**

**Expected Output:**

**Before Responding:**
```
┌─────────────────────────────────────┐
│ Your Response                       │
├─────────────────────────────────────┤
│ [✓ Accept]  [? Maybe]  [✗ Decline] │
└─────────────────────────────────────┘
```

**After Clicking "Accept":**
```
┌─────────────────────────────────────┐
│ Your Response                       │
│ You responded: Accepted ✓           │
├─────────────────────────────────────┤
│ [✓ Accept]  [? Maybe]  [✗ Decline] │  ← Accept highlighted
└─────────────────────────────────────┘
```

**Behavior:**
- ✅ Button highlights to show selection
- ✅ "You responded: [status]" appears above buttons
- ✅ Response updates optimistically in attendee list
- ✅ Event marked as **↻ Syncing to Google…**
- ✅ After sync: **✓ Synced**
- ✅ Response visible to other attendees after sync

**Disabled States:**
- 🚫 Buttons disabled if event is currently syncing (spinning icon shown)
- 🚫 Buttons disabled if offline (tooltip: "Will sync when online")
- 🚫 Buttons disabled if user is the organizer (section doesn't appear)

**Response Status Options:**
- **Accepted:** ✓ Green - Attending
- **Tentative/Maybe:** ? Yellow - Might attend
- **Declined:** ✗ Red - Not attending
- **Needs Action/Pending:** ○ Gray - No response yet

---

### 5.3 Events Without Attendees

**Test Case:** View private event (no guests)

**Expected Output:**
```
Team Standup
10:00 AM – 10:30 AM

Daily sync meeting
Hosted in Conference Room A

Private focus time  ← Shows instead of attendee list
```

**No RSVP Section:**
- RSVP section does not appear
- No attendee list shown
- Displays "Private focus time" in event card

---

## 6. Alerts & Notifications

### 6.1 Setting Event Alerts

**Test Case:** Add alert to event

**Steps:**
1. Select an event
2. In Event Details, locate **"Alert"** section
3. Click the dropdown (default: "None")
4. Select a preset:
   - None
   - At time of event
   - 5 minutes before
   - 10 minutes before
   - 15 minutes before
   - 30 minutes before
   - 1 hour before
   - Custom

**Expected Output:**

**Dropdown Selection:**
```
┌─────────────────────────────────────┐
│ Alert                               │
│ 🔔 10 minutes before          ▼    │  ← Shows selected preset
├─────────────────────────────────────┤
│ Alerts only work while app is open  │  ← Help text
└─────────────────────────────────────┘
```

**Behavior:**
- ✅ Dropdown shows current alert setting
- ✅ Bell icon 🔔 indicates alert is enabled
- ✅ Selecting preset immediately saves
- ✅ Event marked as **↻ Syncing to Google…**
- ✅ Alert stored in event data

---

### 6.2 Custom Alert Time

**Test Case:** Set custom alert timing

**Steps:**
1. In Alert dropdown, select **"Custom"**
2. Input field appears
3. Enter **45** (minutes)
4. Click **"Set"**

**Expected Output:**
```
┌─────────────────────────────────────┐
│ Alert                               │
│ [Custom: 45 minutes] [Set]          │
└─────────────────────────────────────┘
```

**After Setting:**
```
┌─────────────────────────────────────┐
│ Alert                               │
│ 🔔 45 minutes before          ▼     │
└─────────────────────────────────────┘
```

**Validation:**
- ✅ Accepts numbers 0-10080 (1 week in minutes)
- ✅ 0 = "At time of event"
- ✅ Displays as "X minutes before" in dropdown

---

### 6.3 Alert Notifications

**Test Case:** Receive alert when event starts soon

**Setup:**
1. Create event starting in 10 minutes
2. Set alert to "10 minutes before"
3. Keep browser tab open

**Expected Output:**

**Alert Banner Appears:**
```
┌──────────────────────────────────────────────────────┐
│ 🔔 Team Standup                                      │
│ 2:30 PM • Starts in 10 minutes                       │
│                                   [Open] [✕ Dismiss] │
└──────────────────────────────────────────────────────┘
```

**Alert Banner Features:**
- **Event Title:** "Team Standup"
- **Start Time:** "2:30 PM"
- **Countdown:**
  - "Starts in less than a minute" (< 60 seconds)
  - "Starts in X minute(s)" (< 60 minutes)
  - "Starts in Xh Ym" (larger durations)
  - "Starting now" (at event start time)
- **"Open" Button:** Selects event in details panel
- **"✕ Dismiss" Button:** Closes alert

**Behavior:**
- ✅ Banner appears at top of page
- ✅ Clicking **"Open"** jumps to event and dismisses alert
- ✅ Clicking **"✕"** dismisses alert
- ✅ Alert auto-dismisses when event starts
- ✅ Dismissed alerts don't reappear until app restarts
- ✅ Multiple alerts can stack vertically

**Important Limitations:**
⚠️ **Alerts only work while the app is open**
- Browser must be running
- Tab doesn't need to be focused
- Closes app = no alerts

---

### 6.4 Alert Dismissal & Persistence

**Test Case:** Dismiss alert and verify persistence

**Steps:**
1. Alert appears for upcoming event
2. Click **"✕ Dismiss"**
3. Refresh the page
4. Check if alert reappears

**Expected Output:**
- ✅ Alert dismisses immediately on click
- ✅ After page refresh: alert **does not** reappear
- ✅ Dismissal state synced via outbox
- ✅ Dismissal persists across devices

**Dismissal Logic:**
- Dismissal creates `alertDismissal` object on event:
  ```typescript
  {
    dismissedAtMs: 1702987654321,
    dismissedAlertMinutesBefore: 10
  }
  ```
- Alert won't fire again for this event until:
  - App fully closes and reopens
  - Event is edited (resets dismissal)

---

### 6.5 Alerts for All-Day Events

**Test Case:** Try to set alert on all-day event

**Steps:**
1. Create or select all-day event
2. Locate Alert section in Event Details

**Expected Output:**
```
┌─────────────────────────────────────┐
│ Alert                               │
│ Alerts are not available for        │
│ all-day events                      │
└─────────────────────────────────────┘
```

**Behavior:**
- 🚫 Alert dropdown disabled
- ℹ️ Message explains limitation
- ✅ Makes sense: all-day events have no specific time

---

## 7. Google Calendar Sync

### 7.1 Connecting Google Account

**Test Case:** Link Google Calendar account

**Location:** Calendar Header > "Connect Google" button

**Steps:**
1. Click **"Connect Google"** button
2. Browser redirects to Google OAuth consent screen
3. Select Google account
4. Grant calendar permissions
5. Redirected back to LifeOS app

**Expected Output:**

**Before Connection:**
```
Calendar Header:
┌────────────────────────────────────┐
│ Google account not connected       │
│ [Connect Google]                   │
└────────────────────────────────────┘
```

**After Connection:**
```
Calendar Header:
┌────────────────────────────────────┐
│ Connected to Google Calendar       │
│ [Disconnect]                       │
└────────────────────────────────────┘
```

**Behavior:**
- ✅ Button text changes to "Disconnect"
- ✅ Account status shows "Connected to Google Calendar"
- ✅ Events begin syncing from Google Calendar
- ✅ Local events push to Google Calendar

**OAuth Flow Details:**
- Requests calendar read/write permissions
- Stores refresh token securely
- Token auto-refreshes when expired

---

### 7.2 Sync Status Indicators

**Test Case:** Monitor sync status

**Location:** Calendar Header

**Expected Output:**

```
Calendar Header - Sync Section:
┌────────────────────────────────────┐
│ ● Online                           │  ← Connection status
│ 3 syncing…                         │  ← Pending operations
│ Last synced 2 min ago              │  ← Last sync time
│                                    │
│ Connected to Google Calendar       │  ← Account status
│                                    │
│ [+ New Event] [Sync now] [Disconnect]
└────────────────────────────────────┘
```

**Status Badge Types:**
- **● Online** (green) - Connected to internet
- **○ Offline** (gray) - No connection

**Pending Operations:**
- Shows count of operations in queue
- Format: "X syncing…"
- Only visible when X > 0

**Failed Operations:**
- Shows when sync errors occur
- Format: "X failed [Retry all]"
- Includes retry button

**Last Sync Time:**
- "Last synced X ago" - relative time
- Updates every minute
- Formats:
  - "moments ago" (< 1 minute)
  - "2 min ago" (< 60 minutes)
  - "3h ago" (> 60 minutes)

---

### 7.3 Manual Sync

**Test Case:** Trigger immediate sync

**Steps:**
1. Click **"Sync now"** button in header
2. Wait for sync to complete

**Expected Output:**

**During Sync:**
```
[Syncing…]  ← Button shows loading state
```

**After Sync:**
```
[Sync now]  ← Button returns to normal
Last synced moments ago  ← Timestamp updates
```

**Behavior:**
- ✅ Button disabled while syncing
- ✅ Fetches latest events from Google Calendar
- ✅ Pushes pending local changes
- ✅ Updates "Last synced" timestamp
- ✅ Resolves any conflicts
- 🚫 Disabled when offline

**Use Cases:**
- Force immediate sync
- Check for new events from other devices
- Resolve sync issues

---

### 7.4 Disconnecting Google Account

**Test Case:** Unlink Google Calendar

**Steps:**
1. Click **"Disconnect"** button
2. Confirm disconnection

**Expected Output:**
- ✅ Account status changes to "Google account not connected"
- ✅ Button changes to "Connect Google"
- ✅ Local events remain visible
- ✅ Sync stops
- ⚠️ **Warning:** Events won't sync to Google until reconnected

---

### 7.5 Account Needs Attention

**Test Case:** Handle expired or revoked credentials

**Scenario:** OAuth token expires or user revokes access in Google settings

**Expected Output:**

```
Calendar Header:
┌────────────────────────────────────┐
│ ⚠ Account needs attention          │
│ [Reconnect Google]  ← Warning button
└────────────────────────────────────┘
```

**Event Details Panel:**
```
Sync Status
⚠ Account needs attention
[Reconnect Google]  ← Action button
```

**Steps to Resolve:**
1. Click **"Reconnect Google"** button
2. Re-authenticate via OAuth flow
3. Sync resumes automatically

---

## 8. Offline & Outbox Functionality

### 8.1 Testing Offline Mode

**Test Case:** Use calendar while offline

**Setup - Simulate Offline:**
1. Open browser DevTools (F12 or Cmd+Option+I on Mac)
2. Go to **Network** tab
3. Check **"Offline"** checkbox

**Alternative:**
- Disable Wi-Fi/Ethernet
- Or select "Slow 3G" throttling in DevTools

**Expected Output:**

```
Calendar Header:
┌────────────────────────────────────┐
│ ○ Offline                          │  ← Status indicator
│ Last synced 5 min ago              │
│                                    │
│ [+ New Event] [Sync now] [Disconnect]
│               ↑ Disabled           │
└────────────────────────────────────┘
```

**Behavior:**
- ✅ Status badge shows **"○ Offline"** (gray)
- ✅ "Sync now" button disabled
- ✅ "Retry all" button disabled (if failed ops exist)
- ✅ Can still create, edit, delete events
- ✅ Changes queued in outbox
- ✅ Sync indicators show **"○ Local"** on new events

---

### 8.2 Creating Events Offline

**Test Case:** Create event without internet

**Prerequisites:** Browser in offline mode

**Steps:**
1. Click **"+ New Event"**
2. Fill in event details:
   - **Title:** "Offline Test Event"
   - **Time:** 3:00 PM – 4:00 PM
3. Click **"Save"**

**Expected Output:**
```
Event Timeline:
┌────────────────────────────────────┐
│ Offline Test Event            ○    │  ← Local indicator
│ 3:00 PM — 4:00 PM                  │
│ Private focus time                 │
└────────────────────────────────────┘
```

**Event Details:**
```
Sync Status
○ Local
```

**Header Status:**
```
1 syncing…  ← Pending operations counter
```

**Behavior:**
- ✅ Event saves to local IndexedDB
- ✅ Appears in timeline immediately
- ✅ Marked with **"○ Local"** indicator
- ✅ Added to outbox queue (status: pending)
- ✅ Pending badge shows in header

---

### 8.3 Reconnecting Online

**Test Case:** Sync queued changes when back online

**Steps:**
1. While offline, create/edit/delete several events
2. Note pending count (e.g., "5 syncing…")
3. Re-enable internet (uncheck "Offline" in DevTools)
4. Observe automatic sync

**Expected Output:**

**Immediately After Reconnecting:**
```
Calendar Header:
┌────────────────────────────────────┐
│ ● Online                           │  ← Status changes
│ 5 syncing…                         │  ← Operations processing
└────────────────────────────────────┘
```

**During Sync (1-5 seconds):**
```
Event Status:
○ Local  →  ↻ Syncing to Google…
```

**After Sync Completes:**
```
● Online
Last synced moments ago
```

**Events Update:**
```
↻ Syncing to Google…  →  ✓ Synced
```

**Behavior:**
- ✅ Outbox worker detects online status
- ✅ Processes pending operations in order
- ✅ Each operation:
  - Changes status: pending → applying → applied
  - Updates event sync indicator
  - Removes from pending count
- ✅ All events eventually show **✓ Synced**
- ✅ Pending count decreases to 0

**Automatic Retry Logic:**
- Outbox checks every 5 seconds
- Exponential backoff on failures
- Max 10 retry attempts per operation

---

### 8.4 Failed Operations

**Test Case:** Handle sync failures

**Scenario:** Network error, permission denied, or conflict

**Expected Output:**

```
Calendar Header:
┌────────────────────────────────────┐
│ ● Online                           │
│ 2 failed  [Retry all]              │  ← Failed badge with retry
└────────────────────────────────────┘
```

**Event Status:**
```
Sync Status
! Sync failed
Error: Permission denied

[Retry sync]  ← Action button
```

**Steps to Retry:**
1. Fix underlying issue (e.g., reconnect account)
2. Click **"Retry all"** in header, or
3. Click **"Retry sync"** on individual event

**Expected Behavior:**
- ✅ Failed operations marked distinctly
- ✅ Error message displayed
- ✅ Manual retry available
- ✅ After retry: operation re-queues (status: pending)
- ✅ Automatic retry continues with backoff

**Common Failure Reasons:**
- Network timeout
- Google API rate limit
- OAuth token expired (needs reconnect)
- Calendar permission changed (now read-only)
- Event deleted in Google Calendar (conflict)

---

### 8.5 Outbox Inspection (Advanced)

**Test Case:** View outbox operations in browser storage

**Steps:**
1. Open DevTools > **Application** tab
2. Expand **IndexedDB**
3. Find **lifeos-outbox** database
4. Open **outbox** store
5. View pending operations

**Expected Data Structure:**

```javascript
{
  opId: "uuid-1234-5678-9012",
  userId: "demo-user",
  eventId: "local:event-456",
  type: "create",  // or "update", "delete"
  status: "pending",  // or "applying", "applied", "failed"
  eventData: { /* full event object */ },
  baseRev: 1,
  updatedByDeviceId: "device-abc-123",
  createdAtMs: 1702987654321,
  availableAtMs: 1702987654321,
  attempts: 0,
  lastError: null
}
```

**Operation Lifecycle:**
```
pending → applying → applied (success)
                  ↘ failed (error, retryable)
```

**Retry Timing:**
- 1st retry: 1 second wait
- 2nd retry: 2 seconds wait
- 3rd retry: 4 seconds wait
- Max wait: 60 seconds
- Max attempts: 10
- After 10 failures: remains "failed" until manual retry

---

## 9. Today Dashboard

### 9.1 Inspiration Card

**Test Case:** View daily quote and header info

**Location:** [Today Page](apps/web-vite/src/pages/TodayPage.tsx) > Top section

**Expected Output:**

```
┌──────────────────────────────────────────────────┐
│ Today · Friday, December 20                      │
│ Remote · Mountain View · 2:30 PM PST             │
├──────────────────────────────────────────────────┤
│                                                  │
│ "The secret of getting ahead is getting started."│
│                                                  │
│ — Mark Twain                                     │
└──────────────────────────────────────────────────┘
```

**Content:**
- **Date:** Current day formatted as "Weekday, Month Day"
- **Location:** "Remote · Mountain View" (hardcoded)
- **Time:** Current time with timezone (updates live)
- **Quote:** One of 5 inspirational quotes
- **Author:** Quote attribution

**Quote Rotation:**
Quotes change daily based on day of year:
1. "The secret of getting ahead is getting started." - Mark Twain
2. "Focus on being productive instead of busy." - Tim Ferriss
3. "Do the hard jobs first. The easy jobs will take care of themselves." - Dale Carnegie
4. "The way to get started is to quit talking and begin doing." - Walt Disney
5. "Your time is limited, so don't waste it living someone else's life." - Steve Jobs

**Behavior:**
- ✅ Quote stays consistent throughout the day
- ✅ Changes at midnight
- ✅ Same quote shown on all devices on same day
- ✅ Time updates every render
- ✅ Timezone auto-detected from browser

---

### 9.2 Calendar Preview

**Test Case:** View today's event schedule

**Location:** Today Page > Left column

**Expected Output:**

```
┌─────────────────────────────────────┐
│ Calendar Preview                    │
├─────────────────────────────────────┤
│ 9:00 AM - 10:00 AM                  │
│ Leadership sync                     │
│ 2 guests                            │
├─────────────────────────────────────┤
│ 11:00 AM - 12:00 PM                 │
│ Focus time                          │
│                                     │
├─────────────────────────────────────┤
│ 2:00 PM - 3:00 PM                   │
│ Design crit                         │
│ 1 guest                             │
└─────────────────────────────────────┘
```

**Display Elements:**
- **Time Range:** Start - End in 12-hour format
- **Event Title:** Name of event
- **Guest Count:** "X guest(s)" if attendees present

**Current Implementation:**
✅ **Real calendar integration implemented**
- Displays actual events from user's calendar
- Updates dynamically when calendar changes
- Links to calendar page for event management

**Fallback Behavior:**
- Shows sample data when calendar unavailable
- Graceful error handling for network issues

---

### 9.3 Top Priority Todos

**Test Case:** View high-priority tasks

**Location:** Today Page > Right column

**Expected Output:**

```
┌─────────────────────────────────────┐
│ Top Priority To-dos                 │
│                                     │
│ Legend: 🔴 P1  🟠 P2  🟡 P3        │
├─────────────────────────────────────┤
│ ☐ Confirm executive summary    [P1]│
│ ☐ Review async design doc       [P2]│
│ ☐ Answer support triage         [P3]│
└─────────────────────────────────────┘
```

**Display Elements:**
- **Priority Legend:** Color dots with P1, P2, P3 labels
- **Checkboxes:** Interactive (currently non-functional)
- **Todo Title:** Task description
- **Priority Badge:** Colored badge (P1=red, P2=orange, P3=yellow)

**Priority Color Coding:**
- **P1 (Critical):** 🔴 Red background
- **P2 (High):** 🟠 Orange background
- **P3 (Normal):** 🟡 Yellow background

**Current Implementation:**
⚠️ **Note:** Todos are currently **hardcoded sample data**

**Expected Future Behavior:**
- Display real todos from database
- Checkboxes toggle completion
- Shows top 3 by priority
- Links to todos page

---

### 9.4 Stats Grid

**Test Case:** View daily calendar statistics

**Location:** Today Page > Bottom section

**Expected Output:**

```
┌─────────────────────────────────────────────────┐
│  Meetings          Free Time       Utilization  │
│                                                 │
│  2.0h              19.0h           21%          │
│  Hours with        Available for   Calendar     │
│  guests today      focused work    usage today  │
└─────────────────────────────────────────────────┘
```

**Three Metrics Displayed:**

**1. Meetings**
- **Value:** Total hours with attendees
- **Label:** "Hours with guests today"
- **Calculation:** Sum duration of events where `attendees.length > 0`
- **Example:** Two 1-hour meetings = 2.0h

**2. Free Time**
- **Value:** Available hours
- **Label:** "Available for focused work"
- **Calculation:** `max(24 - busyHours, 0)`
- **Example:** 5 hours of events = 19.0h free

**3. Utilization**
- **Value:** Percentage of day scheduled
- **Label:** "Calendar usage today"
- **Calculation:** `(busyHours / 24) * 100`
- **Example:** 5 hours busy = 21% utilization

**Calculation Details:**

```javascript
// Meeting hours (events with guests)
meetingHours = events
  .filter(evt => evt.attendees.length > 0)
  .reduce((sum, evt) =>
    sum + (evt.endMs - evt.startMs) / 3_600_000,
    0
  )

// Total busy hours (all events)
busyHours = events
  .reduce((sum, evt) =>
    sum + (evt.endMs - evt.startMs) / 3_600_000,
    0
  )

// Free hours (can't be negative)
freeHours = Math.max(24 - busyHours, 0)

// Utilization percentage
utilization = Math.round((busyHours / 24) * 100)
```

**Edge Cases:**
- ✅ **No events:** 0h meetings, 24.0h free, 0% utilization
- ✅ **Fully booked:** 24.0h meetings, 0.0h free, 100% utilization
- ✅ **Overlapping events:** All count toward busy time (can exceed 24h)
- ✅ **Multi-day events:** Only today's portion counted

**Current Implementation:**
⚠️ **Note:** Stats calculated from **hardcoded sample events**

**Expected Future Behavior:**
- Calculate from real calendar events
- Update live as events change
- Show different date ranges (week, month)

---

## 10. Month View

### 10.1 Calendar Grid Display

**Test Case:** View monthly calendar

**Location:** Calendar Page > Month View section (middle)

**Expected Output:**

```
        December 2024
┌───────────────────────────────────┐
│ Sun Mon Tue Wed Thu Fri Sat       │
├───────────────────────────────────┤
│  1   2   3   4   5   6   7       │
│  •       •   ••      •            │
│                                   │
│  8   9  10  11  12  13  14       │
│      •       •   •   ↻            │
│                                   │
│ 15  16  17  18  19  20  21       │
│  •   •       •   •  [20] •       │  ← Today highlighted
│                                   │
│ 22  23  24  25  26  27  28       │
│  •   •   •   •   ••  •   •       │
│                                   │
│ 29  30  31   1   2   3   4       │
│  •   •       •   •   •   •       │  ← Next month (gray)
└───────────────────────────────────┘
```

**Display Features:**
- **Month/Year Header:** Current month name and year
- **Week Grid:** Sunday to Saturday columns
- **Previous/Next Month Days:** Shown in gray
- **Today Highlight:** Special border/background on current date
- **Event Indicators:**
  - Dots (•) represent events
  - Up to 3 dots shown per day
  - Recurring events marked with ↻
  - "+X more" if > 3 events

---

### 10.2 Selecting Dates

**Test Case:** Click dates in month view

**Steps:**
1. Click any date in the month view
2. Observe selection highlight
3. Click another date

**Expected Output:**

**Before Selection:**
```
│ 15  16  17  18  19  20  21       │
│  •   •       •   •  [20] •       │  ← Today in brackets
```

**After Clicking Date 18:**
```
│ 15  16  17  18  19  20  21       │
│  •   •       • [[18]] [20] •     │  ← Selected in double brackets
```

**Behavior:**
- ✅ Clicked date shows selected state (highlight)
- ✅ Previous selection clears
- ✅ Today marker remains visible separately
- ✅ Selection persists until another date clicked

**Current Implementation:**
✅ **Date filtering fully implemented**
- Selecting a date filters event timeline to show only that date's events
- "Back to Today" button returns to current date view
- Header updates to show selected date information
- Smooth scroll to event timeline on date selection

---

### 10.3 Event Indicators

**Test Case:** View event count per day

**Scenario:** Day with multiple events

**Expected Output:**

**3 or Fewer Events:**
```
│ 15 │
│ •• │  ← 2 events shown as 2 dots
```

**More Than 3 Events:**
```
│ 15  │
│ ••• │  ← 3 dots shown
│ +2  │  ← "+2 more" indicator
```

**Recurring Event:**
```
│ 15 │
│ ↻• │  ← Recurring icon + regular event
```

**Behavior:**
- ✅ Each dot represents one event
- ✅ Maximum 3 dots displayed
- ✅ Overflow shown as "+X more"
- ✅ Recurring events show ↻ icon
- ✅ Color-coded by event type (optional)

---

## 11. Calendar View Toggles

### 13.1 Daily, Weekly, Monthly View Selection

**Test Case:** Switch between different calendar view types

**Location:** Calendar Page > Header > View Toggle Buttons

**Steps:**
1. Click **"Day"**, **"Week"**, or **"Month"** buttons in calendar header
2. Observe view changes accordingly

**Expected Output:**

**Daily View:**
```
Calendar · [Selected Date] in [Timezone]
Today in Pacific Time

[Event Timeline - shows detailed events for selected day]
- Event 1 at 9:00 AM - 10:00 AM
- Event 2 at 2:00 PM - 3:00 PM
```

**Weekly View:**
```
Calendar · [Selected Date] in [Timezone]
Today in Pacific Time

[7-day week grid showing current week]
Sun Mon Tue Wed Thu Fri Sat
[date grid with event dots]
```

**Monthly View:**
```
Calendar · [Selected Date] in [Timezone]
Today in Pacific Time

[6-week month grid]
Sun Mon Tue Wed Thu Fri Sat
[date grid with event indicators]
```

**Behavior:**
- ✅ View toggle buttons change active state styling
- ✅ Each view maintains date selection state
- ✅ Weekly view shows 7-day grid for selected week
- ✅ Monthly view shows full month calendar
- ✅ Daily view shows detailed event timeline
- ✅ Date selection works in all views

---

## 16. Weekly View

### 16.1 Weekly Calendar Display

**Test Case:** View events in weekly format

**Location:** Calendar Page > Select "Week" view

**Expected Output:**

**Week Header:**
```
December 16 - 22, 2024
```

**Day Grid:**
```
Sun Mon Tue Wed Thu Fri Sat
 1   2   3   4   5   6   7
 •       •   ••      •
```

**Event Indicators:**
- ✅ Up to 3 event dots per day
- ✅ "+X more" for days with >3 events
- ✅ Recurring events show different styling
- ✅ Click date to filter event timeline
- ✅ Today highlighted with special styling

### 16.2 Week Navigation

**Test Case:** Navigate between weeks

**Setup:** Select Week view

**Expected Behavior:**
- ✅ Shows current week by default
- ✅ Week range updates in header
- ✅ Date selection works within week view
- ✅ Clicking dates filters timeline to that day

---

## 13. Settings - Quote Management

### 13.1 Overview

The Settings page provides a comprehensive quote management system that allows users to customize the inspirational quotes shown on the Today dashboard. Users can add up to 1,000 custom quotes, and quotes are selected deterministically based on the date to ensure consistency.

**Location:** [Settings Page](apps/web-vite/src/pages/SettingsPage.tsx)

**Key Features:**
- Add up to 1,000 custom quotes
- Edit existing quotes (text and author)
- Delete quotes
- Reset to default collection (5 quotes)
- Deterministic daily selection (same date = same quote)
- Character limits (500 for text, 100 for author)

---

### 13.2 Accessing Quote Management

**Test Case:** Navigate to Settings page

**Steps:**
1. Click **"Settings"** in the sidebar navigation
2. Settings page loads with "Daily Inspirational Quotes" section

**Expected Output:**

```
┌──────────────────────────────────────────────────────────┐
│ SETTINGS                                                 │
│ Daily Inspirational Quotes                               │
│ Manage your collection of daily quotes (5/1000)          │
│                                                          │
│                      [Reset to Defaults]  [+ Add Quote]  │
└──────────────────────────────────────────────────────────┘
```

**Behavior:**
- ✅ Header shows "Daily Inspirational Quotes"
- ✅ Quote count displays current/max (e.g., "5/1000")
- ✅ Two action buttons visible: "Reset to Defaults" and "+ Add Quote"
- ✅ Loading state shows "Loading quotes..." initially
- ✅ Default quotes load if no custom quotes exist

---

### 13.3 Viewing Quote List

**Test Case:** View existing quotes

**Expected Output:**

```
┌──────────────────────────────────────────────────────────┐
│ "The secret of getting ahead is getting started."        │
│ — Mark Twain                                             │
│                                          [Edit] [Delete]  │
├──────────────────────────────────────────────────────────┤
│ "Focus on being productive instead of busy."             │
│ — Tim Ferriss                                            │
│                                          [Edit] [Delete]  │
├──────────────────────────────────────────────────────────┤
│ "Do the hard jobs first..."                              │
│ — Dale Carnegie                                          │
│                                          [Edit] [Delete]  │
└──────────────────────────────────────────────────────────┘
```

**Quote Card Display:**
- **Quote text:** Italicized, larger font (1.125rem)
- **Author:** Smaller, muted text with em dash (—)
- **Action buttons:** "Edit" and "Delete" (right-aligned)
- **Hover effect:** Border color changes to primary on hover

**Empty State:**
If no quotes exist:
```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│        No quotes yet. Add your first inspirational       │
│                    quote!                                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

### 13.4 Adding New Quote

**Test Case:** Add a custom quote

**Steps:**
1. Click **"+ Add Quote"** button
2. Add form appears above quote list
3. Enter quote text (max 500 characters)
4. Enter author name (max 100 characters)
5. Click **"Save Quote"**

**Expected Output:**

**Before Adding:**
```
Header shows: (5/1000)
"+ Add Quote" button enabled
```

**During Adding:**
```
┌──────────────────────────────────────────────────────────┐
│ NEW QUOTE                                                │
├──────────────────────────────────────────────────────────┤
│ Quote Text                                               │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Enter quote text...                                │  │
│ │                                                    │  │
│ │                                                    │  │
│ └────────────────────────────────────────────────────┘  │
│ 0/500                                                    │
│                                                          │
│ Author                                                   │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Author name...                                     │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│                               [Cancel]  [Save Quote]     │
└──────────────────────────────────────────────────────────┘
```

**After Saving:**
- ✅ Form closes
- ✅ New quote appears in list
- ✅ Quote count updates (e.g., 5/1000 → 6/1000)
- ✅ Quote saved to Firestore
- ✅ Quote available immediately on Today page

**Form Validation:**
- ❌ **Empty text:** "Save Quote" button disabled
- ❌ **Empty author:** "Save Quote" button disabled
- ❌ **Max quotes reached (1000):** Button disabled, error shows "Maximum of 1000 quotes reached"
- ✅ **Character counter:** Shows X/500 for text, updates live
- ✅ **Textarea auto-resizes:** Minimum 3 rows, can expand

---

### 13.5 Editing Existing Quote

**Test Case:** Modify quote text and author

**Steps:**
1. Click **"Edit"** button on any quote
2. Quote card switches to edit mode
3. Modify text and/or author
4. Click **"Save Changes"**

**Expected Output:**

**Edit Mode:**
```
┌──────────────────────────────────────────────────────────┐
│ EDITING QUOTE                                            │
├──────────────────────────────────────────────────────────┤
│ Quote Text                                               │
│ ┌────────────────────────────────────────────────────┐  │
│ │ The secret of getting ahead is getting started.    │  │
│ │                                                    │  │
│ └────────────────────────────────────────────────────┘  │
│ 50/500                                                   │
│                                                          │
│ Author                                                   │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Mark Twain                                         │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│                            [Cancel]  [Save Changes]      │
└──────────────────────────────────────────────────────────┘
```

**Behavior:**
- ✅ Quote card shows green border (editing state)
- ✅ Textarea pre-filled with current text
- ✅ Input pre-filled with current author
- ✅ Character counter shows current length
- ✅ Click "Cancel" reverts to view mode without saving
- ✅ Click "Save Changes" updates quote
- ✅ Updated quote syncs to Firestore
- ✅ Changes reflect immediately on Today page (after refresh)

**Simultaneous Editing:**
- ✅ Only one quote in edit mode at a time
- ✅ Clicking "Edit" on another quote cancels current edit
- ✅ Adding new quote cancels any active edit

---

### 13.6 Deleting Quotes

**Test Case:** Remove a quote from collection

**Steps:**
1. Click **"Delete"** button (red text) on any quote
2. Confirmation dialog appears
3. Confirm deletion

**Expected Output:**

**Confirmation Dialog:**
```
┌──────────────────────────────────────────┐
│ Are you sure you want to delete this    │
│ quote?                                   │
│                                          │
│                   [Cancel]  [OK]         │
└──────────────────────────────────────────┘
```

**After Confirming:**
- ✅ Quote removed from list immediately
- ✅ Quote count decrements (e.g., 6/1000 → 5/1000)
- ✅ Deletion syncs to Firestore
- ✅ Remaining quotes reordered (order: 0, 1, 2...)
- ✅ Today page shows different quote if deleted quote was selected for today

**Canceling:**
- ✅ Click "Cancel" closes dialog
- ✅ Quote remains in list

---

### 13.7 Resetting to Defaults

**Test Case:** Restore default quote collection

**Steps:**
1. Click **"Reset to Defaults"** button
2. Confirmation dialog appears
3. Confirm reset

**Expected Output:**

**Confirmation Dialog:**
```
┌──────────────────────────────────────────┐
│ Reset to default quotes? This will      │
│ delete all your custom quotes.          │
│                                          │
│                   [Cancel]  [OK]         │
└──────────────────────────────────────────┘
```

**After Confirming:**
- ✅ All custom quotes deleted
- ✅ Default quotes restored (5 quotes):
  1. Mark Twain - "The secret of getting ahead is getting started."
  2. Tim Ferriss - "Focus on being productive instead of busy."
  3. Dale Carnegie - "Do the hard jobs first..."
  4. Walt Disney - "The way to get started is to quit talking..."
  5. Steve Jobs - "Your time is limited, so don't waste it..."
- ✅ Quote count shows "5/1000"
- ✅ Today page shows default quote

---

### 13.8 Quote Selection Algorithm

**Test Case:** Verify deterministic quote selection

**How It Works:**
```javascript
// Date converted to seed number
// Example: "2024-12-20" → 20241220
const dateSeed = parseInt(date.replace(/-/g, ''), 10)

// Modulo operation ensures same date = same quote
const index = dateSeed % quotes.length

return quotes[index]
```

**Testing Determinism:**
1. Navigate to Today page
2. Note which quote is displayed
3. Refresh page multiple times
4. Verify same quote shows
5. Change system date to tomorrow
6. Verify different quote shows
7. Change date back to today
8. Verify original quote shows again

**Expected Behavior:**
- ✅ Same date always returns same quote
- ✅ Quote stays consistent throughout the day
- ✅ Quote changes at midnight
- ✅ Quote selection deterministic across devices (same date = same quote)
- ✅ Works with any number of quotes (1 to 1000)

**Example Calculation:**
```
Date: 2024-12-20
Quotes count: 10

Seed: 20241220
Index: 20241220 % 10 = 0
Result: First quote (index 0)

Date: 2024-12-21
Seed: 20241221
Index: 20241221 % 10 = 1
Result: Second quote (index 1)
```

---

### 13.9 Character Limits & Validation

**Test Case:** Test input validation

**Quote Text:**
- **Max Length:** 500 characters
- **Behavior:** Textarea allows up to 500 chars, blocks further input
- **Counter:** Shows "X/500" and updates live
- **Required:** Cannot save with empty text

**Author:**
- **Max Length:** 100 characters
- **Behavior:** Input allows up to 100 chars, blocks further input
- **Required:** Cannot save with empty author

**Save Button States:**
```
Disabled when:
- Quote text is empty
- Author is empty
- Text is only whitespace
- Author is only whitespace

Enabled when:
- Both fields have non-empty trimmed content
```

---

### 13.10 Error Handling

**Test Case:** Handle errors gracefully

**Scenarios:**

**1. Maximum Quotes Reached:**
```
┌──────────────────────────────────────────┐
│ ⚠ Maximum of 1000 quotes reached        │
│                                     ✕    │
└──────────────────────────────────────────┘
```
- ✅ Error banner appears at top
- ✅ "+ Add Quote" button disabled
- ✅ Can still edit/delete existing quotes

**2. Network Error:**
```
┌──────────────────────────────────────────┐
│ ⚠ Failed to save quote: Network error   │
│                                     ✕    │
└──────────────────────────────────────────┘
```
- ✅ Error message shows specific failure reason
- ✅ Quote not added to list (no optimistic update on error)
- ✅ User can retry

**3. Required Fields:**
```
┌──────────────────────────────────────────┐
│ ⚠ Both quote text and author are        │
│   required                          ✕    │
└──────────────────────────────────────────┘
```
- ✅ Shows when trying to save empty fields
- ✅ Form remains open for correction

**Error Banner Features:**
- **Red background:** rgba(239, 68, 68, 0.1)
- **Close button (✕):** Dismisses error
- **Auto-clear:** Error clears when action succeeds

---

### 13.11 Integration with Today Page

**Test Case:** Verify quotes sync to Today dashboard

**Steps:**
1. **In Settings:** Add new quote "Test quote" by "Test Author"
2. **Save quote**
3. **Navigate to Today page**
4. **Check if quote appears** (depends on date-based selection)

**Expected Behavior:**

**Quote Pool Updated:**
- ✅ Custom quotes immediately available for selection
- ✅ Default quotes replaced when custom quotes exist
- ✅ Today page loads from Firestore on mount
- ✅ Falls back to defaults if Firestore fails

**Loading State:**
```
Today Page - Inspiration Card:
┌──────────────────────────────────────────┐
│ Loading quote...                         │
└──────────────────────────────────────────┘
```

**Loaded State:**
```
┌──────────────────────────────────────────┐
│ "Test quote"                             │
│ — Test Author                            │
└──────────────────────────────────────────┘
```

**Refresh Behavior:**
- ✅ Refresh Today page: quote stays same (deterministic)
- ✅ Navigate away and back: quote stays same
- ✅ Browser reload: quote reloads from Firestore

---

### 13.12 Firestore Data Structure

**Test Case:** Verify data persistence

**Collection:** `quotes`
**Document ID:** `{userId}` (e.g., "demo-user")

**Document Structure:**
```javascript
{
  userId: "demo-user",
  quotes: [
    {
      id: "quote-1234567890-abc123",
      text: "The secret of getting ahead is getting started.",
      author: "Mark Twain",
      createdAt: "2024-12-20T10:30:00.000Z",
      updatedAt: "2024-12-20T10:30:00.000Z",
      order: 0
    },
    {
      id: "quote-1234567891-def456",
      text: "Focus on being productive instead of busy.",
      author: "Tim Ferriss",
      createdAt: "2024-12-20T10:31:00.000Z",
      updatedAt: "2024-12-20T10:31:00.000Z",
      order: 1
    }
    // ... up to 1000 quotes
  ],
  updatedAt: "2024-12-20T10:31:00.000Z"
}
```

**Field Details:**
- **id:** Unique identifier `quote-{timestamp}-{random}`
- **text:** Quote content (max 500 chars)
- **author:** Attribution (max 100 chars)
- **createdAt:** ISO 8601 timestamp when quote added
- **updatedAt:** ISO 8601 timestamp when quote last modified
- **order:** Position in list (0-999), used for deterministic selection
- **updatedAt (document):** Last time collection was modified

---

### 13.13 Performance Considerations

**Test Case:** Handle large quote collections

**Scenarios:**

**1. Loading 1000 Quotes:**
- ✅ Page loads within 2 seconds
- ✅ No UI freezing during render
- ✅ Scroll performance remains smooth

**2. Adding Quote #1000:**
- ✅ "+ Add Quote" button disables
- ✅ Error shows "Maximum of 1000 quotes reached"
- ✅ Cannot add more via form

**3. Firestore Read:**
- ✅ Single document read (not 1000 reads)
- ✅ Quotes array stored in one document
- ✅ Efficient for up to 1MB total (Firestore limit)

**Estimated Size:**
```
Average quote: ~150 chars text + 30 chars author + metadata = ~250 bytes
1000 quotes × 250 bytes = 250KB (well under 1MB limit)
```

---

## 16. Permissions & Security

### 13.1 Calendar Permissions

**Test Case:** View read-only calendar

**Setup:** Sync calendar with read-only access from Google

**Expected Behavior:**

**In Calendar List:**
```javascript
{
  calendarId: "readonly@group.calendar.google.com",
  canWrite: false,  // ← Read-only
  canDelete: false,
  canInvite: false
}
```

**UI Indicators:**
```
┌─────────────────────────────────────┐
│ Meeting from Read-Only Cal     ◎   │  ← Read-only icon
├─────────────────────────────────────┤
│ 👁 View only - you cannot edit     │
│ this event                          │
└─────────────────────────────────────┘
```

**Disabled Actions:**
- 🚫 Edit button grayed out
- 🚫 Delete button grayed out
- 🚫 Hover tooltip: "You do not have permission to edit this event"
- ✅ View event details (allowed)
- ✅ RSVP if you're an attendee (allowed)

---

### 13.2 Event-Level Permissions

**Permission Checks:**

**Can Edit Event:**
```javascript
canEditEvent(event, calendarsById) returns true if:
- Calendar is writable (canWrite: true)
- User is organizer OR
- User has edit permissions
```

**Can Delete Event:**
```javascript
canDeleteEvent(event, calendarsById) returns true if:
- Calendar is writable
- User is organizer OR
- User has delete permissions
```

**Can RSVP:**
```javascript
canRSVPToEvent(event) returns true if:
- User is attendee (not organizer)
- Event is in future
- Event is not cancelled
```

**Can Invite:**
```javascript
canInviteToEvent(event, calendarsById) returns true if:
- Calendar allows invites (canInvite: true)
- User is organizer OR
- User has invite permissions
```

---

### 13.3 Primary Calendar Write Access

**Test Case:** Attempt to create event with read-only primary

**Setup:** Primary calendar set to read-only

**Expected Output:**

```
Calendar Header:
┌────────────────────────────────────┐
│ [+ New Event]  ← Grayed out/disabled
└────────────────────────────────────┘
```

**Hover Tooltip:**
```
Calendar is read-only
```

**Behavior:**
- 🚫 "+ New Event" button disabled
- ✅ Can view all events
- ✅ Can RSVP to events where you're an attendee
- 🚫 Cannot create new events
- 🚫 Cannot edit events (even if organizer)

**Permission Check:**
```javascript
const primaryCalendar = calendars.find(c => c.isPrimary)
const canCreateEvents = primaryCalendar?.canWrite ?? true
```

---

## 16. Edge Cases & Special Scenarios

### 16.1 All-Day Events

**Test Case:** Create and manage all-day events

**Steps:**
1. Create new event
2. Toggle **"All day"** switch
3. Set start and end dates

**Expected Behavior:**

**Form Changes:**
```
☑ All day  ← Toggle enabled

Start Date: Dec 20, 2024
End Date:   Dec 21, 2024

Time pickers disappear  ← No hour/minute selection
```

**Event Display:**
```
Team Offsite
All day  ← Instead of time range
```

**Validation:**
- ✅ End date must be >= start date
- ❌ End date before start: "End date must be on or after start date"
- ✅ Can span multiple days
- 🚫 Alerts disabled (message shown)

**Storage:**
```javascript
{
  allDay: true,
  startMs: 1702857600000,  // Midnight start
  endMs: 1702943999000,    // 23:59:59 end
  timezone: "America/Los_Angeles"
}
```

---

### 16.2 Multi-Day Events

**Test Case:** Event spanning multiple days

**Setup:**
- Start: Dec 20, 9:00 AM
- End: Dec 22, 5:00 PM

**Expected Behavior:**

**Event Timeline:**
Shows on all relevant days

**Month View:**
```
│ 20  21  22 │
│ ↔  ↔  ↔ │  ← Event spans across
```

**occursOn Array:**
```javascript
{
  occursOn: ["2024-12-20", "2024-12-21", "2024-12-22"]
}
```

**Statistics:**
- ✅ Only counts hours on current day
- ✅ Today stats: Dec 20 portion only (9 AM - 11:59 PM = 15 hours)
- ✅ Dec 21: Full day (24 hours)
- ✅ Dec 22: Partial (12 AM - 5 PM = 17 hours)

---

### 16.3 Overlapping Events

**Test Case:** Two events at same time

**Setup:**
- Event A: 2:00 PM - 3:00 PM
- Event B: 2:30 PM - 3:30 PM

**Expected Behavior:**

**Event Timeline:**
```
Both events visible in timeline
Sorted by start time
```

**Statistics:**
```
Busy hours: 2 hours (not 1.5)
- Both events count toward total
- Overlaps are included in calculation
- Can result in >24 hours in a day
```

**Selection:**
- ✅ Can select either event
- ✅ No conflict warning in UI
- ✅ Both sync normally

---

### 16.4 Past Events

**Test Case:** View and edit events in the past

**Behavior:**

**Viewing:**
- ✅ Past events visible in timeline
- ✅ Can select and view details
- ✅ Sync status shown normally

**Editing:**
- ✅ Can edit past events
- ✅ No time restrictions
- ⚠️ **RSVP disabled** for past events
- ✅ Alerts don't fire for past events

**Alerts:**
```javascript
// Alert scheduler skips past events
if (event.startMs < now) {
  return null  // No alert
}
```

---

### 16.5 Cancelled Events

**Test Case:** Handle cancelled events

**Scenario:** Event cancelled in Google Calendar

**Expected Behavior:**

**Event Display:**
```
Meeting Cancelled       ⚠
Status: Cancelled
```

**Alerts:**
- 🚫 Alerts don't fire for cancelled events
- ✅ Alert configuration still visible

**RSVP:**
- 🚫 RSVP buttons disabled
- ℹ️ Message: "Event has been cancelled"

**Sync:**
- ✅ Cancellation syncs from Google
- ✅ Event remains visible (not deleted)
- ✅ Status indicator shows cancelled state

---

### 16.6 Recurring with Exceptions

**Test Case:** Edit single instance of recurring event

**Setup:**
1. Weekly recurring: "Team Sync" every Monday 10 AM
2. Edit one instance: change time to 2 PM

**Expected Behavior:**

**Master Series:**
```javascript
{
  canonicalEventId: "series-123",
  recurrenceV2: {
    rule: { freq: "WEEKLY", byWeekday: ["MO"] }
  },
  exceptionIds: ["exception-456"]  // ← Tracks exceptions
}
```

**Exception (Override):**
```javascript
{
  canonicalEventId: "exception-456",
  parentSeriesId: "series-123",  // ← Links to master
  startMs: /* 2 PM instead of 10 AM */,
  recurrenceOverride: {
    originalStartMs: /* Original 10 AM time */
  }
}
```

**Display:**
```
Dec 9  (Mon):  Team Sync  10:00 AM  ← Normal
Dec 16 (Mon):  Team Sync  2:00 PM   ← Exception
Dec 23 (Mon):  Team Sync  10:00 AM  ← Normal
```

**Editing Exception:**
- ✅ Shows as separate event
- ✅ Can edit independently
- ✅ Can delete exception (reverts to master time)
- ✅ Syncs as exception to Google Calendar

---

### 16.7 Multi-Device Sync

**Test Case:** Sync same event across devices

**Scenario:**
- Device A: Edit event title
- Device B: Edit event location
- Both offline, then reconnect

**Conflict Resolution:**

**Each Device Tracks:**
```javascript
{
  rev: 3,  // Revision number
  updatedByDeviceId: "device-a-uuid",
  updatedAtMs: 1702987654321
}
```

**Resolution Strategy:**
```
Last-write-wins with device ID tiebreaker:
1. Compare updatedAtMs (later wins)
2. If equal: compare updatedByDeviceId (lexicographic)
3. Winner's changes apply
4. Loser's changes discarded
```

**Example:**
```
Device A: updatedAtMs = 1000, deviceId = "aaa"
Device B: updatedAtMs = 1000, deviceId = "bbb"

Result: Device B wins (bbb > aaa)
Device A's changes overwritten
```

**User Experience:**
- ✅ Conflict resolved automatically
- ⚠️ Sync state may briefly show "conflict"
- ✅ Resolves to winning device's version
- ℹ️ **No manual conflict resolution UI** (last-write-wins is automatic)

---

### 16.8 Soft-Deleted Events

**Test Case:** Delete event (soft delete)

**Implementation:**
```javascript
{
  canonicalEventId: "event-123",
  deletedAtMs: 1702987654321,  // ← Marks as deleted
  title: "Deleted Event",
  // ... other fields remain
}
```

**Filtering:**
```javascript
events.filter(e => !isDeleted(e))

// isDeleted checks:
function isDeleted(event) {
  return event.deletedAtMs !== undefined
}
```

**Behavior:**
- ✅ Event marked with `deletedAtMs`
- ✅ Automatically filtered from display
- ✅ Still exists in Firestore (for sync)
- ✅ Google Calendar hard-deletes (removed completely)
- ✅ Soft-delete enables sync tracking

**Why Soft Delete:**
- Enables multi-device sync of deletion
- Prevents deleted events from reappearing
- Maintains audit trail
- Google Calendar API requirement

---

## 16. Complete Testing Checklist

### Core Event Management

- [ ] **Create single event**
  - [ ] With all fields filled
  - [ ] With minimal fields (title + time)
  - [ ] All-day event
  - [ ] Multi-day event
  - [ ] Verify appears in timeline
  - [ ] Verify sync status updates

- [ ] **Edit event**
  - [ ] Change title
  - [ ] Change date/time
  - [ ] Change location
  - [ ] Toggle all-day
  - [ ] Verify updates immediately (optimistic)
  - [ ] Verify syncs to Google

- [ ] **Delete event**
  - [ ] Confirm deletion modal
  - [ ] Verify removes from timeline
  - [ ] Verify selection clears
  - [ ] Verify syncs deletion

### Recurring Events

- [ ] **Create recurring event**
  - [ ] Daily (every 1 day)
  - [ ] Daily with interval (every 2 days)
  - [ ] Weekly (select multiple days)
  - [ ] Monthly (specific day)
  - [ ] Yearly
  - [ ] With "Never" end
  - [ ] With "Until" end date
  - [ ] With "Count" end (after N occurrences)
  - [ ] Verify recurrence description displays

- [ ] **Edit recurring event**
  - [ ] Scope: "This event only" - verify creates exception
  - [ ] Scope: "This and future" - verify series splits
  - [ ] Scope: "All events" - verify master updates
  - [ ] Verify instances update correctly

- [ ] **Delete recurring event**
  - [ ] Scope: "This" - verify single instance removed
  - [ ] Scope: "This and future" - verify series truncates
  - [ ] Scope: "All" - verify all instances removed

### Attendees & RSVP

- [ ] **View attendees** (requires Google sync)
  - [ ] Organizer section shows
  - [ ] Guest list displays
  - [ ] Response statuses visible (✓ ? ✗ ○)
  - [ ] Optional attendee badge shows
  - [ ] Response summary counts correct

- [ ] **RSVP to event**
  - [ ] Click "Accept" - verify updates
  - [ ] Click "Maybe" - verify updates
  - [ ] Click "Decline" - verify updates
  - [ ] Verify "You responded: X" appears
  - [ ] Verify syncs to Google
  - [ ] Verify disabled when offline

### Alerts & Notifications

- [ ] **Set event alert**
  - [ ] Select "None" - verify no alert
  - [ ] Select "At time of event"
  - [ ] Select "5 minutes before"
  - [ ] Select other presets (10, 15, 30 min, 1 hour)
  - [ ] Select "Custom" and enter minutes
  - [ ] Verify bell icon shows when set
  - [ ] Verify disabled for all-day events

- [ ] **Alert notifications**
  - [ ] Create event starting in 5 min with 5-min alert
  - [ ] Wait for alert banner to appear
  - [ ] Verify shows event title, time, countdown
  - [ ] Click "Open" - verify jumps to event
  - [ ] Click "Dismiss" - verify alert closes
  - [ ] Refresh page - verify alert doesn't reappear
  - [ ] Verify multiple alerts stack

### Google Calendar Sync

- [ ] **Connect account**
  - [ ] Click "Connect Google"
  - [ ] Complete OAuth flow
  - [ ] Verify status shows "Connected"
  - [ ] Verify button changes to "Disconnect"
  - [ ] Verify events sync from Google

- [ ] **Sync operations**
  - [ ] Click "Sync now" - verify fetches latest
  - [ ] Verify "Last synced" timestamp updates
  - [ ] Create event - verify syncs to Google
  - [ ] Edit event in Google - verify syncs to app
  - [ ] Delete event in Google - verify syncs to app

- [ ] **Disconnect account**
  - [ ] Click "Disconnect"
  - [ ] Verify status shows "Not connected"
  - [ ] Verify local events remain visible
  - [ ] Verify sync stops

### Offline & Outbox

- [ ] **Offline mode**
  - [ ] Enable offline mode (DevTools Network > Offline)
  - [ ] Verify status shows "○ Offline"
  - [ ] Verify "Sync now" disabled
  - [ ] Create event offline - verify appears with "○ Local"
  - [ ] Edit event offline - verify queues
  - [ ] Delete event offline - verify queues
  - [ ] Verify pending count increases

- [ ] **Reconnect online**
  - [ ] Disable offline mode
  - [ ] Verify status shows "● Online"
  - [ ] Verify pending operations process
  - [ ] Verify events change to "✓ Synced"
  - [ ] Verify pending count decreases to 0

- [ ] **Failed operations**
  - [ ] Cause sync failure (disconnect account)
  - [ ] Verify "X failed" badge appears
  - [ ] Click "Retry all" - verify re-queues
  - [ ] Fix issue and verify syncs

### Today Page

- [ ] **Inspiration card**
  - [ ] Verify date shows current day
  - [ ] Verify time shows and updates
  - [ ] Verify timezone displays
  - [ ] Verify quote displays with author
  - [ ] Check quote changes tomorrow

- [ ] **Calendar preview**
  - [ ] Verify events list displays
  - [ ] Verify shows time ranges
  - [ ] Verify shows guest counts

- [ ] **Todos section**
  - [ ] Verify priority legend shows
  - [ ] Verify top 3 todos display
  - [ ] Verify priority badges color-coded
  - [ ] Check checkboxes (currently non-functional)

- [ ] **Stats grid**
  - [ ] Verify "Meetings" shows hours with guests
  - [ ] Verify "Free Time" calculates correctly
  - [ ] Verify "Utilization" shows percentage
  - [ ] Create/delete events and verify updates

### Month View

- [ ] **Calendar display**
  - [ ] Verify current month shows
  - [ ] Verify today highlighted
  - [ ] Verify weekday headers (Sun-Sat)
  - [ ] Verify previous/next month days grayed
  - [ ] Verify event dots appear on event days
  - [ ] Verify "+X more" for >3 events per day

- [ ] **Date selection**
  - [ ] Click any date - verify highlights
  - [ ] Click another date - verify selection moves
  - [ ] Verify today marker remains separate

### Quote Management (Settings)

- [ ] **Access and view quotes**
  - [ ] Navigate to Settings page
  - [ ] Verify quote list loads
  - [ ] Verify quote count shows (X/1000)
  - [ ] Verify default quotes show if none exist

- [ ] **Add new quote**
  - [ ] Click "+ Add Quote" button
  - [ ] Enter quote text (test max 500 chars)
  - [ ] Enter author (test max 100 chars)
  - [ ] Verify character counter updates
  - [ ] Save and verify appears in list
  - [ ] Verify count increments
  - [ ] Test empty fields - save disabled
  - [ ] Test max quotes (1000) - button disabled

- [ ] **Edit quote**
  - [ ] Click "Edit" on any quote
  - [ ] Modify text and author
  - [ ] Verify character counter
  - [ ] Save changes - verify updates
  - [ ] Cancel - verify reverts without saving
  - [ ] Test editing multiple (only one at a time)

- [ ] **Delete quote**
  - [ ] Click "Delete" on any quote
  - [ ] Confirm deletion dialog
  - [ ] Verify quote removed from list
  - [ ] Verify count decrements
  - [ ] Cancel dialog - quote remains

- [ ] **Reset to defaults**
  - [ ] Click "Reset to Defaults"
  - [ ] Confirm reset dialog
  - [ ] Verify all custom quotes deleted
  - [ ] Verify 5 default quotes restored
  - [ ] Verify count shows "5/1000"

- [ ] **Quote selection algorithm**
  - [ ] Navigate to Today page
  - [ ] Note displayed quote
  - [ ] Refresh page - same quote shows
  - [ ] Check tomorrow (or change date) - different quote
  - [ ] Verify deterministic (same date = same quote)

- [ ] **Integration with Today page**
  - [ ] Add custom quote in Settings
  - [ ] Navigate to Today page
  - [ ] Verify quote pool updated
  - [ ] Verify loading state shows
  - [ ] Verify fallback to defaults if error

### Permissions

- [ ] **Read-only calendar** (requires Google sync)
  - [ ] View event from read-only calendar
  - [ ] Verify "Edit" button disabled
  - [ ] Verify "Delete" button disabled
  - [ ] Verify tooltip shows permission message
  - [ ] Verify can still view details

- [ ] **RSVP permissions**
  - [ ] As organizer: verify no RSVP section
  - [ ] As attendee: verify RSVP buttons show
  - [ ] For past event: verify RSVP disabled

### Edge Cases

- [ ] **Form validation**
  - [ ] Submit without title - verify error
  - [ ] Set end before start - verify error
  - [ ] All-day: end before start - verify error
  - [ ] Verify all errors display clearly

- [ ] **Multi-day events**
  - [ ] Create 3-day event
  - [ ] Verify appears in month view on all days
  - [ ] Verify stats count correctly per day

- [ ] **Overlapping events**
  - [ ] Create two overlapping events
  - [ ] Verify both visible in timeline
  - [ ] Verify both count toward busy hours

- [ ] **Cancelled events**
  - [ ] Sync cancelled event from Google
  - [ ] Verify shows cancelled status
  - [ ] Verify alerts don't fire

- [ ] **Browser compatibility**
  - [ ] Test on Chrome 120+
  - [ ] Test on Firefox 121+
  - [ ] Test on Safari 17+
  - [ ] Test on Edge 120+

---

## Appendix A: Sample Test Scenarios

### Scenario 1: Morning Planning

**Goal:** Plan your day using LifeOS

1. Open Today page - review inspirational quote and stats
2. Check calendar preview for today's meetings
3. Navigate to Calendar page
4. Create new event "Focus time - Project work" 9 AM - 11 AM
5. Set alert for 5 minutes before
6. Create recurring event "Daily standup" 11:30 AM - 12 PM, Daily, Never ends
7. Review stats - verify utilization increased
8. Wait for alert notification to appear

**Expected:** Full daily planning flow works end-to-end

---

### Scenario 2: Offline Meeting Entry

**Goal:** Create events without internet

1. Enable offline mode (DevTools)
2. Create event "Client call" 2 PM - 3 PM
3. Create event "Team retro" 3:30 PM - 4:30 PM
4. Verify both show "○ Local" status
5. Verify header shows "2 syncing…"
6. Reconnect online
7. Verify both events sync (status → "✓ Synced")
8. Verify pending count → 0
9. Check Google Calendar - verify events appear

**Expected:** Offline creation and sync works flawlessly

---

### Scenario 3: Meeting RSVP

**Goal:** Respond to meeting invitation

1. Sync account with events from Google Calendar
2. Find event where you're an attendee
3. Review attendee list and response summary
4. Click "Accept" in RSVP section
5. Verify "You responded: Accepted ✓" appears
6. Verify your name shows ✓ in attendee list
7. Verify event syncs to Google
8. Check Google Calendar - verify response updated

**Expected:** RSVP flow works and syncs to Google

---

### Scenario 4: Recurring Series Management

**Goal:** Manage complex recurring event

1. Create weekly recurring: "Team Sync" every Mon/Wed/Fri, 2 PM - 3 PM
2. Set to end after 10 occurrences
3. Verify appears in month view on correct days
4. Edit one instance (change time to 3 PM)
5. Choose scope: "This event only"
6. Verify only that instance shows 3 PM
7. Delete future instances
8. Choose scope: "This and future events"
9. Verify series truncates at selected date

**Expected:** Full recurring event lifecycle works

---

## Appendix B: Troubleshooting

### Events Not Syncing

**Symptoms:** Events stuck on "○ Local" or "↻ Syncing"

**Checks:**
1. Verify online (status shows "● Online")
2. Check account connection (shows "Connected to Google Calendar")
3. Check failed operations (header shows "X failed")
4. Open DevTools Console for error messages
5. Inspect IndexedDB outbox store for status

**Solutions:**
- Reconnect Google account
- Click "Retry all" for failed operations
- Check browser console for API errors
- Verify Google Calendar permissions granted

---

### Alerts Not Appearing

**Symptoms:** No banner when event starts

**Checks:**
1. Verify alert is set on event (🔔 icon shows)
2. Verify browser tab is open (alerts require app running)
3. Check event is not cancelled
4. Check event is not in the past
5. Verify alert time is in future

**Solutions:**
- Set alert again
- Keep browser tab open
- Check system time is correct
- Clear browser cache and reload

---

### Permission Denied Errors

**Symptoms:** "You do not have permission to edit this event"

**Checks:**
1. Verify calendar is writable (`canWrite: true`)
2. Check you're the organizer or have edit permissions
3. Review calendar permissions in Google Calendar
4. Check event is not from read-only calendar

**Solutions:**
- Request write access from calendar owner
- Use different calendar for new events
- RSVP instead of editing (if attendee)

---

## Appendix C: Developer Notes

### Local Development

**Start App:**
```bash
pnpm dev
# Opens http://localhost:5173
```

**Run Tests:**
```bash
pnpm typecheck  # TypeScript validation
pnpm lint       # ESLint
pnpm build      # Production build
```

---

### Browser DevTools Tips

**View Outbox:**
```
DevTools > Application > IndexedDB > lifeos-outbox > outbox
```

**Simulate Offline:**
```
DevTools > Network > Throttling > Offline
```

**View Firestore:**
```
Firebase Console > Firestore Database
Collections: calendarEvents, calendars, syncStatus
```

---

### Important Files Reference

| Feature | File Location |
|---------|--------------|
| Calendar Page | [apps/web-vite/src/pages/CalendarPage.tsx](apps/web-vite/src/pages/CalendarPage.tsx) |
| Today Page | [apps/web-vite/src/pages/TodayPage.tsx](apps/web-vite/src/pages/TodayPage.tsx) |
| Event Form | [apps/web-vite/src/components/EventFormModal.tsx](apps/web-vite/src/components/EventFormModal.tsx) |
| RSVP Buttons | [apps/web-vite/src/components/RSVPButtons.tsx](apps/web-vite/src/components/RSVPButtons.tsx) |
| Alert Selector | [apps/web-vite/src/components/AlertSelector.tsx](apps/web-vite/src/components/AlertSelector.tsx) |
| Alert Scheduler | [apps/web-vite/src/alerts/alertScheduler.ts](apps/web-vite/src/alerts/alertScheduler.ts) |
| Outbox Worker | [apps/web-vite/src/outbox/worker.ts](apps/web-vite/src/outbox/worker.ts) |
| Firestore Repo | [apps/web-vite/src/adapters/firestoreCalendarEventRepository.ts](apps/web-vite/src/adapters/firestoreCalendarEventRepository.ts) |
| Design System CSS | [apps/web-vite/src/globals.css](apps/web-vite/src/globals.css) |

---

## Document Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | Dec 20, 2024 | Added Settings - Quote Management section (Section 11) |
| 1.0.0 | Dec 20, 2024 | Initial comprehensive testing guide |

---

**End of Testing Guide**

For questions or issues, please refer to:
- [Design System Documentation](DESIGN_SYSTEM.md)
- [Implementation Guide](IMPLEMENTATION_GUIDE.md)
- [Design Changelog](DESIGN_CHANGELOG.md)
