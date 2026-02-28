# LifeOS - Product Requirements Document

> A comprehensive personal operating system combining productivity, knowledge management, and AI-powered workflows into a single platform.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Services](#2-core-services)
   - [Today Page & Mailbox Triage](#21-today-page--mailbox-triage)
   - [Calendar](#22-calendar)
   - [Planner](#23-planner)
3. [Notes & Creativity](#3-notes--creativity)
   - [Notes Editor](#31-notes-editor)
   - [AI Tools for Notes](#32-ai-tools-for-notes)
   - [Knowledge Graph](#33-knowledge-graph)
4. [Agents & AI Integration](#4-agents--ai-integration)
   - [Agent System Core](#41-agent-system-core)
   - [Tools & Provider Services](#42-tools--provider-services)
   - [Basic Workflows (Sequential, Parallel, Expert Council)](#43-basic-workflows)
5. [Advanced Use-Cases](#5-advanced-use-cases)
   - [Supervisor Workflows](#51-supervisor-workflows)
   - [Graph Workflows & Visual Builder](#52-graph-workflows--visual-builder)
   - [Dialectical Workflows](#53-dialectical-workflows)
   - [Complex Workflow Templates (Deep Research, etc.)](#54-complex-workflow-templates)
   - [Project Manager](#55-project-manager)
   - [Evaluation & Telemetry](#56-evaluation--telemetry)
6. [Infrastructure & Shared Services](#6-infrastructure--shared-services)

---

## 1. Architecture Overview

### Tech Stack

| Layer            | Technology                                                    | Purpose                                   |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------- |
| **Frontend**     | React 19, Vite 7, TypeScript 5.9                              | SPA with lazy-loaded routes               |
| **State**        | React hooks + Firestore listeners                             | Real-time reactive data                   |
| **Offline**      | IndexedDB (`idb`), Service Workers                            | Offline-first PWA                         |
| **Backend**      | Firebase Cloud Functions (Node.js 22)                         | Serverless API                            |
| **Database**     | Firestore                                                     | Real-time NoSQL with multi-tab support    |
| **Auth**         | Firebase Auth (Google OAuth, Email/Password)                  | Identity and access control               |
| **AI Providers** | Anthropic (Claude), OpenAI (GPT), Google (Gemini), xAI (Grok) | Multi-provider LLM access                 |
| **Search**       | Serper, Firecrawl, Exa, Jina                                  | Web search and content extraction         |
| **Monorepo**     | pnpm workspaces + Turborepo                                   | Multi-package builds                      |
| **CI/CD**        | GitHub Actions                                                | Lint, typecheck, test gates before deploy |
| **Logging**      | `firebase-functions/logger`                                   | Structured Cloud Logging with namespaces  |

### Monorepo Structure

```
lifeos/
├── apps/
│   └── web-vite/              # React SPA (main application)
│       ├── src/
│       │   ├── adapters/      # Firestore/IndexedDB repository implementations
│       │   ├── agents/        # Agent configs, templates, offline store
│       │   ├── calendar/      # Calendar offline store
│       │   ├── components/    # UI components (organized by domain)
│       │   ├── hooks/         # React hooks (business logic layer)
│       │   ├── lib/           # Firebase client, utilities
│       │   ├── notes/         # Note sync worker, link extractor
│       │   ├── outbox/        # Outbox pattern worker
│       │   ├── pages/         # Route-level page components
│       │   ├── services/      # Template instantiation, etc.
│       │   ├── styles/        # CSS modules by domain
│       │   ├── todos/         # Todo sync worker
│       │   └── training/      # Training offline store
│       └── vite.config.ts
├── functions/                 # Firebase Cloud Functions
│   └── src/
│       ├── agents/            # AI provider services, workflow executors
│       │   ├── langgraph/     # LangGraph integration
│       │   ├── evaluation/    # LLM judge
│       │   ├── telemetry/     # Execution telemetry
│       │   ├── optimization/  # Cost optimization
│       │   └── shared/        # Firestore utilities and validation
│       ├── channels/          # Unified sync (Gmail, Slack, Telegram adapters)
│       ├── google/            # Google Drive/Gmail APIs
│       ├── lib/               # Shared infrastructure (structured logger)
│       └── slack/             # Slack integration
├── packages/                  # Shared domain packages
│   ├── agents/                # Agent domain models, ports, usecases
│   ├── mind/                  # Emotions, check-in models
│   ├── notes/                 # Note + graph domain models
│   ├── training/              # Exercise, plan, session models
│   ├── core/                  # Shared types (branded IDs, logger)
│   ├── calendar/              # Calendar domain models
│   ├── habits/                # Habit domain models
│   └── todos/                 # Task domain models
├── firebase.json
├── firestore.rules
└── firestore.indexes.json
```

### Clean Architecture Pattern

Every domain follows a layered architecture:

```
Domain Layer (packages/*)        →  Pure types, validation (Zod), business rules
  ↓
Port Layer (packages/*/ports/)   →  Repository interfaces (no implementation)
  ↓
Usecase Layer (packages/*/usecases/)  →  Business logic orchestration
  ↓
Adapter Layer (apps/web-vite/src/adapters/)  →  Firestore & IndexedDB implementations
  ↓
Hook Layer (apps/web-vite/src/hooks/)  →  React hooks binding adapters to UI
  ↓
Component Layer (apps/web-vite/src/components/)  →  UI rendering
```

### Offline-First Data Architecture

All write-heavy features use a three-tier data pattern:

```
User Action → Optimistic UI update → Save to IndexedDB → Queue in outbox
                                                             ↓ (when online)
                                                    Push to Firestore
                                                             ↓
                                                    Confirm + update timestamp
                                                             ↓ (if conflict)
                                                    Last-write-wins resolution
```

Background sync workers run on intervals (typically 30s), processing pending operations and pulling remote changes. Features using this pattern: Notes, Tasks/Todos, Calendar, Training.

### Code Splitting Strategy

Vite bundles are split for optimal loading:

| Chunk             | Contents                   |
| ----------------- | -------------------------- |
| `react-vendor`    | React + React DOM          |
| `react-router`    | React Router DOM           |
| `firebase-vendor` | Firebase SDK               |
| `tiptap-vendor`   | TipTap editor (notes only) |
| `ui-vendor`       | Sonner toast library       |
| `calendar`        | Calendar domain logic      |

All pages are lazy-loaded with `React.lazy()` and wrapped in `Suspense` with a custom `lazyWithRetry()` that handles chunk-loading errors during deployments.

---

## 2. Core Services

### 2.1 Today Page & Mailbox Triage

#### Purpose

The Today Page is the daily command center -- a dashboard consolidating the user's most time-sensitive information into a single glance: motivational quote, emotional check-in, priority tasks, calendar events, and AI-prioritized messages.

#### Today Page Components

| Section            | Data Source           | Description                                                                                                                   |
| ------------------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Daily Quote        | `quotes/` module      | Rotating motivational quotes                                                                                                  |
| Emotional Check-In | `@lifeos/mind`        | Feelings wheel (8 core emotions, 100+ detailed) with energy level                                                             |
| Quick Task Input   | Planner integration   | Add tasks with Enter key, auto-assigns `inbox` status                                                                         |
| Top 5 Tasks        | `useTaskStats()`      | Highest-priority tasks computed from urgency + importance                                                                     |
| Today's Calendar   | Calendar integration  | Events for today with time display                                                                                            |
| Mailbox Triage     | `useMessageMailbox()` | Compact unified summary: unread count badge, channel breakdown chips, top 5 AI-ranked messages, "View All" link to `/mailbox` |

#### Mailbox Triage System

The Mailbox is an AI-powered unified message prioritization service that aggregates messages from Gmail, Slack, LinkedIn, WhatsApp, and Telegram via a `ChannelAdapter` abstraction, analyzes them with an LLM (AI importance scoring 0-100), and surfaces what requires follow-up. Users can compose, reply, and forward messages across all channels, with draft persistence and AI tools (Response Draft generation, Cleanup recommendations, Sender Research).

**Routes:**

| Route      | Page          | Description                                                                            |
| ---------- | ------------- | -------------------------------------------------------------------------------------- |
| `/mailbox` | `MailboxPage` | Full split-pane unified mailbox (lazy-loaded). TopNav shows unread badge (caps at 99+) |

**Data Model:**

```typescript
interface PrioritizedMessage {
  messageId: string
  userId: string
  originalMessageId: string
  source: 'gmail' | 'slack' | 'linkedin' | 'whatsapp' | 'telegram'
  sender: string
  senderEmail?: string
  subject?: string
  snippet: string // Preview text
  aiSummary: string // 1-2 sentence LLM summary
  importanceScore?: number // 0-100 AI-computed score for unified ranking
  priority: 'high' | 'medium' | 'low'
  requiresFollowUp: boolean
  followUpReason?: string // Why AI thinks follow-up is needed
  isRead: boolean
  isDismissed: boolean
  receivedAtMs: number
  originalUrl?: string // Deep link to source message
  createdAtMs: number
  updatedAtMs: number
}

interface MailboxSync {
  syncId: string
  userId: string
  triggerType: 'manual' | 'scheduled' | 'page_load'
  status: 'running' | 'completed' | 'failed'
  startedAtMs: number
  completedAtMs?: number
  error?: string
  stats: {
    gmailAccountsProcessed: number
    slackWorkspacesProcessed: number
    linkedinAccountsProcessed: number
    whatsappAccountsProcessed: number
    telegramAccountsProcessed: number
    totalMessagesScanned: number
    newMessagesFound: number
    messagesRequiringFollowUp: number
    highPriorityCount: number
    mediumPriorityCount: number
    lowPriorityCount: number
  }
}
```

**How it works:**

1. **Sync trigger** -- User clicks "Sync Now", or auto-sync fires on page load (configurable)
2. **Unified sync pipeline** -- `runUnifiedSync()` orchestrator discovers connections for each `ChannelAdapter` (Gmail, Slack, LinkedIn, WhatsApp, Telegram) and fetches messages in parallel
3. **LLM analysis** -- Each message is analyzed by the configured AI provider with channel-specific priority context:
   - Does this require follow-up? (boolean)
   - Priority level (high/medium/low)
   - Importance score (0-100) for unified cross-channel ranking
   - 1-2 sentence summary
   - Follow-up reason
4. **Storage** -- Results saved to `users/{userId}/mailboxMessages/{messageId}`
5. **Real-time display** -- Frontend subscribes via Firestore `onSnapshot` with filters:
   - `requiresFollowUp == true`
   - `isDismissed == false`
   - Ordered by `receivedAtMs` descending
   - Filtered by priority threshold

#### Channel Adapter Architecture

All channels implement a unified `ChannelAdapter` port interface (`fetchMessages`, `sendMessage`, `deleteMessage`). Each adapter also exports a connection discovery function for its channel. The `runUnifiedSync()` orchestrator iterates over all registered adapters, discovers connections, fetches messages, and passes the combined set to the AI analyzer.

| Channel      | Adapter              | Auth Method                                 | Read Strategy                                     | Write Strategy                           | Delete                          |
| ------------ | -------------------- | ------------------------------------------- | ------------------------------------------------- | ---------------------------------------- | ------------------------------- |
| **Gmail**    | `gmailAdapter.ts`    | OAuth refresh token (via Calendar settings) | Gmail API `messages.list` + `messages.get`        | RFC 2822 email via `messages.send`       | Trash (30-day recovery)         |
| **Slack**    | `slackAdapter.ts`    | Bot token (via Slack App settings)          | Conversations API `conversations.history`         | `chat.postMessage`                       | Not supported (bot limitation)  |
| **LinkedIn** | `linkedinAdapter.ts` | Cookie-based (li_at session)                | Voyager API conversation events                   | Voyager API `conversationCreate` / reply | Not supported                   |
| **WhatsApp** | `whatsappAdapter.ts` | QR code pairing (baileys)                   | Firestore cache (populated by companion service)  | Companion service HTTP API               | 48-hour window (WhatsApp limit) |
| **Telegram** | `telegramAdapter.ts` | Bot token (BotFather)                       | Firestore cache (webhook) + `getUpdates` fallback | Bot API `sendMessage`                    | 48-hour window (Telegram limit) |

**WhatsApp companion service:** WhatsApp requires a persistent WebSocket connection via the baileys library, which cannot run in stateless Cloud Functions. A separate Cloud Run companion service maintains the connection, writes incoming messages to Firestore, and exposes HTTP endpoints for send/delete. The adapter reads from this Firestore cache.

**Telegram dual-path fetch:** Production uses a webhook endpoint that writes to Firestore; the adapter reads from this cache. Development uses `getUpdates` long polling as a fallback.

**Connection storage:** Gmail connections live in `calendarAccounts` (shared with Calendar), Slack in `slackAccounts` (legacy), and LinkedIn/WhatsApp/Telegram in the unified `channelConnections` collection.

#### Channel-Specific AI Priority Context

The message analyzer includes channel-specific priority guidelines for the LLM:

- **Gmail:** Thread replies vs. newsletters; sender relationship context
- **Slack:** DMs > @mentions > channel-wide announcements
- **LinkedIn:** Direct professional > recruiter outreach > connection requests > endorsements
- **WhatsApp:** Personal from close contacts > group (unless mentioned by name) > media-only
- **Telegram:** DMs > group mentions > channel broadcasts > bot notifications

Importance scores are computed on a 0-100 scale: 90-100 urgent, 70-89 important, 50-69 standard, 30-49 low, 0-29 noise. Users can override the default priority prompt via Settings (custom priority prompt stored in `mailboxAITools` settings).

#### Mailbox AI Tools

Three AI-powered tools for message handling, following the same `AIToolConfig` pattern as Notes AI tools:

| Tool                | Input                                               | Output                                  | Description                                                                                                   |
| ------------------- | --------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Response Draft**  | Message context, sender persona, tone override      | Subject, body, tone, alternate versions | Generates contextual reply drafts using sender language profile                                               |
| **Mailbox Cleanup** | Batch of message summaries                          | Action recommendations per message      | Suggests archive, snooze, unsubscribe, or keep for each message                                               |
| **Sender Research** | Sender name, email, LinkedIn URL, existing messages | Full persona profile                    | Builds contact profile with topics, interests, talking points, language profile; persists to `senderPersonas` |

```typescript
interface MailboxAIToolSettings {
  tools: Record<MailboxAIToolId, MailboxAIToolConfig>
  customPriorityPrompt?: string // Override default priority analysis prompt
  version: number
  updatedAtMs: number
}
```

Tool configuration (system prompt, model, max tokens, enabled/disabled) is managed per-user in the AI Tool Settings page alongside Notes and Workout AI tools.

#### Mailbox Composer

A modal message composer for composing, replying, and forwarding across all channels:

- **Rich text mode:** Uses the existing TipTap editor component (full feature set: markdown, code blocks, lists, etc.)
- **Plain text mode:** Simple textarea with mode toggle
- **Channel selector:** Dropdown locked to source channel when replying
- **Recipient autocomplete:** Queries recent senders + sender personas, keyboard navigable (ArrowUp/Down, Enter, Escape), ARIA combobox attributes
- **Draft persistence:** Auto-saves to Firestore every 30 seconds (dirty flag avoids unnecessary writes); drafts stored in `mailboxDrafts` collection
- **Pre-fill on reply:** Source, recipient, subject (with "Re:" prefix)

#### Mailbox Page UX

The `/mailbox` page uses a split-pane layout (380px list + flexible detail):

**Left panel (MailboxMessageList):**

- Channel filter tabs (All, Gmail, Slack, LinkedIn, WhatsApp, Telegram) -- only shown when messages exist from multiple sources
- Messages sorted by AI importance score descending, then `receivedAtMs`
- Top-10 AI-ranked messages get a gold border and "AI Top 10" badge
- Per-source icons with color-coded backgrounds; priority badges (high/medium/low)
- Read messages dimmed; dismiss on hover; keyboard navigation (ArrowDown/Up, Enter, 'e' dismiss, 'r' reply)

**Right panel (MailboxMessageDetail):**

- Source badge, priority indicator, importance score
- Sender, subject, timestamp (relative + full)
- AI Summary card with follow-up reason
- Actions: Reply, Open Original, Dismiss

**Page-level shortcuts:** `Cmd+N` or `c` to compose, `Escape` to close composer or deselect

**Error handling:** Both panels wrapped in `ErrorBoundary` with retry fallback. Auto-sync uses exponential backoff (1s, 2s, 4s, max 3 retries).

**User actions:** Dismiss (hide), Mark as Read, Reply (opens composer), Compose new message, Open Original in source app, AI Response Draft, AI Cleanup, AI Sender Research.

**Cloud Functions:**

| Endpoint             | Method | Description                                                                     |
| -------------------- | ------ | ------------------------------------------------------------------------------- |
| `mailboxSync`        | POST   | Trigger unified sync across all channels                                        |
| `mailboxMarkRead`    | POST   | Mark a message as read                                                          |
| `mailboxDismiss`     | POST   | Dismiss a message                                                               |
| `mailboxSend`        | POST   | Send a message via channel adapter                                              |
| `mailboxDelete`      | POST   | Delete/trash a message via channel adapter                                      |
| `mailboxSaveDraft`   | POST   | Save/update a composer draft                                                    |
| `mailboxDeleteDraft` | POST   | Delete a saved draft                                                            |
| `mailboxAITool`      | onCall | AI tools: responseDraft, mailboxCleanup, senderResearch (routed by `data.tool`) |

**Firestore collections:**

```
users/{userId}/mailboxMessages/{messageId}
users/{userId}/mailboxSyncs/{syncId}
users/{userId}/mailbox/settings
users/{userId}/mailboxDrafts/{draftId}
users/{userId}/channelConnections/{connectionId}
users/{userId}/senderPersonas/{personaId}
users/{userId}/slackConnections/{connectionId}
users/{userId}/integrations/slack
```

---

### 2.2 Calendar

#### Purpose

A multi-view calendar with bidirectional Google Calendar sync, recurring event support, offline editing, and RSVP management.

#### Data Model

```typescript
interface CanonicalCalendarEvent {
  canonicalEventId: string
  userId: string
  calendarId: string
  title: string
  description?: string
  startMs: number // Unix milliseconds
  endMs: number
  timeZone?: string
  location?: string
  attendees?: Array<{
    email: string
    name?: string
    responseStatus: 'accepted' | 'declined' | 'tentative' | 'needsAction'
  }>
  recurrence?: {
    rrule: string // RFC 5545 RRULE
    exdates?: string[] // Exception dates
    rdates?: string[] // Additional dates
  }
  occursOn?: string[] // Array of YYYY-MM-DD for quick day-based queries
  sourceEventId?: string // Google Calendar event ID
  isRecurringRoot?: boolean
  customReminders?: Array<{
    reminderId: string
    minutesBefore: number
    method: 'notification' | 'email'
    acknowledged?: boolean
  }>
  isDraft?: boolean
  pendingSync?: boolean
}
```

#### Views

| View        | Behavior                             |
| ----------- | ------------------------------------ |
| **Monthly** | Full month grid, events as dots/bars |
| **Weekly**  | 7-day column layout with time slots  |
| **Daily**   | Single-day timeline                  |
| **Agenda**  | 14-day forward-looking list          |

#### Google Calendar Integration

**Connect flow:**

1. User clicks "Connect Google Calendar"
2. Frontend calls `googleAuthStart` Cloud Function
3. Function returns OAuth URL with calendar scopes
4. User authorizes, redirected back with success param
5. Backend stores refresh token, syncs all calendars

**Sync flow:**

- Manual "Sync Now" button triggers `syncNow` Cloud Function
- Bulk sync detection: if 50+ events arrive, shows progress toast
- Bidirectional: local changes are written back to Google via outbox pattern

**Offline-first pattern:**

1. Load from IndexedDB first (instant display)
2. Fetch fresh from Firestore in background
3. Cache new results to IndexedDB
4. Outbox queues offline writes for eventual sync

**Firestore collections:**

```
users/{userId}/calendarEvents/{eventId}
users/{userId}/calendars/{calendarId}
users/{userId}/calendarAccounts/{accountId}
users/{userId}/calendarSyncState/{stateId}
```

---

### 2.3 Planner

#### Purpose

A unified planner consolidating task management with OKR-based project planning, habit tracking, and workout scheduling. Supports multiple views for different planning contexts.

#### Task Data Model

```typescript
type UrgencyLevel = 'today' | 'next_3_days' | 'this_week' | 'this_month' | 'next_month' | 'later'
type ImportanceLevel = 1 | 2 | 4 | 7 | 10
type TaskStatus =
  | 'inbox'
  | 'next_action'
  | 'waiting_for'
  | 'scheduled'
  | 'someday'
  | 'done'
  | 'cancelled'
type Domain = 'work' | 'projects' | 'life' | 'learning' | 'wellbeing'

interface CanonicalTask {
  id: string
  userId: string
  projectId?: string
  chapterId?: string // Milestone within project
  keyResultId?: string // OKR tracking
  title: string
  description?: string
  domain: Domain
  dueDate?: string // YYYY-MM-DD
  urgency?: UrgencyLevel
  importance: ImportanceLevel
  status: TaskStatus
  allocatedTimeMinutes?: number // Time estimate
  completed: boolean
  calendarEventIds?: string[] // Time-blocking links
  archived: boolean
}
```

#### Project Hierarchy with OKRs

```typescript
interface CanonicalProject {
  id: string
  title: string
  domain: Domain
  objective?: string // OKR objective
  keyResults?: Array<{ id: string; text: string }>
}

interface CanonicalChapter {
  // Milestone / epic
  id: string
  projectId: string
  title: string
  objective?: string
  keyResults?: Array<{ id: string; text: string }>
  deadline?: string
}
```

Key Result progress is computed automatically:

```
progress = (tasks linked to KR that are completed) / (total tasks linked to KR) * 100
```

#### Planner Views

**Priority View:**

- Left sidebar: Project tree (expandable projects → chapters → task counts)
- Main area: Tasks plotted on an Urgency vs. Importance matrix
- Right panel: Task detail sidebar with full editing

**List View:**

- Sortable table (priority, urgency, importance, dueDate, title)
- Virtual scrolling via `react-window` for large task lists
- Pagination: 20 rows per page
- Filters: domain, timeline, completion status, time range (min/max estimated hours)

**Training Section:**

- Today's workout (gym/home/road variants from active plan)
- Weekly plan grid (7 days with exercise blocks)
- Weekly review stats

**Habits Section:**

- Active/Paused/Archived filter toggle
- Habit cards: title, domain, recipe (standard + tiny version), schedule (day badges)
- Stats: current streak, 30-day completion rate, 7-dot streak visualization

#### Task Scheduling to Calendar

Tasks can be "time-blocked" onto the calendar:

1. User clicks "Schedule" on a task
2. Task's `allocatedTimeMinutes` pre-fills event duration
3. Event created in Calendar system
4. Task status updated to `scheduled`
5. `calendarEventIds` array stores the link

**Firestore collections:**

```
users/{userId}/projects/{projectId}
users/{userId}/chapters/{chapterId}
users/{userId}/tasks/{taskId}
users/{userId}/habits/{habitId}
users/{userId}/habitCheckins/{checkinId}
```

---

## 3. Notes & Creativity

### 3.1 Notes Editor

#### Purpose

A Notion-like note-taking system with rich text editing, inter-note linking, paragraph-level tagging, offline-first sync, and a topic/section organizational hierarchy.

#### Data Model

```typescript
interface Note {
  noteId: NoteId // Branded string type
  userId: string
  title: string
  content: JSONContent // TipTap/ProseMirror JSON format
  topicId?: TopicId
  tags: string[]
  projectIds: string[] // Cross-domain linking
  linkedNoteIds: NoteId[] // Explicit [[note]] links
  backlinkNoteIds: NoteId[] // Incoming links (computed)
  mentionedNoteIds: NoteId[] // Inferred text mentions
  paragraphLinks: Record<
    string,
    {
      // Paragraph-level tagging
      noteIds: NoteId[]
      topicIds: TopicId[]
    }
  >
  syncState: 'synced' | 'syncing' | 'pending' | 'failed'
  version: number
  createdAtMs: number
  updatedAtMs: number
}
```

#### Editor Technology

Built on **TipTap** (ProseMirror-based rich text editor) with extensive extensions:

| Extension                 | Purpose                                                 |
| ------------------------- | ------------------------------------------------------- |
| StarterKit                | Headings, bold, italic, lists, code blocks, blockquotes |
| Mathematics (KaTeX)       | LaTeX equation rendering (`$inline$` and `$$block$$`)   |
| Tables                    | Full table support (insert, merge, split cells)         |
| TaskList + TaskItem       | Interactive checkboxes                                  |
| Image                     | Image embedding                                         |
| Link                      | URL links with preview                                  |
| Highlight                 | Text highlighting                                       |
| CharacterCount            | Word/character metrics                                  |
| **NoteLink** (custom)     | `[[noteTitle]]` inter-note linking                      |
| **ParagraphTag** (custom) | Tag individual paragraphs with notes/topics             |

**Editor UX components:**

| Component            | Trigger              | Function                                |
| -------------------- | -------------------- | --------------------------------------- |
| CommandMenu          | `/` at line start    | Slash-command palette (add blocks)      |
| NoteLinkAutocomplete | `[[`                 | Search and link to other notes          |
| ParagraphTagMenu     | `Cmd/Ctrl+T`         | Tag paragraphs with notes/topics        |
| BlockMenu            | Right-click / hover  | Duplicate, delete, convert, move blocks |
| NodeDivider          | Hover between blocks | Drag handle UI for block reordering     |
| MathInlinePanel      | Click math node      | LaTeX equation editor                   |
| TableControlMenu     | Click table          | Table editing controls                  |

#### Link System (Three Types)

1. **Explicit Links** (`[[noteTitle]]`): Created via `[[` autocomplete, stored in `linkedNoteIds`
2. **Mentions** (inferred): Note titles found as plain text in content, stored in `mentionedNoteIds`
3. **Paragraph Tags**: Individual paragraphs tagged with notes/topics via `Cmd+T`, stored in `paragraphLinks`

**Link extraction** runs on every save:

- `updateNoteLinks()` compares note content against all note titles using a metadata cache
- Triggers backlink recomputation on target notes (Firestore `array-contains` queries)
- Metadata cache provides O(1) title lookups to avoid expensive queries

#### Sync Worker

A background sync worker (`notes/syncWorker.ts`) handles offline-first synchronization:

- **Cycle interval:** 30 seconds (configurable)
- **Push phase:** Process pending note/topic/section operations from outbox
- **Pull phase:** Fetch remote changes and merge with local state
- **Cleanup:** Remove orphaned duplicates and empty drafts
- **Conflict resolution:** Last-write-wins with version tracking
- **Smart pausing:** Pauses when browser tab is hidden, resumes on focus
- **Retry:** Exponential backoff for recoverable errors

**Sync state display:** Banner shows pending count, failed count, last sync time, with manual "Retry All" button.

#### Content Import

The `ImportModal` supports:

| Format     | Method                                                            |
| ---------- | ----------------------------------------------------------------- |
| Markdown   | Parsed to TipTap JSONContent, YAML frontmatter extracted for tags |
| PDF        | Parsed via PDF.js library                                         |
| Plain text | Direct content insertion                                          |

- File size limit: 10MB
- Drag-and-drop support
- Two modes: create new note or append to current note
- Auto-extracts title from filename

---

### 3.2 AI Tools for Notes

#### Purpose

Six AI-powered tools that analyze, enhance, and manage note content -- all powered by the user's own API keys.

#### Tool Inventory

| Tool                    | Input                                 | Output                                                             | Backend          |
| ----------------------- | ------------------------------------- | ------------------------------------------------------------------ | ---------------- |
| **Summarize**           | Note content (text)                   | Concise bullet-point summary                                       | Single LLM call  |
| **Fact Check**          | Note content                          | Multi-step: extract claims → user selects → verify with web search | 3-phase pipeline |
| **LinkedIn Analysis**   | Note content                          | Score (0-10), hook suggestions, hashtags, posting timing           | LLM + web search |
| **Write with AI**       | Note + custom prompt                  | Generated text for insertion                                       | LLM with prompt  |
| **Auto-Tag Paragraphs** | Note content + available topics/notes | Paragraph → tag suggestions                                        | LLM with context |
| **Manage Tags**         | Note content                          | Note-level tag suggestions + editor                                | LLM analysis     |

#### Implementation Architecture

```
TipTap Editor → extractTextForAI() → AIToolsDropdown
                                          ↓
                                   useNoteAITools() hook
                                          ↓
                                   lib/noteAITools.ts
                                          ↓
                                   httpsCallable('analyzeNoteWithAI')
                                          ↓
                                   Cloud Function (noteAnalysis.ts)
                                          ↓
                                   Claude API (via anthropicService)
                                          ↓
                                   Result + token usage
```

**Cost transparency:** Every tool result includes `{ inputTokens, outputTokens }`, displayed in the modal footer as a USD cost calculation.

#### Fact Check Workflow (Interactive Multi-Step)

This is the most complex tool, using a state machine:

```
Phase 1: EXTRACTING
  → LLM extracts factual claims from note
  → Returns: { claim, confidence, explanation, suggestedSources }[]

Phase 2: SELECTING
  → User reviews claims, selects which to verify (checkboxes)
  → Shows confidence levels (high/medium/low)

Phase 3: VERIFYING
  → For each selected claim: web search + LLM synthesis
  → Returns: { verdict: 'supported'|'contradicted'|'inconclusive', sources[], confidence }
  → Unselected claims marked "user_confirmed"

Phase 4: DONE
  → Results grouped by verdict type with source citations
```

---

### 3.3 Knowledge Graph

#### Purpose

A visual, interactive graph showing relationships between notes -- explicit links, mentions, shared tags, shared projects, and paragraph-level connections.

#### Graph Data Model

```typescript
interface NoteGraphNode {
  noteId: NoteId
  title: string
  topicId: TopicId | null
  projectIds: string[]
  tags: string[]
  linkCount: number // Outgoing edges
  backlinkCount: number // Incoming edges
}

type NoteGraphEdgeType =
  | 'explicit_link' // [[note]] references
  | 'mention' // Note title appears in content
  | 'shared_project' // Notes in same project (threshold: 2+)
  | 'shared_tag' // Notes with same tags (threshold: 1+)
  | 'paragraph_tag' // Paragraph-level tagging

interface GraphFilters {
  projectIds?: string[]
  topicId?: TopicId
  tags?: string[]
  dateRange?: { startMs?; endMs? }
  includeOrphans?: boolean // Default: false
  minSharedTags?: number // Default: 1
  minSharedProjects?: number // Default: 2
}
```

#### Graph Operations

| Operation                                  | Algorithm                  | Purpose                            |
| ------------------------------------------ | -------------------------- | ---------------------------------- |
| `buildGraph(userId, filters)`              | In-memory construction     | Build full graph with 5 edge types |
| `getConnectedNotes(userId, noteId, depth)` | BFS traversal              | Find all notes within N hops       |
| `getBacklinks(userId, noteId)`             | Firestore `array-contains` | Find notes linking to target       |
| `findShortestPath(from, to)`               | Dijkstra's algorithm       | Path between two notes             |
| `getOrphanNotes(userId)`                   | Degree = 0 filter          | Find isolated notes                |

#### Visualization

- **Library:** D3.js force-directed layout (SVG rendering)
- **Node size:** Proportional to link count (hub importance)
- **Edge color:** Coded by edge type
- **Interactions:** Click node → navigate to note; hover → show connections
- **Sidebar:** Filters (topic, tag thresholds, orphan toggle), search, hub statistics
- **Caching:** 5-minute TTL with filter-based cache keys, invalidated on note changes

---

## 4. Agents & AI Integration

### 4.1 Agent System Core

#### Purpose

A configurable AI agent system where users define agents with specific roles, models, tools, and system prompts. Agents execute within workflows to accomplish complex tasks.

#### Agent Data Model

```typescript
interface AgentConfig {
  agentId: AgentId // Branded: 'agent:uuid'
  userId: string
  name: string
  description?: string
  role: AgentRole
  systemPrompt: string // Agent personality/instructions
  modelProvider: 'openai' | 'anthropic' | 'google' | 'xai'
  modelName: string // e.g. 'claude-opus-4-6', 'gpt-5.2'
  temperature: number // 0-2
  maxTokens?: number
  toolIds: ToolId[] // Allowed tools
  archived: boolean
  createdAtMs: number
  updatedAtMs: number
  syncState: 'synced' | 'pending' | 'failed'
  version: number
}

type AgentRole =
  | 'planner'
  | 'researcher'
  | 'critic'
  | 'synthesizer'
  | 'executor'
  | 'supervisor'
  | 'custom'
  // Dialectical roles:
  | 'thesis_generator'
  | 'antithesis_agent'
  | 'contradiction_tracker'
  | 'sublation_synthesizer'
  | 'meta_reflector'
  | 'context_retriever'
```

#### Model Configuration

Supported models per provider:

| Provider      | Models                                               | Key Features                    |
| ------------- | ---------------------------------------------------- | ------------------------------- |
| **Anthropic** | Claude Opus 4.6, Claude Sonnet 4.5, Claude Haiku 4.5 | Best tool calling, long context |
| **OpenAI**    | GPT-5.2, GPT-4.1, o4-mini                            | Function calling, streaming     |
| **Google**    | Gemini 3 Pro, Gemini 2.5 Pro, Gemini 3 Flash         | Multimodal, fast inference      |
| **xAI**       | Grok models                                          | Fast inference                  |

All models have pricing stored in `MODEL_PRICING` lookup table for cost calculation:

```
Cost = (inputTokens / 1,000,000) * inputPrice + (outputTokens / 1,000,000) * outputPrice
```

#### Run Data Model

```typescript
interface Run {
  runId: RunId
  workflowId: WorkflowId
  userId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused' | 'waiting_for_input'
  goal: string // User's prompt
  context?: Record<string, unknown> // Additional context
  output?: string // Final result
  messages: RunMessage[] // Conversation history
  tokensUsed: number
  estimatedCost: number
  startedAtMs: number
  completedAtMs?: number
  workflowState?: {
    // Execution state
    dialectical?: DialecticalState
    visitedNodes?: Map<string, number>
    edgeHistory?: string[]
  }
  error?: { message: string; category: string }
}
```

#### Real-Time Event Streaming

Runs emit events stored in Firestore sub-collections, consumed by the frontend in real-time:

```typescript
interface RunEvent {
  eventId: string
  type:
    | 'token'
    | 'tool_call'
    | 'tool_result'
    | 'status'
    | 'error'
    | 'final'
    | 'dialectical_phase'
    | 'dialectical_thesis'
  runId: string
  agentId?: string
  agentName?: string
  provider?: string
  model?: string
  step?: number
  timestampMs: number
  delta?: string // Token streaming (buffered at 250ms / 200 chars)
  output?: string // Full output
  toolName?: string
  toolResult?: unknown
}
```

**Storage:** `users/{userId}/runs/{runId}/events/{eventId}`

The `RunEventWriter` on the backend batches token events (flush every 250ms or 200 chars) for efficient Firestore writes. The frontend subscribes via `useRunEvents(runId)` hook.

---

### 4.2 Tools & Provider Services

#### Tool System

Agents can invoke tools during execution. Tools are defined with JSON Schema parameters and executed in a sandboxed environment.

```typescript
interface ToolDefinition {
  toolId: ToolId
  userId: string
  name: string
  description: string
  category: 'search' | 'calendar' | 'notes' | 'analysis' | 'custom'
  parameters: JSONSchema // Input schema
  isBuiltIn: boolean
  enabled: boolean
}
```

**Built-in tools** (from `builtinTools.ts` and `advancedTools.ts`):

| Category     | Tools                                                                                              |
| ------------ | -------------------------------------------------------------------------------------------------- |
| **Search**   | `web_search` (Serper), `web_scrape` (Firecrawl), `semantic_search` (Exa), `content_extract` (Jina) |
| **Calendar** | `list_events`, `create_event`, `update_event`, `delete_event`                                      |
| **Notes**    | `search_notes`, `create_note`, `update_note`, `list_notes`, `tag_note`                             |
| **Analysis** | `summarize_text`, `extract_entities`, `sentiment_analysis`                                         |
| **Google**   | `google_drive_search`, `google_drive_download`, `gmail_list`, `gmail_read`                         |

**Custom tools** can be defined by users with arbitrary parameter schemas and execution logic.

#### Tool Execution Flow

```
1. Agent generates tool_call with name + parameters
2. toolExecutor.ts looks up tool in registry
3. Parameters validated against JSON Schema
4. Tool executed with context: { userId, runId, workflowId, agentId }
5. Result returned to agent for next iteration
6. ToolCallRecord saved to Firestore for tracing
```

**Safety mechanisms:**

- Per-tool timeout limits
- Retry logic with exponential backoff
- Iteration limit to prevent infinite tool loops
- Safe math evaluation via `expr-eval` (sandboxed expression parser, no `eval()`)
- Error categorization (network, auth, rate_limit, validation, timeout)

#### Provider Service Architecture

A unified `executeWithProvider()` function routes to provider-specific implementations:

```typescript
async function executeWithProvider(
  agent: AgentConfig,
  goal: string,
  context?: Record<string, unknown>,
  apiKeys: ProviderKeys,
  toolContext?: ToolExecutionContext
): Promise<{
  output: string
  tokensUsed: number
  estimatedCost: number
  iterationsUsed: number
  provider: string
  model: string
}>
```

Each provider service (Anthropic, OpenAI, Google, Grok) implements:

- Client SDK initialization
- Message formatting (provider-specific)
- Tool schema conversion (e.g., Anthropic `tool_use` vs OpenAI `function`)
- Iterative tool-calling loop
- Token counting and cost calculation
- Streaming support via `executeWithProviderStreaming()`

**API key management:** User-provided keys stored in Firestore, cached locally, with real-time sync via listeners.

---

### 4.3 Basic Workflows

#### Workflow Data Model

```typescript
interface WorkflowConfig {
  workflowId: WorkflowId
  userId: string
  name: string
  description?: string
  agentIds: AgentId[] // Participating agents
  defaultAgentId?: AgentId // Entry point agent
  workflowType: 'sequential' | 'parallel' | 'supervisor' | 'custom' | 'graph' | 'dialectical'
  parallelMergeStrategy?: JoinAggregationMode
  maxIterations?: number // Default 10, max 200
  expertCouncilConfig?: ExpertCouncilConfig
  projectManagerConfig?: ProjectManagerConfig
  memoryMessageLimit?: number // Conversation history window
  workflowGraph?: WorkflowGraph // For custom/graph types
  archived: boolean
}
```

#### Execution Architecture

Workflows are triggered by creating a Run document with `status: 'pending'`. A Firestore `onDocumentCreated` trigger in Cloud Functions picks it up:

```
1. Validate run is pending
2. Create RunEventWriter for real-time streaming
3. Check rate limits and user quota
4. Update status → 'running'
5. Load: workflow config, agents, API keys, tools, search keys, memory settings
6. Build conversation context from message history
7. Execute workflow based on type
8. On success: status → 'completed', store output, update quota
9. On error: status → 'failed', record error with category
```

**Cloud Function config:** 1 GiB memory, 540-second timeout (9 minutes).

#### Sequential Workflows

```
Agent 1 → Agent 2 → Agent 3
  (each receives previous agent's output as context)
```

- Agents execute in order of `agentIds` array
- Output chaining: each agent receives the previous agent's output plus original context
- Use case: Multi-step reasoning, iterative refinement (e.g., research → analyze → write)

#### Parallel Workflows

```
         ┌── Agent 1 ──┐
Goal ────┤              ├── Join → Final Output
         └── Agent 2 ──┘
```

- All agents execute simultaneously (`Promise.all`)
- Outputs merged via configurable strategy:

| Strategy        | Behavior                            |
| --------------- | ----------------------------------- |
| `list`          | Array of all outputs                |
| `ranked`        | Borda scoring of responses          |
| `consensus`     | Agreement metric computation        |
| `synthesize`    | AI-powered synthesis of all outputs |
| `dedup_combine` | Deduplicated merge                  |

- Use case: Multi-perspective analysis, comparing viewpoints

#### Expert Council

The Expert Council is a three-stage multi-model debate pattern:

**Stage 1: Council Responses**

- Multiple models (2-10) answer the same prompt in parallel
- Each response labeled anonymously (A, B, C...)
- Tracks: response text, latency, tokens, cost, status per model

**Stage 2: Judge Consensus**

- Judge models (or council members) critique and rank all responses
- Anonymized to prevent model bias
- Metrics computed:
  - **Borda Score:** `sum(n - rank_position)` per response
  - **Kendall's Tau:** Pairwise rank agreement (-1 to +1)
  - **Consensus Score:** `(avg_tau + 1) / 2 * 100` (0-100%)
  - **Controversial Responses:** Items with `stddev > 1.5`

**Stage 3: Chairman Synthesis**

- Chairman model reads: original prompt, all responses (anonymized), rankings, metrics
- Produces final synthesized response

```typescript
interface ExpertCouncilConfig {
  enabled: boolean
  defaultMode: 'full' | 'quick' | 'single' | 'custom'
  councilModels: Array<{
    modelId: string
    provider: string
    modelName: string
    temperature?: number
    systemPrompt?: string
  }>                                    // 2-10 models
  chairmanModel: { modelId, provider, modelName }
  judgeModels?: [...]                   // Defaults to council if undefined
  selfExclusionEnabled: boolean         // Don't judge own response
  requireConsensusThreshold?: number    // 0-100
  enableCaching: boolean
  cacheExpirationHours: number
}
```

**Execution modes:**

- `full`: All 3 stages (most expensive, highest quality)
- `quick`: Stage 1 + Stage 3 (skip judge reviews)
- `single`: Only chairman (cheapest)
- `custom`: User-defined combination

**Caching:** Responses cached by hash of `(userId, prompt, config, mode, context)` with configurable TTL to avoid redundant expensive multi-model runs.

---

## 5. Advanced Use-Cases

### 5.1 Supervisor Workflows

#### Purpose

A supervisor agent dynamically routes tasks to specialized agents based on analysis of the goal, rather than following a fixed execution order.

#### How It Works

```
User Goal → Supervisor Agent
                ↓ (analyzes task)
         Routes to: Agent A (research)
                ↓ (receives result)
         Routes to: Agent B (analysis)
                ↓ (receives result)
         Decides: task complete or route again
                ↓
         Final Output
```

The supervisor agent:

1. Receives the user's goal and available agent roster
2. Analyzes the task and decides which specialist to invoke
3. Receives the specialist's output
4. Decides: invoke another specialist, or synthesize final answer
5. Repeats until `maxIterations` reached or supervisor declares done

**Key difference from sequential:** The supervisor chooses dynamically which agent to call and in what order, based on intermediate results. This is similar to the ReAct pattern in agentic AI.

---

### 5.2 Graph Workflows & Visual Builder

#### Purpose

User-defined directed acyclic graphs (DAGs) with arbitrary topology, conditional branching, and join nodes. Built visually using a drag-and-drop workflow editor.

#### Workflow Graph Data Model

```typescript
interface WorkflowGraph {
  version: 1
  startNodeId: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  limits?: {
    maxNodeVisits?: number
    maxEdgeRepeats?: number
  }
}

interface WorkflowNode {
  id: string
  type:
    | 'agent'
    | 'tool'
    | 'human_input'
    | 'join'
    | 'end'
    | 'research_request'
    | 'retrieve_context'
    | 'generate_theses'
    | 'cross_negation'
    | 'crystallize_contradictions'
    | 'sublate'
    | 'meta_reflect'
  label?: string
  agentId?: AgentId // For agent nodes
  toolId?: ToolId // For tool nodes
  outputKey?: string // Key to store output
  aggregationMode?: JoinAggregationMode // For join nodes
}

interface WorkflowEdge {
  from: string
  to: string
  condition: {
    type: 'always' | 'equals' | 'contains' | 'regex'
    key?: string // Output key to check
    value?: string // Expected value
  }
}
```

#### Visual Builder (CustomWorkflowBuilder)

Built with **React Flow** (`@xyflow/react`), the visual builder provides:

| Feature                 | Implementation                                         |
| ----------------------- | ------------------------------------------------------ |
| **Node Palette**        | Drag-and-drop panel with all node types                |
| **Canvas**              | Zoomable, pannable graph canvas                        |
| **Edge Drawing**        | Click source handle → click target to create edges     |
| **Node Properties**     | Side panel / modal for configuring node attributes     |
| **Condition Editor**    | Edge condition configuration (type, key, value)        |
| **Layout Algorithm**    | BFS-based depth computation with automatic positioning |
| **Back Edge Detection** | Identifies cycles, renders as dashed warning lines     |
| **Theme Support**       | Color-coded node types with light/dark variants        |

**Node type colors** and dimensions are defined in `workflowLayoutUtils.ts` with presets for `default` and `compact` layouts.

**State management** uses a reducer pattern (`customWorkflowBuilderReducer.ts`) with actions: `ADD_NODE`, `REMOVE_NODE`, `UPDATE_NODE`, `ADD_EDGE`, `REMOVE_EDGE`, `UPDATE_EDGE`, `SET_START_NODE`, `RESET`.

#### Graph Execution Engine

```
1. Start at startNodeId
2. Execute node based on type:
   - agent: Call executeWithProvider()
   - tool: Call toolExecutor
   - human_input: Pause run (status → 'waiting_for_input')
   - join: Aggregate outputs from incoming edges
   - research_request: Delegate to deep research system
   - end: Terminate
3. Evaluate outgoing edges:
   - Check each edge's condition against node output
   - 'always' edges always traverse
   - 'equals'/'contains'/'regex' check output key/value
4. Track state: visited counts, edge history, outputs
5. Enforce limits: maxNodeVisits, maxEdgeRepeats
6. Repeat until 'end' node or limits reached
```

#### Read-Only Graph View

The `WorkflowGraphView` component renders graphs in read-only mode using React Flow, with:

- Node positions calculated via BFS depth assignment
- Animated edges for `always` conditions
- Dashed warning edges for back-references (cycles)
- Compact mode for embedding in run cards
- Edge labels showing condition expressions

---

### 5.3 Dialectical Workflows

#### Purpose

A Hegelian-inspired reasoning pattern where multiple AI agents generate theses, challenge them through negation, identify contradictions, and produce higher-order syntheses through sublation. Designed for deep philosophical inquiry, complex problem analysis, and exploring tensions in ideas.

#### Dialectical Domain Model

```typescript
interface DialecticalState {
  cycleNumber: number
  phase: DialecticalPhase
  theses: Thesis[]
  negations: Negation[]
  contradictions: Contradiction[]
  synthesis: Synthesis | null
  metaDecision: MetaDecision | null
  conceptualVelocity: number // Rate of new concept emergence
  velocityHistory: number[]
  contradictionDensity: number // Contradictions per thesis
  densityHistory: number[]
  tokensUsed: number
  estimatedCost: number
  startedAtMs: number
}

type DialecticalPhase =
  | 'retrieve_context'
  | 'generate_theses'
  | 'cross_negation'
  | 'crystallize_contradictions'
  | 'sublate'
  | 'meta_reflect'
```

#### Six-Phase Cycle

Each dialectical cycle progresses through these phases:

```
Phase 1: RETRIEVE CONTEXT
  → Context retriever agent gathers relevant background
  → Sources: notes, previous cycles, external knowledge

Phase 2: GENERATE THESES
  → Thesis generator agent produces multiple theses on the topic
  → Each thesis: { text, confidence, supporting_evidence }

Phase 3: CROSS NEGATION
  → Antithesis agent challenges each thesis
  → Produces negations: { targetThesisId, counterArgument, strength }

Phase 4: CRYSTALLIZE CONTRADICTIONS
  → Contradiction tracker identifies genuine contradictions
  → Filters noise from substantive tensions
  → Records: { thesisId, negationId, nature, severity }

Phase 5: SUBLATION (Aufhebung)
  → Sublation synthesizer preserves valid elements from both sides
  → Produces higher-order synthesis that transcends the contradiction
  → Key Hegelian concept: not mere compromise, but elevation

Phase 6: META REFLECTION
  → Meta reflector evaluates the cycle's progress
  → Computes: conceptual velocity, contradiction density
  → Decides: continue cycling or terminate
  → MetaDecision: { shouldContinue, reason, nextFocusArea }
```

#### Backend Engines

| File                       | Purpose                                           |
| -------------------------- | ------------------------------------------------- |
| `sublationEngine.ts`       | Implements the Aufhebung synthesis process        |
| `contradictionTrackers.ts` | Identifies and categorizes contradictions         |
| `metaReflection.ts`        | Evaluates cycle progress and decides continuation |

#### Dialectical Metrics

- **Conceptual Velocity:** Rate of genuinely new concepts emerging per cycle. High velocity = productive inquiry. Declining velocity may signal convergence.
- **Contradiction Density:** Ratio of contradictions to theses. High density = complex problem space. Zero density = consensus or exhaustion.

#### Visualization (DialecticalCycleVisualization)

The frontend component displays:

- Current cycle number and phase
- Theses, negations, and contradictions as interactive cards
- Synthesis text
- Velocity and density sparkline charts (history arrays)
- Phase progress indicator
- Status badge (running, paused, completed, failed)

---

### 5.4 Complex Workflow Templates

#### Purpose

Pre-built workflow configurations for common advanced use-cases. Users can instantiate templates with custom parameters rather than building from scratch.

#### Template System

```typescript
interface WorkflowTemplate {
  templateId: WorkflowTemplateId
  userId: string | 'system' // 'system' for built-in presets
  name: string
  description: string
  workflowType: WorkflowType
  agentTemplates: AgentTemplate[] // Agent configs with placeholders
  workflowGraph?: WorkflowGraph // Pre-built graph
  expertCouncilConfig?: ExpertCouncilConfig
  projectManagerConfig?: ProjectManagerConfig
  tags: string[]
  isPublic: boolean
}
```

**Template instantiation** (`templateInstantiation.ts`):

1. Load template
2. Replace placeholder variables with user-provided values
3. Create concrete agent configs from agent templates
4. Create workflow config with concrete agent IDs
5. Save to user's collection

#### Template Presets (Built-in)

The `templatePresets.ts` file defines pre-configured templates:

| Template                | Type                  | Agents                                             | Use Case                             |
| ----------------------- | --------------------- | -------------------------------------------------- | ------------------------------------ |
| **Deep Research**       | Sequential + Research | Researcher, Synthesizer, Critic                    | Multi-source research with synthesis |
| **Expert Panel**        | Parallel + Council    | 3+ domain experts                                  | Multi-model debate with consensus    |
| **Content Pipeline**    | Sequential            | Researcher, Writer, Editor                         | Content creation workflow            |
| **Code Review**         | Parallel              | Reviewer, Security Auditor, Style Checker          | Multi-angle code analysis            |
| **Dialectical Inquiry** | Dialectical           | Thesis, Antithesis, Contradiction, Sublation, Meta | Hegelian reasoning cycles            |

#### Deep Research System

The most complex built-in template, combining agent workflows with human-in-the-loop research:

**Data Model:**

```typescript
interface DeepResearchRequest {
  requestId: string
  userId: string
  workflowId: WorkflowId
  runId: RunId
  topic: string
  questions: string[] // Specific research questions
  context?: string // Background context
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  results: Array<{
    source: string // Where the finding came from
    model: string // Which AI model
    content: string // Research content
    addedAtMs: number
  }>
  synthesizedFindings?: string // AI-synthesized final output
  integratedAtMs?: number
}
```

**Research flow:**

1. Workflow creates a `research_request` node with topic + questions
2. Request stored in `users/{userId}/deepResearchRequests/{requestId}`
3. Research Queue UI shows pending requests
4. Users can:
   - Upload findings manually (PDFs, text, URLs)
   - Let AI agents auto-research (web search tools)
   - Combine human + AI research
5. When all questions answered, trigger synthesis:
   - `synthesizeResearch` Cloud Function builds a synthesis agent
   - Agent reads all results and produces unified findings
   - Fallback: simple concatenation if AI synthesis fails
6. Synthesized findings saved back to request

**Research Queue UI** (`ResearchQueue.tsx`, `ResearchQueueSidebar.tsx`):

- Pending requests with question lists
- Upload modal for adding findings
- Status tracking per question
- Synthesis trigger button
- Result preview

**Research Upload Modal** (`ResearchUploadModal.tsx`):

- Text input for pasted findings
- File upload (PDF, text, markdown)
- Source attribution field
- Question assignment (which question does this answer?)

---

### 5.5 Project Manager

#### Purpose

A quality gate and requirements tracking system that overlays any workflow, ensuring thorough analysis before execution and tracking assumptions, conflicts, and decisions.

#### Configuration

```typescript
interface ProjectManagerConfig {
  enabled: boolean
  questioningDepth: 'minimal' | 'standard' | 'thorough'
  autoUseExpertCouncil: boolean
  expertCouncilThreshold: number // 0-100: when to escalate
  qualityGateThreshold: number // 0-100: required quality score
  requireAssumptionValidation: boolean
  enableConflictDetection: boolean
  enableUserProfiling: boolean
}
```

#### Tracked Concepts

| Concept          | Types                                                                | Tracked Fields                                                                         |
| ---------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Requirements** | functional, non-functional, constraint, goal                         | priority (must/should/nice), source (user-stated/inferred/clarified), confidence (0-1) |
| **Assumptions**  | technical, business, user, timeline, resource                        | validated flag, extracted at turn N                                                    |
| **Conflicts**    | contradictory-requirements, impossible-constraint, priority-conflict | severity (low-critical), resolution tracking                                           |
| **Decisions**    | Question + selected option                                           | rationale, decided at turn + timestamp                                                 |
| **User Profile** | expertise level, detail preferences                                  | interaction patterns for adaptive responses                                            |

#### Integration with Workflows

When `projectManagerConfig.enabled = true`:

1. Before each agent step, the PM reviews the current state
2. PM extracts requirements and assumptions from conversation
3. PM flags conflicts between requirements
4. If confidence is below `qualityGateThreshold`, PM requests clarification
5. If complexity exceeds `expertCouncilThreshold`, PM escalates to Expert Council
6. PM tracks all decisions with rationale

The PM chat is visible in the RunCard as a collapsible section showing the conversation, extracted requirements, and tracked assumptions.

---

### 5.6 Evaluation & Telemetry

#### Purpose

Detailed execution tracing for debugging, quality assessment, and cost analysis of agent runs.

#### Run Telemetry

```typescript
interface RunTelemetry {
  telemetryId: string
  runId: RunId
  workflowId: WorkflowId
  workflowType: WorkflowType
  startedAtMs: number
  completedAtMs?: number
  totalDurationMs?: number
  totalTokensUsed: number
  totalEstimatedCost: number
  stepCount: number
  steps: Array<{
    stepIndex: number
    agentId?: string
    agentName?: string
    nodeId?: string
    durationMs?: number
    tokensUsed?: number
    estimatedCost?: number
    provider?: string
    model?: string
    toolCalls?: Array<{
      toolId: string
      toolName: string
      success: boolean
      latencyMs?: number
      retryCount: number
    }>
    status: 'success' | 'failed' | 'skipped'
  }>
  status: RunStatus
}
```

#### LLM Judge (`evaluation/llmJudge.ts`)

Automated quality evaluation of agent outputs:

- Configurable evaluation criteria (relevance, accuracy, completeness, coherence)
- Uses a separate LLM call to score outputs
- Results stored alongside run telemetry

#### Trace Viewer UI

The `TraceViewer` component provides a visual timeline of:

- Step-by-step execution with durations
- Token usage and cost per step
- Tool call timeline with parameters and results
- Error display with categories
- Export as JSON for external analysis

The `useRunTrace()` hook loads telemetry data:

```typescript
function useRunTrace(options: { runId: RunId | null; includeComponentTelemetry?: boolean }): {
  telemetry: RunTelemetry | null
  steps: TraceStep[]
  loading: boolean
  exportTrace: () => string // JSON export
}
```

#### Labeling Interface

The `LabelingInterface` component enables human evaluation:

- Rating scale (1-5) for response quality
- Helpful/not helpful toggle
- Free-text comment
- Feedback stored on `ExpertCouncilTurn.userFeedback`
- Used for fine-tuning decisions and model selection

---

## 6. Infrastructure & Shared Services

### Firebase Configuration

**Hosting:** Single-page app served from `apps/web-vite/dist`

**Cloud Functions:** Node.js 22 runtime, 5-minute HTTP timeout, 256MB default memory (1GB for run executor)

**Deployment:** A `prepare-deploy.sh` script vendors workspace packages (`@lifeos/agents`, `@lifeos/calendar`, `@lifeos/core`, `@lifeos/training`) into `functions/vendor/`, rewrites `workspace:*` dependencies to `file:` paths, and runs `npm install` for Firebase-compatible flat `node_modules`. All workspace packages require a `"default"` condition in their `package.json` exports map for compatibility with Firebase CLI's CJS-based code analysis.

**Firestore Security Rules:**

- User-centric authorization: `isAuthenticated(userId)` validates ownership
- User subcollections (`/users/{userId}/*`): client read/write
- Server-only writes for: `workflowSteps`, `recurrenceInstanceMap`, `compositeRuns`, `mailboxMessages`, `mailboxSyncs`
- System collections (`/systemInterventions/*`): read-only for authenticated users

**Emulator support:** Auth (9099), Firestore (8080), Functions (5001), Storage (9199) for local development.

### Firebase Initialization

```typescript
// Hybrid config approach:
// 1. Try fetching config from Cloud Function (production)
// 2. Fall back to environment variables (local dev)
// 3. Cache in localStorage for offline availability

const app = initializeApp(config)
const db = initializeFirestore(app, {
  localCache: persistentMultipleTabManager(), // Multi-tab support
})
```

### Authentication

- **Google OAuth** with calendar scopes (for Google Calendar integration)
- **Email/password** authentication
- **ID token verification** for Cloud Functions (Bearer token)

### Channel Connection Management

The Settings page provides a unified `ChannelConnectionsPanel` showing all 5 messaging channels as expandable cards:

| Channel      | Status                          | Configuration                                                             |
| ------------ | ------------------------------- | ------------------------------------------------------------------------- |
| **Gmail**    | Connected via Calendar Settings | Managed through `CalendarSettingsPanel` (shared OAuth tokens)             |
| **Slack**    | Full configuration              | Renders existing `SlackAppSettingsPanel` + `SlackConnectionsPanel` inline |
| **LinkedIn** | Coming Soon                     | Disabled card with badge                                                  |
| **WhatsApp** | Coming Soon                     | Disabled card with badge                                                  |
| **Telegram** | Coming Soon                     | Disabled card with badge                                                  |

Each card shows: channel icon (color-coded), name, connection summary, status indicator, and expand/collapse toggle. Keyboard accessible with `Enter`/`Space` toggle and `aria-expanded` state.

### Outbox Pattern (Eventual Consistency)

Used for calendar writes and other operations requiring server-side processing:

```
1. User action → save locally + enqueue operation
2. Worker processes outbox when online
3. Calls Cloud Functions for server-side work (e.g., Google Calendar writeback)
4. Marks operation as applied/failed
5. Notifies UI of status changes
```

### Rate Limiting & Quotas

```typescript
// Per-user controls
checkRunRateLimit(userId) // Max runs per minute
checkQuota(userId) // Total cost budget
updateQuota(userId, cost) // Deduct after run
shouldSendQuotaAlert(userId) // Alert when approaching limit
```

### Error Handling Strategy

All errors are categorized for appropriate handling:

| Category     | Behavior                              |
| ------------ | ------------------------------------- |
| `network`    | Retry with exponential backoff        |
| `auth`       | Prompt user to re-authenticate        |
| `rate_limit` | Backoff, show cooldown timer          |
| `validation` | Show user-friendly input error        |
| `timeout`    | May retry or escalate                 |
| `quota`      | Show usage limit message              |
| `internal`   | Log for debugging, show generic error |

### Structured Logging

All Cloud Functions use a structured logging system built on `firebase-functions/logger`:

```typescript
// functions/src/lib/logger.ts
import { createLogger } from '../lib/logger.js'
const log = createLogger('ServiceName')

log.info('Operation completed', { userId, durationMs })
log.error('Operation failed', error, { context })
```

- **Namespaced:** Every log entry is automatically prefixed with `[ServiceName]` for easy filtering in Cloud Logging
- **Structured data:** All contextual data passed as key-value objects (not string interpolation) for queryability
- **Severity levels:** `debug`, `info`, `warn`, `error` -- mapped to Firebase/Cloud Logging severity
- **ESLint enforced:** `no-console: warn` rule ensures no raw `console.*` calls in production code

### CI Pipeline

GitHub Actions workflow with three blocking gates:

```
lint → typecheck → test → deploy (requires all three)
```

- **lint:** ESLint 9 flat config with `@typescript-eslint/no-explicit-any: error` in production code (warn in tests)
- **typecheck:** Strict TypeScript across all packages
- **test:** All Vitest suites must pass (no `|| true` bypass)
- **deploy:** Only runs after lint + typecheck + test pass

### Design System

- **Fonts:** Satoshi (primary), JetBrains Mono (code)
- **Theming:** CSS custom properties (`tokens.css`) for light/dark modes
- **Toast notifications:** Sonner library
- **Icons:** Custom SVG icons with domain-specific designs

### Key Dependencies

**Frontend:**
| Package | Purpose |
|---------|---------|
| `@tiptap/*` | Rich text editor (notes) |
| `@xyflow/react` | Workflow graph visualization |
| `react-window` | Virtual list rendering |
| `@dnd-kit/*` | Drag and drop |
| `@radix-ui/react-select` | Accessible select components |
| `date-fns` | Date utilities |
| `katex` | LaTeX math rendering |
| `marked` | Markdown parsing |
| `pdfjs-dist` | PDF parsing for import |
| `html2pdf.js` | PDF export |
| `sonner` | Toast notifications |
| `zod` | Runtime validation |
| `idb` | IndexedDB wrapper |
| `react-hotkeys-hook` | Keyboard shortcuts |

**Backend:**
| Package | Purpose |
|---------|---------|
| `@anthropic-ai/sdk` | Claude API |
| `openai` | OpenAI API |
| `@google/generative-ai` | Gemini API |
| `@langchain/core` + `@langchain/langgraph` | Agent orchestration framework |
| `googleapis` | Google Drive, Gmail, Calendar APIs |
| `firebase-admin` | Server-side Firebase |
| `expr-eval` | Safe math expression evaluation (sandboxed, no eval()) |

---

## Appendix: Firestore Collection Map

```
users/{userId}/
  ├── notes/{noteId}
  ├── topics/{topicId}
  ├── sections/{sectionId}
  ├── attachments/{attachmentId}
  ├── projects/{projectId}
  ├── chapters/{chapterId}
  ├── tasks/{taskId}
  ├── habits/{habitId}
  ├── habitCheckins/{checkinId}
  ├── calendarEvents/{eventId}
  ├── calendars/{calendarId}
  ├── calendarAccounts/{accountId}
  ├── calendarSyncState/{stateId}
  ├── agents/{agentId}
  ├── agentTemplates/{templateId}
  ├── workflows/{workflowId}
  │   └── runs/{runId}
  │       └── events/{eventId}
  ├── tools/{toolId}
  ├── promptLibrary/{promptId}
  ├── deepResearchRequests/{requestId}
  ├── workoutPlans/{planId}
  ├── workoutSessions/{sessionId}
  ├── exerciseLibrary/{exerciseId}
  ├── workoutTemplates/{templateId}
  ├── checkIns/{checkInId}
  ├── interventionPresets/{presetId}
  ├── interventionSessions/{sessionId}
  ├── mailboxMessages/{messageId}
  ├── mailboxSyncs/{syncId}
  ├── mailboxDrafts/{draftId}
  ├── mailbox/settings
  ├── settings/mailboxAITools
  ├── channelConnections/{connectionId}
  ├── senderPersonas/{personaId}
  ├── slackConnections/{connectionId}
  ├── integrations/slack
  └── telemetry/
      ├── runs/{telemetryId}
      └── components/{componentId}

systemInterventions/{interventionId}   (read-only)
```
