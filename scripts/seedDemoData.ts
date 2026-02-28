/**
 * Demo Account Seed Script
 *
 * Populates a Firestore user account with realistic demo data for a
 * CPO & Strategy Consultant persona ("Alex Chen").
 *
 * Uses the Firestore REST API with the Firebase CLI's stored OAuth token,
 * so no service account key is needed.
 *
 * Usage:
 *   npx tsx scripts/seedDemoData.ts <USER_ID>
 *
 * Prerequisites:
 *   - Firebase CLI logged in (npx firebase login)
 *   - Active project set to lifeos-pi
 */

import { readFileSync } from 'fs'
import { homedir } from 'os'
import https from 'https'

// ============================================================================
// Auth — get access token from Firebase CLI's stored refresh token
// ============================================================================

const FIREBASE_CLI_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const FIREBASE_CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'
const PROJECT_ID = 'lifeos-pi'

async function getAccessToken(): Promise<string> {
  const configPath = `${homedir()}/.config/configstore/firebase-tools.json`
  const config = JSON.parse(readFileSync(configPath, 'utf-8'))
  const refreshToken = config.tokens?.refresh_token
  if (!refreshToken) {
    throw new Error('No refresh token found. Run: npx firebase login')
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: FIREBASE_CLI_CLIENT_ID,
    client_secret: FIREBASE_CLI_CLIENT_SECRET,
  }).toString()

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
      (res) => {
        let data = ''
        res.on('data', (d) => (data += d))
        res.on('end', () => {
          const result = JSON.parse(data)
          if (result.access_token) resolve(result.access_token)
          else reject(new Error(`Token refresh failed: ${JSON.stringify(result)}`))
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ============================================================================
// Firestore REST API helpers
// ============================================================================

let accessToken: string

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { mapValue: { fields: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } }

function toFirestoreValue(val: unknown): FirestoreValue {
  if (val === null || val === undefined) return { nullValue: null }
  if (typeof val === 'string') return { stringValue: val }
  if (typeof val === 'boolean') return { booleanValue: val }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) return { integerValue: String(val) }
    return { doubleValue: val }
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } }
  }
  if (typeof val === 'object') {
    const fields: Record<string, FirestoreValue> = {}
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v)
    }
    return { mapValue: { fields } }
  }
  return { stringValue: String(val) }
}

function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) fields[k] = toFirestoreValue(v)
  }
  return fields
}

const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

async function firestoreRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}/${path}`)
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = ''
        res.on('data', (d) => (data += d))
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(
              new Error(`Firestore ${method} ${path}: ${res.statusCode} ${data.substring(0, 300)}`)
            )
          } else {
            resolve(data ? JSON.parse(data) : null)
          }
        })
      }
    )
    req.on('error', reject)
    if (body) req.write(JSON.stringify(body))
    req.end()
  })
}

async function setDoc(docPath: string, data: Record<string, unknown>): Promise<void> {
  await firestoreRequest('PATCH', `${docPath}`, {
    fields: toFirestoreFields(data),
  })
}

async function deleteDoc(docPath: string): Promise<void> {
  await firestoreRequest('DELETE', docPath)
}

async function listDocs(collectionPath: string): Promise<{ name: string }[]> {
  const result = (await firestoreRequest('GET', collectionPath + '?pageSize=300')) as {
    documents?: { name: string }[]
  }
  return result.documents || []
}

// ============================================================================
// Helpers
// ============================================================================

const userId = process.argv[2]
if (!userId) {
  console.error('Usage: npx tsx scripts/seedDemoData.ts <USER_ID>')
  process.exit(1)
}

const now = Date.now()
const today = new Date()
const todayKey = today.toISOString().split('T')[0]

function todayAt(hours: number, minutes: number): number {
  const d = new Date(today)
  d.setHours(hours, minutes, 0, 0)
  return d.getTime()
}

function daysAgo(n: number): string {
  const d = new Date(today)
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/** Extract just the document ID from a full Firestore resource name */
function docIdFromName(name: string): string {
  return name.split('/').pop()!
}

// ============================================================================
// Clear existing demo data
// ============================================================================

async function clearCollection(collectionPath: string): Promise<number> {
  const docs = await listDocs(collectionPath)
  for (const doc of docs) {
    const shortPath = doc.name.split('/documents/')[1]
    await deleteDoc(shortPath)
  }
  return docs.length
}

async function clearDemoData(): Promise<void> {
  console.log('Clearing existing data...')

  const collections = [
    `users/${userId}/calendarEvents`,
    `users/${userId}/projects`,
    `users/${userId}/tasks`,
    `users/${userId}/habits`,
    `users/${userId}/habitCheckins`,
    `users/${userId}/mailboxMessages`,
    `users/${userId}/mailboxSyncs`,
    `users/${userId}/workoutPlans`,
    `users/${userId}/workoutSessions`,
  ]

  for (const col of collections) {
    const count = await clearCollection(col)
    if (count > 0) console.log(`  Deleted ${count} docs from ${col}`)
  }

  // Root-level check-ins: try known doc IDs for today
  for (const tod of ['morning', 'afternoon', 'evening']) {
    try {
      await deleteDoc(`checkIns/${userId}_${todayKey}_${tod}`)
    } catch {
      // Doc may not exist, ignore
    }
  }

  // Root-level quotes doc
  try {
    await deleteDoc(`quotes/${userId}`)
    console.log('  Deleted quotes doc')
  } catch {
    // May not exist
  }

  console.log('  Done clearing.\n')
}

// ============================================================================
// Seed Calendar Events
// ============================================================================

async function seedCalendarEvents(): Promise<void> {
  console.log('Seeding calendar events...')

  const calendarId = 'demo-primary'

  const events = [
    { title: 'Morning Run', startMs: todayAt(6, 30), endMs: todayAt(7, 15), attendees: [] },
    {
      title: 'Leadership Team Standup',
      startMs: todayAt(8, 30),
      endMs: todayAt(9, 0),
      attendees: [
        { email: 'david.park@acme.co', displayName: 'David Park', responseStatus: 'accepted' },
        { email: 'lisa.wong@acme.co', displayName: 'Lisa Wong', responseStatus: 'accepted' },
        { email: 'mike.santos@acme.co', displayName: 'Mike Santos', responseStatus: 'accepted' },
        { email: 'priya.sharma@acme.co', displayName: 'Priya Sharma', responseStatus: 'accepted' },
        { email: 'james.chen@acme.co', displayName: 'James Chen', responseStatus: 'accepted' },
        { email: 'anna.kozlov@acme.co', displayName: 'Anna Kozlov', responseStatus: 'tentative' },
      ],
    },
    {
      title: 'Product Roadmap Review',
      startMs: todayAt(9, 30),
      endMs: todayAt(10, 30),
      attendees: [
        { email: 'lisa.wong@acme.co', displayName: 'Lisa Wong', responseStatus: 'accepted' },
        { email: 'raj.patel@acme.co', displayName: 'Raj Patel', responseStatus: 'accepted' },
        { email: 'emma.taylor@acme.co', displayName: 'Emma Taylor', responseStatus: 'accepted' },
        { email: 'ben.kowalski@acme.co', displayName: 'Ben Kowalski', responseStatus: 'tentative' },
      ],
    },
    {
      title: '1:1 with VP Engineering',
      startMs: todayAt(11, 0),
      endMs: todayAt(11, 30),
      attendees: [
        { email: 'mike.santos@acme.co', displayName: 'Mike Santos', responseStatus: 'accepted' },
      ],
    },
    {
      title: 'Lunch with Sequoia Partner',
      startMs: todayAt(12, 0),
      endMs: todayAt(13, 0),
      attendees: [
        { email: 'nina.rao@sequoiacap.com', displayName: 'Nina Rao', responseStatus: 'accepted' },
      ],
    },
    {
      title: 'Client Workshop: AI Strategy',
      startMs: todayAt(13, 30),
      endMs: todayAt(15, 0),
      attendees: [
        { email: 'sarah.kim@techcorp.io', displayName: 'Sarah Kim', responseStatus: 'accepted' },
        { email: 'john.lee@techcorp.io', displayName: 'John Lee', responseStatus: 'accepted' },
        {
          email: 'maria.garcia@techcorp.io',
          displayName: 'Maria Garcia',
          responseStatus: 'accepted',
        },
        { email: 'tom.wright@techcorp.io', displayName: 'Tom Wright', responseStatus: 'accepted' },
        { email: 'amy.zhao@techcorp.io', displayName: 'Amy Zhao', responseStatus: 'accepted' },
        {
          email: 'carlos.mendez@techcorp.io',
          displayName: 'Carlos Mendez',
          responseStatus: 'tentative',
        },
        { email: 'helen.park@techcorp.io', displayName: 'Helen Park', responseStatus: 'accepted' },
        { email: 'wei.liu@techcorp.io', displayName: 'Wei Liu', responseStatus: 'accepted' },
      ],
    },
    {
      title: 'Board Deck Prep',
      startMs: todayAt(15, 30),
      endMs: todayAt(16, 30),
      attendees: [
        { email: 'david.park@acme.co', displayName: 'David Park', responseStatus: 'accepted' },
        { email: 'cfoteam@acme.co', displayName: 'CFO Office', responseStatus: 'accepted' },
      ],
    },
    {
      title: 'Advisor Call \u2014 Stealth Startup',
      startMs: todayAt(17, 0),
      endMs: todayAt(17, 30),
      attendees: [
        { email: 'founder@nexusai.dev', displayName: 'Arjun Mehta', responseStatus: 'accepted' },
        { email: 'cto@nexusai.dev', displayName: 'Rachel Nguyen', responseStatus: 'accepted' },
      ],
    },
    { title: 'Yoga Class', startMs: todayAt(17, 45), endMs: todayAt(18, 45), attendees: [] },
    { title: 'Date Night', startMs: todayAt(19, 30), endMs: todayAt(21, 0), attendees: [] },
  ]

  for (const evt of events) {
    const id = randomId('evt')
    await setDoc(`users/${userId}/calendarEvents/${id}`, {
      canonicalEventId: id,
      schemaVersion: 1,
      normalizationVersion: 1,
      providerRef: { providerId: 'demo', providerEventId: id },
      primaryProvider: 'local',
      source: { type: 'local', description: 'Demo seed' },
      syncState: 'synced',
      rev: 1,
      title: evt.title,
      startMs: evt.startMs,
      endMs: evt.endMs,
      startIso: new Date(evt.startMs).toISOString(),
      endIso: new Date(evt.endMs).toISOString(),
      occursOn: [todayKey],
      calendarId,
      attendees: evt.attendees,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAtMs: now,
      updatedAtMs: now,
      canonicalUpdatedAtMs: now,
    })
  }
  console.log(`  Created ${events.length} calendar events.`)
}

// ============================================================================
// Seed Projects & Tasks
// ============================================================================

async function seedProjectsAndTasks(): Promise<void> {
  console.log('Seeding projects and tasks...')

  const isoNow = new Date().toISOString()
  const calendarId = 'demo-primary'

  const projects = [
    {
      id: randomId('proj'),
      title: 'Q2 Product Strategy',
      domain: 'work',
      description: 'Define and execute the Q2 product roadmap across all product lines.',
      color: '#4F46E5',
    },
    {
      id: randomId('proj'),
      title: 'TechCorp AI Consulting',
      domain: 'work',
      description: 'Strategic AI adoption advisory engagement for TechCorp.',
      color: '#059669',
    },
    {
      id: randomId('proj'),
      title: 'Series B Advisory \u2014 Nexus AI',
      domain: 'work',
      description: 'Advisory role for Nexus AI Series B fundraise and product strategy.',
      color: '#D97706',
    },
  ]

  for (const proj of projects) {
    await setDoc(`users/${userId}/projects/${proj.id}`, {
      ...proj,
      userId,
      archived: false,
      createdAt: isoNow,
      updatedAt: isoNow,
    })
  }

  // Tasks with time estimates and calendar time blocks
  // Free slots today (between existing meetings):
  //   07:15-08:30, 09:00-09:30, 10:30-11:00, 11:30-12:00, 15:00-15:30, 16:30-17:00
  const tasks = [
    {
      title: 'Finalize Q2 roadmap presentation for board',
      domain: 'work',
      importance: 10,
      urgency: 'today',
      projectId: projects[0].id,
      status: 'scheduled',
      allocatedTimeMinutes: 75,
      blockStart: [7, 15],
      blockEnd: [8, 30],
    },
    {
      title: 'Review TechCorp AI strategy proposal',
      domain: 'work',
      importance: 7,
      urgency: 'today',
      projectId: projects[1].id,
      status: 'scheduled',
      allocatedTimeMinutes: 30,
      blockStart: [15, 0],
      blockEnd: [15, 30],
    },
    {
      title: 'Send board meeting agenda to directors',
      domain: 'work',
      importance: 7,
      urgency: 'today',
      projectId: projects[0].id,
      status: 'scheduled',
      allocatedTimeMinutes: 30,
      blockStart: [9, 0],
      blockEnd: [9, 30],
    },
    {
      title: 'Prep talking points for Sequoia lunch',
      domain: 'work',
      importance: 4,
      urgency: 'today',
      status: 'scheduled',
      allocatedTimeMinutes: 30,
      blockStart: [10, 30],
      blockEnd: [11, 0],
    },
    {
      title: 'Draft consulting scope for new fintech client',
      domain: 'work',
      importance: 7,
      urgency: 'next_3_days',
      status: 'scheduled',
      allocatedTimeMinutes: 60,
      blockStartDay: 1,
      blockStart: [9, 0],
      blockEnd: [10, 0],
    },
    {
      title: 'Book flights for family spring break',
      domain: 'life',
      importance: 4,
      urgency: 'this_week',
      status: 'scheduled',
      allocatedTimeMinutes: 30,
      blockStartDay: 2,
      blockStart: [18, 0],
      blockEnd: [18, 30],
    },
    {
      title: 'Review engineering hiring pipeline',
      domain: 'work',
      importance: 4,
      urgency: 'this_week',
      projectId: projects[0].id,
      status: 'scheduled',
      allocatedTimeMinutes: 45,
      blockStartDay: 2,
      blockStart: [10, 0],
      blockEnd: [10, 45],
    },
    {
      title: "Call dentist for kids' checkup",
      domain: 'life',
      importance: 2,
      urgency: 'this_month',
      status: 'scheduled',
      allocatedTimeMinutes: 15,
      blockStartDay: 5,
      blockStart: [12, 0],
      blockEnd: [12, 15],
    },
  ]

  // Completed tasks — done yesterday
  const yesterdayMs = now - 86400000
  function yesterdayAt(hours: number, minutes: number): number {
    const d = new Date(today)
    d.setDate(d.getDate() - 1)
    d.setHours(hours, minutes, 0, 0)
    return d.getTime()
  }
  const completedTasks = [
    {
      title: 'Review overnight analytics dashboard',
      domain: 'work',
      importance: 4,
      urgency: 'today',
      status: 'done',
      allocatedTimeMinutes: 30,
      blockStartDay: -1,
      blockStart: [9, 0],
      blockEnd: [9, 30],
      completedAtMs: yesterdayAt(9, 25),
    },
    {
      title: 'Approve v2.4 release candidate',
      domain: 'work',
      importance: 7,
      urgency: 'today',
      projectId: projects[0].id,
      status: 'done',
      allocatedTimeMinutes: 30,
      blockStartDay: -1,
      blockStart: [14, 0],
      blockEnd: [14, 30],
      completedAtMs: yesterdayAt(14, 22),
    },
    {
      title: 'Order birthday gift for Mom',
      domain: 'life',
      importance: 4,
      urgency: 'today',
      status: 'done',
      allocatedTimeMinutes: 15,
      blockStartDay: -1,
      blockStart: [18, 0],
      blockEnd: [18, 15],
      completedAtMs: yesterdayAt(18, 10),
    },
  ]

  let taskBlockCount = 0

  // Helper to create a task + its calendar time block
  async function createTaskWithBlock(
    task: {
      title: string
      domain: string
      importance: number
      urgency: string
      status: string
      allocatedTimeMinutes: number
      blockStart: number[]
      blockEnd: number[]
      projectId?: string
      blockStartDay?: number
    },
    completed: boolean,
    completedAtMs?: number
  ) {
    const taskId = randomId('task')
    const eventId = randomId('tb')

    const blockDay = new Date(today)
    if (task.blockStartDay) {
      blockDay.setDate(blockDay.getDate() + task.blockStartDay)
    }
    const blockDateKey = blockDay.toISOString().split('T')[0]

    const startD = new Date(blockDay)
    startD.setHours(task.blockStart[0], task.blockStart[1], 0, 0)
    const endD = new Date(blockDay)
    endD.setHours(task.blockEnd[0], task.blockEnd[1], 0, 0)

    await setDoc(`users/${userId}/calendarEvents/${eventId}`, {
      canonicalEventId: eventId,
      schemaVersion: 1,
      normalizationVersion: 1,
      providerRef: { providerId: 'demo', providerEventId: eventId },
      primaryProvider: 'local',
      source: { type: 'local', description: 'Task time block' },
      syncState: 'synced',
      rev: 1,
      title: task.title,
      startMs: startD.getTime(),
      endMs: endD.getTime(),
      startIso: startD.toISOString(),
      endIso: endD.toISOString(),
      occursOn: [blockDateKey],
      calendarId,
      attendees: [],
      createdAt: isoNow,
      updatedAt: isoNow,
      createdAtMs: now,
      updatedAtMs: now,
      canonicalUpdatedAtMs: now,
    })
    taskBlockCount++

    await setDoc(`users/${userId}/tasks/${taskId}`, {
      id: taskId,
      userId,
      title: task.title,
      domain: task.domain,
      importance: task.importance,
      urgency: task.urgency,
      status: task.status,
      projectId: task.projectId ?? null,
      allocatedTimeMinutes: task.allocatedTimeMinutes,
      calendarEventIds: [eventId],
      completed,
      ...(completedAtMs ? { completedAt: new Date(completedAtMs).toISOString() } : {}),
      archived: false,
      createdAt: isoNow,
      updatedAt: isoNow,
    })
  }

  for (const task of tasks) {
    await createTaskWithBlock(
      task as (typeof tasks)[0] & { projectId?: string; blockStartDay?: number },
      false
    )
  }
  for (const task of completedTasks) {
    await createTaskWithBlock(
      task as (typeof completedTasks)[0] & { projectId?: string },
      true,
      task.completedAtMs
    )
  }

  const totalTasks = tasks.length + completedTasks.length
  console.log(
    `  Created ${projects.length} projects, ${totalTasks} tasks (${completedTasks.length} completed), and ${taskBlockCount} time blocks.`
  )
}

// ============================================================================
// Seed Habits + Check-ins
// ============================================================================

async function seedHabitsAndCheckins(): Promise<void> {
  console.log('Seeding habits and check-ins...')

  const habits = [
    {
      habitId: randomId('habit'),
      title: 'Morning Meditation',
      domain: 'meditation',
      anchor: { type: 'after_event', eventDescription: 'After waking up' },
      recipe: { tiny: '2 min breathing', standard: '15 min guided meditation' },
      schedule: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timezone: 'America/Los_Angeles' },
      streak: 12,
    },
    {
      habitId: randomId('habit'),
      title: 'Breathwork Practice',
      domain: 'custom',
      customDomain: 'Mindfulness',
      anchor: { type: 'time_window', startTimeHHMM: '12:00', endTimeHHMM: '13:00' },
      recipe: { tiny: '3 deep breaths', standard: '10 min box breathing' },
      schedule: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timezone: 'America/Los_Angeles' },
      streak: 8,
    },
    {
      habitId: randomId('habit'),
      title: 'Exercise',
      domain: 'exercise',
      anchor: { type: 'time_window', startTimeHHMM: '06:00', endTimeHHMM: '07:30' },
      recipe: { tiny: '10 pushups', standard: '45 min workout' },
      schedule: { daysOfWeek: [1, 2, 3, 4, 5, 6], timezone: 'America/Los_Angeles' },
      streak: 20,
    },
    {
      habitId: randomId('habit'),
      title: 'Gratitude Journal',
      domain: 'creativity',
      anchor: { type: 'time_window', startTimeHHMM: '21:00', endTimeHHMM: '22:00' },
      recipe: { tiny: 'Write 1 thing', standard: "3 things I'm grateful for + reflection" },
      schedule: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timezone: 'America/Los_Angeles' },
      streak: 15,
    },
    {
      habitId: randomId('habit'),
      title: 'Evening Body Scan',
      domain: 'meditation',
      anchor: { type: 'time_window', startTimeHHMM: '22:00', endTimeHHMM: '22:30' },
      recipe: { tiny: '1 min check-in', standard: '10 min body scan meditation' },
      schedule: { daysOfWeek: [0, 1, 2, 3, 4, 5, 6], timezone: 'America/Los_Angeles' },
      streak: 6,
    },
  ]

  for (const h of habits) {
    await setDoc(`users/${userId}/habits/${h.habitId}`, {
      habitId: h.habitId,
      userId,
      title: h.title,
      domain: h.domain,
      ...(h.customDomain ? { customDomain: h.customDomain } : {}),
      status: 'active',
      anchor: h.anchor,
      recipe: h.recipe,
      schedule: h.schedule,
      safetyNet: { tinyCountsAsSuccess: true, allowRecovery: true },
      createdAtMs: now - 30 * 86400000,
      updatedAtMs: now,
      syncState: 'synced',
      version: 1,
    })
  }

  let checkinCount = 0

  // Today's check-ins: Meditation=done, Exercise=done
  for (const tc of [
    { habitId: habits[0].habitId, status: 'done' },
    { habitId: habits[2].habitId, status: 'done' },
  ]) {
    const id = randomId('checkin')
    await setDoc(`users/${userId}/habitCheckins/${id}`, {
      checkinId: id,
      userId,
      habitId: tc.habitId,
      dateKey: todayKey,
      status: tc.status,
      checkedInAtMs: now - 3600000,
      sourceType: 'manual',
      syncState: 'synced',
      version: 1,
    })
    checkinCount++
  }

  // Historical check-ins (14 days)
  for (let d = 1; d <= 14; d++) {
    const dateKey = daysAgo(d)
    const dayOfWeek = new Date(dateKey).getDay()

    for (const habit of habits) {
      if (habit.domain === 'exercise' && dayOfWeek === 0) continue

      let status: string
      const rand = Math.random()
      if (d <= habit.streak) {
        status = rand < 0.85 ? 'done' : 'tiny'
      } else {
        status = rand < 0.4 ? 'done' : rand < 0.6 ? 'tiny' : 'skip'
      }

      const id = randomId('checkin')
      await setDoc(`users/${userId}/habitCheckins/${id}`, {
        checkinId: id,
        userId,
        habitId: habit.habitId,
        dateKey,
        status,
        checkedInAtMs: new Date(dateKey).getTime() + 8 * 3600000,
        sourceType: 'manual',
        syncState: 'synced',
        version: 1,
      })
      checkinCount++
    }
  }

  console.log(`  Created ${habits.length} habits and ${checkinCount} check-ins.`)
}

// ============================================================================
// Seed Mailbox Messages
// ============================================================================

async function seedMailboxMessages(): Promise<void> {
  console.log('Seeding mailbox messages...')

  const messages = [
    {
      source: 'gmail',
      sender: 'Margaret Liu',
      senderEmail: 'margaret.liu@acme-board.com',
      subject: 'Q1 Numbers & Board Prep',
      snippet:
        'Alex, I need the final board deck and financial summary by Thursday. Several investors have follow-up questions from last quarter...',
      priority: 'high',
      aiSummary:
        'Board chair requesting final board deck and financial summary by Thursday. Mentions new investor questions about growth metrics.',
      requiresFollowUp: true,
      followUpReason: 'Board deck deadline Thursday',
      receivedAtMs: now - 2 * 3600000,
    },
    {
      source: 'slack',
      sender: 'David Park',
      snippet:
        'Hey Alex, need your competitive assessment of the acquisition target before Friday exec meeting. Can you pull together a one-pager?',
      priority: 'high',
      aiSummary:
        "CEO needs your competitive assessment of the acquisition target before Friday's exec meeting.",
      requiresFollowUp: true,
      followUpReason: 'CEO request — exec meeting Friday',
      receivedAtMs: now - 3 * 3600000,
    },
    {
      source: 'gmail',
      sender: 'Sarah Kim',
      senderEmail: 'sarah.kim@techcorp.io',
      subject: 'Workshop Follow-up & Revised Scope',
      snippet:
        "Great session yesterday. Based on the new findings, we'd like to expand the scope to include MLOps. Could you revise the proposal?",
      priority: 'high',
      aiSummary:
        "Client requesting revised consulting proposal to include MLOps based on yesterday's workshop findings.",
      requiresFollowUp: true,
      followUpReason: 'Client proposal revision needed',
      receivedAtMs: now - 5 * 3600000,
    },
    {
      source: 'slack',
      sender: '#product-team',
      snippet:
        "Pricing model feedback needed — we're blocked on the enterprise tier changes. Sprint planning is Thursday and we need your sign-off.",
      priority: 'medium',
      aiSummary:
        'Team waiting on your input for the enterprise tier pricing changes before sprint planning.',
      requiresFollowUp: true,
      followUpReason: 'Sprint planning blocked',
      receivedAtMs: now - 4 * 3600000,
    },
    {
      source: 'gmail',
      sender: 'Web Summit',
      senderEmail: 'speakers@websummit.com',
      subject: 'Speaker Slot Confirmed: The Future of AI Products',
      snippet:
        'Congratulations! Your session "The Future of AI Products" has been confirmed. Please submit your bio and session abstract by March 1.',
      priority: 'medium',
      aiSummary:
        'Speaking slot confirmed for Web Summit 2026. Need bio and session abstract by March 1.',
      requiresFollowUp: true,
      followUpReason: 'Abstract due March 1',
      receivedAtMs: now - 6 * 3600000,
    },
    {
      source: 'slack',
      sender: '#engineering',
      snippet:
        'v2.4 deploy blockers: 2 P1 bugs. Auth token refresh fails on mobile, and search index is stale. Need product priority call.',
      priority: 'medium',
      aiSummary:
        'Two P1 bugs need product sign-off before release can proceed. QA requests your priority call.',
      requiresFollowUp: true,
      followUpReason: 'Release blocked on product decision',
      receivedAtMs: now - 7 * 3600000,
    },
    {
      source: 'gmail',
      sender: 'United Airlines',
      senderEmail: 'reservations@united.com',
      subject: 'Flight Confirmation: SFO \u2192 NYC Mar 15',
      snippet:
        'Your flight booking is confirmed. UA 234, Seat 3A, departing SFO 7:00 AM, arriving JFK 3:45 PM.',
      priority: 'medium',
      aiSummary: 'Flight booking confirmed for NYC board meeting trip. Seat 3A, departing 7:00 AM.',
      requiresFollowUp: false,
      receivedAtMs: now - 8 * 3600000,
    },
    {
      source: 'slack',
      sender: '#random',
      snippet:
        'Team offsite poll \u2014 vote by Friday! Options: Lake Tahoe, Napa Valley, or Big Sur. Reply with your pick.',
      priority: 'low',
      aiSummary: 'Team planning May offsite. Three location options to vote on.',
      requiresFollowUp: true,
      followUpReason: 'Vote by Friday',
      receivedAtMs: now - 10 * 3600000,
    },
    {
      source: 'gmail',
      sender: 'First Round Review',
      senderEmail: 'newsletter@firstround.com',
      subject: 'The Art of Product Strategy',
      snippet:
        'This week: How multi-product companies win. Plus, an interview with the CPO of Figma on building platform thinking...',
      priority: 'low',
      aiSummary: 'Newsletter featuring article on multi-product strategy at scale.',
      requiresFollowUp: false,
      receivedAtMs: now - 12 * 3600000,
    },
    {
      source: 'gmail',
      sender: 'Amazon',
      senderEmail: 'shipment-tracking@amazon.com',
      subject: 'Your order has shipped',
      snippet:
        'Your standing desk anti-fatigue mat is on the way. Estimated delivery: tomorrow by 8 PM.',
      priority: 'low',
      aiSummary: 'Standing desk mat delivery arriving tomorrow.',
      requiresFollowUp: false,
      receivedAtMs: now - 14 * 3600000,
    },
  ]

  for (const msg of messages) {
    const id = randomId('msg')
    await setDoc(`users/${userId}/mailboxMessages/${id}`, {
      messageId: id,
      userId,
      source: msg.source,
      accountId: msg.source === 'gmail' ? 'demo-gmail' : 'demo-slack',
      originalMessageId: randomId('orig'),
      sender: msg.sender,
      ...((msg as { senderEmail?: string }).senderEmail
        ? { senderEmail: (msg as { senderEmail?: string }).senderEmail }
        : {}),
      ...((msg as { subject?: string }).subject
        ? { subject: (msg as { subject?: string }).subject }
        : {}),
      snippet: msg.snippet,
      receivedAtMs: msg.receivedAtMs,
      priority: msg.priority,
      aiSummary: msg.aiSummary,
      requiresFollowUp: msg.requiresFollowUp,
      ...((msg as { followUpReason?: string }).followUpReason
        ? { followUpReason: (msg as { followUpReason?: string }).followUpReason }
        : {}),
      isRead: false,
      isDismissed: false,
      createdAtMs: msg.receivedAtMs,
      updatedAtMs: msg.receivedAtMs,
    })
  }

  // Seed a completed sync record
  const syncId = randomId('sync')
  await setDoc(`users/${userId}/mailboxSyncs/${syncId}`, {
    syncId,
    userId,
    triggerType: 'manual',
    startedAtMs: now - 600000,
    completedAtMs: now - 590000,
    status: 'completed',
    stats: { slackMessagesProcessed: 47, gmailMessagesProcessed: 83, highPriorityCount: 3 },
  })

  console.log(`  Created ${messages.length} mailbox messages + 1 sync record.`)
}

// ============================================================================
// Seed Mind Check-in
// ============================================================================

async function seedCheckIn(): Promise<void> {
  console.log('Seeding morning check-in...')
  const docId = `${userId}_${todayKey}_morning`
  await setDoc(`checkIns/${docId}`, {
    checkInId: randomId('checkin'),
    userId,
    dateKey: todayKey,
    timeOfDay: 'morning',
    energyLevel: 'high',
    emotionId: 'confident',
    coreEmotionId: 'happy',
    createdAtMs: todayAt(7, 30),
    notes: 'Big day ahead. Feeling sharp and ready for the board prep.',
  })
  console.log('  Created morning check-in.')
}

// ============================================================================
// Seed Quotes
// ============================================================================

async function seedQuotes(): Promise<void> {
  console.log('Seeding quotes...')
  const isoNow = new Date().toISOString()
  const quotes = [
    { text: 'The best way to predict the future is to create it.', author: 'Peter Drucker' },
    {
      text: "Strategy is about making choices, trade-offs; it's about deliberately choosing to be different.",
      author: 'Michael Porter',
    },
    { text: 'The measure of intelligence is the ability to change.', author: 'Albert Einstein' },
    { text: 'What gets measured gets managed.', author: 'Peter Drucker' },
    {
      text: 'Move fast and break things. Unless you are breaking stuff, you are not moving fast enough.',
      author: 'Mark Zuckerberg',
    },
    {
      text: "The most dangerous phrase in the language is 'we've always done it this way.'",
      author: 'Grace Hopper',
    },
    { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
    { text: 'First, solve the problem. Then, write the code.', author: 'John Johnson' },
  ]

  const quoteObjects = quotes.map((q, i) => ({
    id: `quote-${now}-${Math.random().toString(36).substring(2, 11)}`,
    text: q.text,
    author: q.author,
    createdAt: isoNow,
    updatedAt: isoNow,
    addedAt: `11:02:26 09:${String(i).padStart(2, '0')}`,
    order: i,
  }))

  await setDoc(`quotes/${userId}`, { userId, quotes: quoteObjects, updatedAt: isoNow })
  console.log(`  Created ${quotes.length} quotes.`)
}

// ============================================================================
// Seed Workout Plan + Today's Session
// ============================================================================

const WEEKLY_SCHEDULE = [
  // Sunday — Rest
  { dayOfWeek: 0, restDay: true, blocks: [] },
  // Monday — Upper Body Strength (gym)
  {
    dayOfWeek: 1,
    blocks: [
      { category: 'upper_body', timeMinutes: 45 },
      { category: 'core', timeMinutes: 10 },
    ],
  },
  // Tuesday — Running + Core (road)
  {
    dayOfWeek: 2,
    blocks: [
      { category: 'cardio', timeMinutes: 35 },
      { category: 'core', timeMinutes: 15 },
    ],
  },
  // Wednesday — Lower Body Strength (gym)
  {
    dayOfWeek: 3,
    blocks: [
      { category: 'lower_body', timeMinutes: 45 },
      { category: 'mobility_stability', timeMinutes: 10 },
    ],
  },
  // Thursday — Yoga + Mobility (home)
  {
    dayOfWeek: 4,
    blocks: [
      { category: 'yoga', timeMinutes: 40 },
      { category: 'mobility_stability', timeMinutes: 15 },
    ],
  },
  // Friday — Upper Body Hypertrophy (gym)
  {
    dayOfWeek: 5,
    blocks: [
      { category: 'upper_body', timeMinutes: 50 },
      { category: 'arms', timeMinutes: 10 },
    ],
  },
  // Saturday — Long Run (road)
  {
    dayOfWeek: 6,
    blocks: [{ category: 'cardio', timeMinutes: 60 }],
  },
]

const DAY_CONTEXT: Record<number, string> = {
  0: 'home',
  1: 'gym',
  2: 'road',
  3: 'gym',
  4: 'home',
  5: 'gym',
  6: 'road',
}
const DAY_TITLE: Record<number, string> = {
  0: 'Rest Day',
  1: 'Upper Body Strength',
  2: 'Running + Core',
  3: 'Lower Body Strength',
  4: 'Yoga + Mobility',
  5: 'Upper Body Hypertrophy',
  6: 'Long Run',
}

async function seedWorkoutPlan(): Promise<void> {
  console.log('Seeding workout plan...')

  const planId = randomId('plan')
  await setDoc(`users/${userId}/workoutPlans/${planId}`, {
    planId,
    userId,
    active: true,
    timezone: 'America/Los_Angeles',
    startDateKey: daysAgo(14),
    schedule: WEEKLY_SCHEDULE,
    createdAtMs: now - 14 * 86400000,
    updatedAtMs: now,
    syncState: 'synced',
    version: 1,
  })
  console.log('  Created active workout plan.')

  // Create today's session (if not a rest day)
  const dayOfWeek = today.getDay()
  if (dayOfWeek !== 0) {
    const sessionId = randomId('session')
    await setDoc(`users/${userId}/workoutSessions/${sessionId}`, {
      sessionId,
      userId,
      dateKey: todayKey,
      context: DAY_CONTEXT[dayOfWeek],
      title: DAY_TITLE[dayOfWeek],
      status: 'planned',
      items: [],
      createdAtMs: now,
      updatedAtMs: now,
      syncState: 'synced',
      version: 1,
    })
    console.log(`  Created today's session: ${DAY_TITLE[dayOfWeek]} (${DAY_CONTEXT[dayOfWeek]}).`)
  } else {
    console.log('  Today is Sunday (rest day) — no session created.')
  }
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  console.log('=== Seed Demo Data ===')
  console.log(`User ID: ${userId}`)
  console.log(`Date: ${todayKey}`)
  console.log('Authenticating via Firebase CLI token...\n')

  accessToken = await getAccessToken()

  await clearDemoData()
  await seedCalendarEvents()
  await seedProjectsAndTasks()
  await seedHabitsAndCheckins()
  await seedMailboxMessages()
  await seedCheckIn()
  await seedQuotes()
  await seedWorkoutPlan()

  console.log('\n=== Seed Complete ===')
  console.log('Run the app and navigate to /today to see the demo data.')
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
