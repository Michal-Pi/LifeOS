\# PRD: Habits \+ Mind Engine (LifeOS Integration)  
Version: 0.1  
Owner: You  
Target: Add the next “Habits \+ Mind” section to LifeOS using existing Calendar/Todos/Today/Weekly Review foundations.

\---

\#\# 1\) Context & Objective

LifeOS already has:  
\- Production-ready \*\*Calendar\*\* (canonical model, recurrence, alerts, Google sync, offline-first/outbox)  
\- Production-ready \*\*Todos\*\* (projects/chapters/tasks, calendar integration)  
\- \*\*Today view\*\* and \*\*Weekly Review\*\*  
\- A planned \*\*Notes/Learning\*\* system (not yet implemented)

We want to incorporate:  
\- Habit formation (Tiny/Atomic/Duhigg patterns)  
\- Values \+ identity-based change  
\- Journaling \+ reflection loops  
\- Mindfulness \+ CBT/ACT \+ Gestalt-inspired “work calm” interventions  
\- Anti-catastrophising tools  
…without creating a separate “habit app” silo. The correct integration is to make Habits/Mind \*\*first-class domain packages\*\* that:  
\- Project into \*\*Today\*\*  
\- Optionally schedule as \*\*Calendar blocks\*\*  
\- Generate \*\*Todos\*\* as follow-ups  
\- Create structured “journal entries” now, and later can be unified into Notes once Notes ships

\---

\#\# 2\) Goals (What success looks like)

\#\#\# Primary goals  
1\. A user can define 2–4 habits with “tiny” versions and anchors, and \*\*check in daily\*\*.  
2\. The Today view provides a \*\*morning setup\*\*, \*\*work-mode intervention button\*\*, and \*\*evening reflection\*\* in \< 5 minutes.  
3\. When stressed at work, user can tap “I’m activated” and complete an evidence-based micro-intervention in \*\*\< 60 seconds\*\*.  
4\. Weekly Review shows habit consistency \+ anxiety spikes and suggests 1–2 \*\*system adjustments\*\* (simplify, change anchor, add friction-removal task).  
5\. Everything works \*\*offline-first\*\* with outbox sync (consistent with existing architecture).

\#\#\# Non-goals (Phase 1\)  
\- Full Notes integration (TipTap, topics/sections) — journaling will be stored as structured entries separately.  
\- ML personalization — use deterministic rules first.  
\- Social/community features.  
\- Therapist-grade clinical claims. This is productivity \+ self-regulation tooling.

\---

\#\# 3\) Personas / Use cases

\#\#\# Persona A: “Busy operator”  
\- Wants sleep, exercise, meditation to become automatic.  
\- Needs friction removal, calendar time-blocking, gentle tracking.

\#\#\# Persona B: “Work anxious leader”  
\- Suffers catastrophising, rumination, ambiguity anxiety before/after meetings.  
\- Needs quick, private interventions \+ actionable next steps (todos).

\---

\#\# 4\) Product Principles

1\. \*\*No shame states\*\*: never show “FAIL”.  
2\. \*\*Minimum viable habit always counts\*\* (Done / Tiny / Skip).  
3\. \*\*Physiology first\*\* when activated (breath resets before cognition).  
4\. \*\*Patterns over perfection\*\*: weekly trends \> daily noise.  
5\. \*\*Contextual\*\*: interventions triggered from Today \+ Calendar alerts.

\---

\#\# 5\) Scope: Features & Requirements

\#\#\# 5.1 Habits (Phase 1\)  
\- Create/edit habits with:  
 \- Name, domain (sleep/exercise/meditation/alcohol/work-calm/etc.)  
 \- Anchor (habit stacking): \`afterEvent\` / \`timeWindow\`  
 \- Tiny version definition (2-minute / minimum)  
 \- Standard version definition  
 \- Schedule (days of week; optional)  
 \- Safety net: “recovery allowed” and “tiny counts”  
 \- Optional “calendar projection”: create internal calendar blocks  
\- Daily check-in:  
 \- Status: \`done | tiny | skip\`  
 \- Optional mood before/after (simple scale)  
 \- Optional note (short)  
\- Habit streak display with guardrails:  
 \- Show consistency, not purity  
 \- Tiny preserves streak (configurable)

\#\#\# 5.2 Mind Engine (Phase 1\)  
\- “I’m activated” button (global, also on Today)  
\- Intervention types:  
 \- \*\*Physiology\*\*: physiological sigh; box breathing  
 \- \*\*CBT\*\*: label distortion \+ most-likely outcome \+ next action  
 \- \*\*ACT\*\*: “I’m noticing I’m having the thought that…” \+ values action  
 \- \*\*Gestalt-ish\*\*: “What’s true right now?” \+ name the “Alarmist voice”  
\- Each intervention ends with either:  
 \- “Return to day” OR  
 \- “Create next action” → Todo

\#\#\# 5.3 Journaling \+ Incantations (Phase 1\)  
\- Journaling entry types:  
 \- Evening “close the loops” template:  
 \- 1–3 prompts (structured)  
 \- cognitive offload: unresolved → convert to todo  
 \- Quick “after intervention” note (optional)  
\- Incantations:  
 \- Stored scripts linked to habits/domains  
 \- Types:  
 \- Identity \+ action (“I’m someone who shows up imperfectly.”)  
 \- Values-based (“I protect sleep because freedom/health.”)  
 \- Self-compassion (“This is hard; one action still counts.”)  
 \- Shown in Morning module (Today)

\#\#\# 5.4 Integrations (Phase 1\)  
\- Today page:  
 \- Morning: identity \+ keystone habit \+ if–then plan  
 \- Midday: optional reset  
 \- Work Mode: “I’m activated”  
 \- Evening: check-ins \+ journal \+ park items as todos  
\- Weekly Review:  
 \- Trend summary (habit consistency \+ intervention count)  
 \- “What worked / what broke?” quick taps  
 \- Recommendations:  
 \- shrink habit  
 \- change anchor  
 \- add friction removal todo  
 \- schedule a calendar block

\---

\#\# 6\) UX: Screen / Flow Spec

\#\#\# 6.1 New/Updated Screens  
1\. \*\*TodayPage\*\* (updated)  
 \- Sections:  
 \- Morning Setup  
 \- Today’s Keystone Habit  
 \- Work Mode (I’m activated)  
 \- Evening Close-Out  
2\. \*\*HabitsPage\*\* (new)  
 \- list habits \+ consistency  
3\. \*\*HabitDetail\*\* (new)  
 \- edit recipe; view trends; toggle calendar projection  
4\. \*\*MindPanel / Modal\*\* (new)  
 \- launched from Today \+ quick access  
5\. \*\*WeeklyReview\*\* (updated)  
 \- new “Habits & Mind” step

\#\#\# 6.2 “I’m Activated” flow (critical)  
\- Step 1: choose feeling (optional quick chips): anxious / angry / overwhelmed / avoiding  
\- Step 2: choose intervention type (default physiology)  
\- Step 3: complete \<60 seconds  
\- Step 4: optional: “convert to next action” → Todo  
\- Step 5: log intervention session for trends

\---

\#\# 7\) Domain Architecture (Monorepo / DDD)

\#\#\# 7.1 New packages  
\- \`packages/habits\`  
\- \`packages/mind\`

Each package includes:  
\- \`src/domain/\*\` models \+ validation  
\- \`src/ports/\*\` repository interfaces (ports & adapters)  
\- \`src/usecases/\*\` business logic  
\- \`src/index.ts\` exports

\#\#\# 7.2 Web app additions  
\- Hooks in \`apps/web-vite/src/hooks/\`  
 \- \`useHabits.ts\`  
 \- \`useHabitCheckins.ts\`  
 \- \`useMindInterventions.ts\`  
 \- \`useJournalEntries.ts\`  
\- Adapters in \`apps/web-vite/src/adapters/\`  
 \- Firestore adapters  
 \- IndexedDB adapters  
\- Components in \`apps/web-vite/src/components/\`  
 \- \`habits/\*\`  
 \- \`mind/\*\`

\#\#\# 7.3 Cloud Functions  
Not required in Phase 1 unless you decide to:  
\- sync habit-generated calendar blocks to Google Calendar (defer)  
Phase 1 should create internal canonical events that do NOT sync to Google by default.

\---

\#\# 8\) Data Model Spec (TypeScript \+ Firestore)

\> Naming convention: \`/users/{uid}/...\`

\#\#\# 8.1 Habits  
Collection: \`/habits/{habitId}\`

\*\*Habit\*\*  
\- \`id: string\`  
\- \`createdAt: number\`  
\- \`updatedAt: number\`  
\- \`title: string\`  
\- \`domain: "sleep" | "exercise" | "meditation" | "alcohol" | "work_calm" | "custom"\`  
\- \`status: "active" | "paused" | "archived"\`  
\- \`anchor: { type: "after_event"; event: "wake_up"|"brush_teeth"|"lunch"|"work_end"|"custom"; customLabel?: string } | { type: "time_window"; start: "HH:mm"; end: "HH:mm" }\`  
\- \`tinyVersion: { label: string; minutes?: number }\`  
\- \`standardVersion: { label: string; minutes?: number }\`  
\- \`schedule: { daysOfWeek: number\[\] }\` // 0-6  
\- \`safetyNet: { tinyCounts: boolean; recoveryAllowed: boolean }\`  
\- \`calendarProjection?: { enabled: boolean; blockMinutes: number; timeHint?: "morning"|"midday"|"evening"; sourceTag: "habit_block" }\`  
\- \`linkedIncantationIds?: string\[\]\`  
\- \`linkedInterventionPresetId?: string\` // optional

\#\#\# 8.2 Habit check-ins  
Collection: \`/habitCheckins/{checkinId}\`

\*\*HabitCheckin\*\*  
\- \`id: string\`  
\- \`habitId: string\`  
\- \`dateKey: string\` // "YYYY-MM-DD" in user tz  
\- \`status: "done"|"tiny"|"skip"\`  
\- \`moodBefore?: number\` // 1-5  
\- \`moodAfter?: number\` // 1-5  
\- \`note?: string\`  
\- \`createdAt: number\`

Indexes:  
\- \`(habitId, dateKey)\`  
\- \`(dateKey)\` for day aggregation

\#\#\# 8.3 Incantations  
Collection: \`/incantations/{incantationId}\`

\*\*Incantation\*\*  
\- \`id: string\`  
\- \`type: "identity_action"|"values"|"self_compassion"\`  
\- \`text: string\`  
\- \`domains?: Habit\["domain"\]\[\]\`  
\- \`active: boolean\`  
\- \`createdAt: number\`

\#\#\# 8.4 Mind interventions  
Collection: \`/mindInterventions/{interventionId}\` (library/presets)

\*\*MindInterventionPreset\*\*  
\- \`id: string\`  
\- \`type: "phys_sigh"|"box_breath"|"cbt_label"|"cbt_best_worst_likely"|"act_defusion"|"gestalt_now"\`  
\- \`title: string\`  
\- \`steps: Array\<{ kind: "text"|"timer"|"choice"; payload: any }\>\`  
\- \`defaultDurationSec?: number\`  
\- \`tags?: string\[\]\`

\#\#\# 8.5 Intervention sessions (logs)  
Collection: \`/interventionSessions/{sessionId}\`

\*\*InterventionSession\*\*  
\- \`id: string\`  
\- \`dateKey: string\`  
\- \`presetId: string\`  
\- \`trigger: "manual"|"calendar_alert"|"today"\`  
\- \`feeling?: "anxious"|"overwhelmed"|"angry"|"avoidant"\`  
\- \`createdTodoId?: string\`  
\- \`createdAt: number\`  
\- \`durationSec?: number\`

\#\#\# 8.6 Journal entries (structured)  
Collection: \`/journalEntries/{entryId}\`

\*\*JournalEntry\*\*  
\- \`id: string\`  
\- \`dateKey: string\`  
\- \`type: "morning"|"evening"|"post_intervention"|"weekly_review"\`  
\- \`prompts: Array\<{ key: string; question: string; answer: string }\>\`  
\- \`linkedHabitIds?: string\[\]\`  
\- \`linkedSessionId?: string\`  
\- \`createdAt: number\`

\---

\#\# 9\) Calendar Projection Design (Phase 1\)

\#\#\# Goal  
Allow habits to appear as time blocks in LifeOS Calendar without polluting Google sync.

\#\#\# Approach  
\- Add a new event \`source\` marker in \`CanonicalCalendarEvent\` metadata:  
 \- \`source.provider \= "lifeos"\`  
 \- \`source.type \= "habit_projection"\`  
 \- \`source.habitId \= ...\`  
\- These events live in the same local storage / Firestore calendar collections, but must be excluded from Google sync writeback unless user explicitly opts in later.

\#\#\# Rules  
\- If \`habit.calendarProjection.enabled \=== true\`:  
 \- Generate/update a recurring internal event:  
 \- Title: \`Habit: \<title\>\`  
 \- Duration: \`blockMinutes\`  
 \- Time: inferred from \`timeHint\` or \`anchor\`  
\- If habit paused/archived: remove/disable projection event.

\---

\#\# 10\) Todo Integration Rules (Phase 1\)

\#\#\# When to create todos  
\- From “I’m activated” flow → user chooses “Create next action”  
\- From Evening journaling → “Park this as next action”  
\- From Weekly Review recommendations → “Add friction removal todo”

Todo fields:  
\- Title is concise (one action)  
\- Default priority: medium  
\- Optional due date: next business day if created in work context; otherwise none  
\- Optional link metadata:  
 \- \`meta.source \= "mind"\`  
 \- \`meta.sessionId\` or \`meta.journalEntryId\`

\---

\#\# 11\) Offline-first & Sync Requirements

\- All new collections must support:  
 \- IndexedDB caching (idb)  
 \- Outbox queue for offline writes (reuse sync-kit/outbox)  
\- Hooks should read from IndexedDB first, then reconcile Firestore updates  
\- Conflict policy:  
 \- Last-write-wins at document level is acceptable for Phase 1  
 \- Check-ins keyed by \`(habitId, dateKey)\` should be upserted deterministically

\---

\#\# 12\) Security Rules & Indexes

\#\#\# Firestore rules  
\- Mirror existing pattern:  
 \- Only authenticated user can read/write in \`/users/{uid}/...\`  
\- Add rules for:  
 \- habits  
 \- habitCheckins  
 \- incantations  
 \- mindInterventions (if user-specific library; if global, store elsewhere)  
 \- interventionSessions  
 \- journalEntries

\#\#\# Indexes  
\- habitCheckins: compound index on habitId \+ dateKey  
\- interventionSessions: dateKey  
\- journalEntries: dateKey \+ type

\---

\#\# 13\) Development Plan (Step-by-step tasks for agents)

\#\#\# Chapter A — Domain packages scaffolding  
1\. Create \`packages/habits\`  
 \- Domain models \+ validation:  
 \- habit recipe validity  
 \- schedule day validation  
 \- status enums  
 \- Ports:  
 \- \`HabitsRepository\`  
 \- \`HabitCheckinsRepository\`  
 \- Usecases:  
 \- \`createHabit\`  
 \- \`updateHabit\`  
 \- \`listHabits\`  
 \- \`upsertCheckin(habitId, dateKey, status, ...)\`  
 \- \`getHabitsForDate(dateKey)\` (for Today)  
2\. Create \`packages/mind\`  
 \- Models:  
 \- \`Incantation\`, \`MindInterventionPreset\`, \`InterventionSession\`, \`JournalEntry\`  
 \- Ports:  
 \- \`IncantationsRepository\`  
 \- \`MindInterventionsRepository\`  
 \- \`InterventionSessionsRepository\`  
 \- \`JournalRepository\`  
 \- Usecases:  
 \- \`listActiveIncantationsByDomain\`  
 \- \`startInterventionSession\`  
 \- \`completeInterventionSession\`  
 \- \`createJournalEntry\`

Acceptance criteria:  
\- Typecheck passes across monorepo  
\- Unit tests for key validation rules (mirroring existing calendar/todo rule tests)

\---

\#\#\# Chapter B — Adapters (Firestore \+ IndexedDB \+ outbox)  
1\. Implement adapters under \`apps/web-vite/src/adapters/\`  
 \- Firestore: CRUD for each collection  
 \- IndexedDB: local cache tables  
 \- Outbox operations for creates/updates  
2\. Ensure repository interfaces match the ports in packages

Acceptance criteria:  
\- Works offline: create habit \+ check-in without network, then sync  
\- No data loss on refresh

\---

\#\#\# Chapter C — Hooks \+ minimal UI  
1\. Hooks:  
 \- \`useHabits()\` (list/create/update/pause)  
 \- \`useHabitCheckins(dateKey)\` (day view)  
 \- \`useMindInterventions()\` (presets \+ start/complete)  
 \- \`useJournalEntries(dateKey)\`  
2\. UI:  
 \- Add \`HabitsPage\` (basic list \+ add)  
 \- Add \`HabitDetail\` (edit recipe)  
 \- Add \`MindModal\` (I’m activated)

Acceptance criteria:  
\- User can add 2 habits and log check-ins for today  
\- “I’m activated” runs at least two presets (phys sigh, CBT label)

\---

\#\#\# Chapter D — Today integration (core flow)  
1\. Update \`TodayPage.tsx\`:  
 \- Morning module:  
 \- show incantation  
 \- choose keystone habit (simple selection)  
 \- set 1 if–then plan (stored as journal entry prompt)  
 \- Work module:  
 \- “I’m activated” button opens MindModal  
 \- Evening module:  
 \- habit check-ins list  
 \- mood before/after (optional)  
 \- “unresolved → todo” prompt  
 \- creates \`JournalEntry(type="evening")\`

Acceptance criteria:  
\- Daily loop is usable end-to-end in \< 5 minutes  
\- Evening module can create a Todo via journaling

\---

\#\#\# Chapter E — Weekly Review integration (system tuning)  
1\. Extend Weekly Review:  
 \- Show weekly consistency per habit  
 \- Show count of intervention sessions  
2\. Add “Adjustments” step:  
 \- If missed twice → suggest shrink standard version or switch anchor  
 \- Offer friction removal todo  
 \- Offer calendar projection enablement

Acceptance criteria:  
\- Weekly Review produces at least 1 actionable adjustment and optionally creates a todo

\---

\#\#\# Chapter F — Calendar projection (internal-only)  
1\. Implement habit → recurring internal \`CanonicalCalendarEvent\` generator  
2\. Ensure Google sync ignores these events (Phase 1\)  
3\. Optional: attach calendar alerts to trigger “I’m activated” entry point (Phase 2\)

Acceptance criteria:  
\- Enabling projection adds visible calendar blocks in LifeOS calendar  
\- No Google writeback occurs for habit projections

\---

\#\# 14\) Testing Plan

\#\#\# Unit tests (packages)  
\- Habits validation:  
 \- schedule days valid  
 \- anchors valid  
 \- safety net flags  
\- Check-in upsert rules (idempotent)  
\- Mind presets step runner validation

\#\#\# Integration tests (web)  
\- Offline create habit → reload → still present → sync later  
\- Today flow:  
 \- check-in writes correct documents  
 \- journaling creates todo  
\- Calendar projection:  
 \- enabling projection creates recurring event instance

\#\#\# UI tests  
\- Mind modal completes session in \<60 sec flow  
\- Weekly review renders trends

\---

\#\# 15\) Instrumentation (Optional but recommended)  
Add lightweight event logging (local \+ optional later analytics):  
\- \`habit_created\`  
\- \`habit_checkin_done/tiny/skip\`  
\- \`intervention_started/completed\`  
\- \`journal_entry_created\`  
\- \`weekly_review_adjustment_applied\`

\---

\#\# 16\) Future Extensions (Not Phase 1\)  
\- Notes unification: journalEntries become a structured note type  
\- Calendar-triggered interventions (pre-meeting “calm protocol”)  
\- Smart pattern detection (misses correlate with hunger/late work/meetings)  
\- Opt-in Google Calendar writeback for habit blocks  
\- “Work Calm” meeting tags and post-meeting decompression automations

\---

\#\# 17\) Definition of Done (Phase 1\)  
\- Habits \+ Mind packages implemented with ports/usecases  
\- Firestore \+ IndexedDB \+ outbox support for all new models  
\- Today integrates morning/work/evening loop  
\- Weekly review integrates trends \+ adjustments  
\- Basic habit calendar projection works internally  
\- Tests \+ typecheck \+ lint pass in turbo pipeline

\# PRD Addendum: Exercise Planner \+ Daily Workout Logging (LifeOS)  
Version: 0.1 (Add-on to Habits \+ Mind PRD)  
Scope: Add an Exercise “Plan \+ Log” capability integrated into Today, Calendar, Todos, and Weekly Review.

\---

\#\# 1\) Objective

Add a structured exercise system where the user can:  
1\. Define a weekly/daily workout plan with \*\*three variants per day\*\*:  
 \- \*\*Gym\*\*  
 \- \*\*Home\*\*  
 \- \*\*On the road\*\*  
2\. Select which variant they did (or mix), and \*\*log actual performance\*\*:  
 \- exercises performed  
 \- sets (series), reps, weight, time, distance, RPE, etc.  
3\. View trends and consistency in Today \+ Weekly Review.  
4\. Keep it offline-first and consistent with LifeOS architecture.

Non-goals (Phase 1):  
\- Social sharing  
\- AI program generation  
\- Wearable integrations (can come later)

\---

\#\# 2\) Product Principles

\- Logging must be \*\*fast\*\* (one screen, minimal taps).  
\- Plan is a \*\*template\*\*; log is the \*\*truth\*\*.  
\- Support “good enough” logging:  
 \- quick completion (no sets) is acceptable  
 \- progressive detail if desired

\---

\#\# 3\) Core Concepts & Data Model

We introduce a new domain package:  
\- \`packages/training\`

\#\#\# Entities  
1\. \*\*ExerciseLibraryItem\*\*: catalog item (bench press, push-up)  
2\. \*\*WorkoutTemplate\*\*: a planned workout for a day & context (Gym/Home/Road)  
3\. \*\*WorkoutPlan\*\*: weekly schedule mapping date/day-of-week \-\> templates  
4\. \*\*WorkoutSession\*\*: what the user actually did on a date (log)  
5\. \*\*ExercisePerformance\*\*: per exercise in a session (sets/reps/weight/etc.)

\---

\#\# 4\) Firestore Collections (per-user)

All under \`/users/{uid}/...\`

\#\#\# 4.1 Exercise library  
\`/exerciseLibrary/{exerciseId}\`

\*\*ExerciseLibraryItem\*\*  
\- \`id: string\`  
\- \`name: string\` // "Bench Press"  
\- \`category?: "push"|"pull"|"legs"|"core"|"conditioning"|"mobility"|"other"\`  
\- \`equipment?: string\[\]\` // \["barbell","bench"\]  
\- \`defaultMetrics: Array\<"sets_reps_weight"|"time"|"distance"|"reps_only"|"rpe"\>\`  
\- \`createdAt: number\`  
\- \`updatedAt: number\`  
\- \`archived?: boolean\`

Note: start with user-specific library (simple). Later: global seed library.

\---

\#\#\# 4.2 Workout templates (planned workouts)  
\`/workoutTemplates/{templateId}\`

\*\*WorkoutTemplate\*\*  
\- \`id: string\`  
\- \`title: string\` // "Day 1 – Upper"  
\- \`context: "gym"|"home"|"road"\`  
\- \`items: WorkoutTemplateItem\[\]\`  
\- \`createdAt: number\`  
\- \`updatedAt: number\`

\*\*WorkoutTemplateItem\*\*  
\- \`exerciseId: string\`  
\- \`displayName?: string\` // optional override  
\- \`target:\`  
 \- \`{ type: "sets_reps"; sets: number; reps: number | { min:number; max:number }; weightKg?: number }\`  
 \- \`{ type: "time"; seconds: number }\`  
 \- \`{ type: "distance"; meters: number }\`  
 \- \`{ type: "reps"; reps: number }\`  
 \- \`{ type: "rpe"; rpe: number }\`  
\- \`notes?: string\`

\---

\#\#\# 4.3 Workout plan (schedule mapping)  
\`/workoutPlans/{planId}\`

\*\*WorkoutPlan\*\*  
\- \`id: string\`  
\- \`active: boolean\`  
\- \`timezone: string\`  
\- \`startDateKey: string\` // YYYY-MM-DD  
\- \`schedule: Array\<WorkoutDaySchedule\>\` // 7 entries typical  
\- \`createdAt: number\`  
\- \`updatedAt: number\`

\*\*WorkoutDaySchedule\*\*  
\- \`dayOfWeek: number\` // 0-6  
\- \`variants: { gymTemplateId?: string; homeTemplateId?: string; roadTemplateId?: string }\`  
\- \`defaultContext?: "gym"|"home"|"road"\` // optional  
\- \`restDay?: boolean\`

\---

\#\#\# 4.4 Workout sessions (actual logs)  
\`/workoutSessions/{sessionId}\`

\*\*WorkoutSession\*\*  
\- \`id: string\`  
\- \`dateKey: string\` // YYYY-MM-DD  
\- \`context: "gym"|"home"|"road"\`  
\- \`templateId?: string\` // if started from a template  
\- \`title?: string\` // optional  
\- \`status: "planned"|"in_progress"|"completed"|"skipped"\`  
\- \`startedAt?: number\`  
\- \`completedAt?: number\`  
\- \`durationSec?: number\`  
\- \`notes?: string\`  
\- \`items: ExercisePerformance\[\]\`  
\- \`createdAt: number\`  
\- \`updatedAt: number\`

\*\*ExercisePerformance\*\*  
\- \`exerciseId: string\`  
\- \`displayName?: string\`  
\- \`sets?: SetPerformance\[\]\`  
\- \`metrics?: { timeSec?: number; distanceM?: number; reps?: number; rpe?: number }\`  
\- \`notes?: string\`

\*\*SetPerformance\*\*  
\- \`setIndex: number\`  
\- \`reps?: number\`  
\- \`weightKg?: number\`  
\- \`rpe?: number\`  
\- \`isWarmup?: boolean\`

Indexes:  
\- \`(dateKey)\`  
\- \`(dateKey, context)\`

\---

\#\# 5\) UX / Flows

\#\#\# 5.1 Today integration (primary entry point)  
Add a “Training” module to Today:

\*\*Training Module UI\*\*  
\- Shows today’s planned variants:  
 \- Gym / Home / Road (three cards)  
\- Each card shows quick summary:  
 \- e.g., “Bench \+ Row \+ Press (6 items)”  
\- CTA buttons:  
 \- “Start Gym”  
 \- “Start Home”  
 \- “Start Road”  
\- If session already exists:  
 \- shows status and “Continue” / “Complete”

\#\#\# 5.2 Start workout (template \-\> session)  
\- User taps “Start Gym”  
\- App creates \`WorkoutSession\` with:  
 \- \`dateKey \= today\`  
 \- \`context \= gym\`  
 \- \`templateId\` from plan schedule for the day  
 \- pre-populated \`items\` from template (no sets filled yet)  
\- Session screen:  
 \- list exercises  
 \- each exercise expands to set rows  
 \- quick add set  
 \- quick duplicate last set (for speed)  
 \- complete session

\#\#\# 5.3 Logging format requirement (your example)  
Support entry like:  
\- Bench press → 5 sets × 8 reps × 50 kg

This implies:  
\- \`sets \= \[{reps:8, weightKg:50}, ... x5\]\`

Provide a “bulk input” shortcut:  
\- One-line entry parser (Phase 2\) OR  
\- Fast UI controls (Phase 1):  
 \- “Sets: 5” stepper  
 \- “Reps: 8”  
 \- “Weight: 50kg”  
 \- auto-generates sets 1..5 with same reps/weight  
 \- allow editing individual sets after

\#\#\# 5.4 Ad-hoc exercise logging (no template)  
\- “Quick log workout” button (Today)  
\- Choose context  
\- Add exercises from library  
\- Log sets/reps/weight  
\- Complete

\---

\#\# 6\) Relationship to Habits engine

Option A (recommended):  
\- Exercise is a \*\*habit domain\*\* and also has a \*\*training subsystem\*\*.  
\- Habit check-in for exercise can be auto-derived:  
 \- If a \`WorkoutSession.status \=== completed\` for today → mark Exercise habit as \`done\`.

Rules:  
\- If user completes workout session, auto-upsert corresponding habit checkin.  
\- If user marks exercise habit done manually, do NOT create a workout session automatically (avoid surprises).

\---

\#\# 7\) Calendar \+ Todo integration

\#\#\# Calendar  
\- If user enables workout time-blocking:  
 \- Create internal recurring calendar event “Workout (Gym/Home/Road)” based on plan schedule.  
 \- Clicking the event opens Today with “Start workout”.

\#\#\# Todos  
\- Optional post-session follow-ups:  
 \- “Mobility 10 min”  
 \- “Buy resistance bands”  
 \- “Book physio”  
Created manually from workout session screen (no auto spam).

\---

\#\# 8\) Weekly Review integration

Add a “Training” section:  
\- Sessions completed / planned  
\- Total training minutes  
\- Volume estimate (optional Phase 2): total sets or tonnage  
\- “Consistency” per context (gym/home/road)  
\- Suggestions:  
 \- If travel week: promote road templates  
 \- If missed twice: simplify template (fewer exercises)

\---

\#\# 9\) Offline-first \+ Sync

\- Workout sessions must be fully usable offline:  
 \- create session  
 \- log sets  
 \- complete  
\- Use outbox to sync Firestore writes.

Conflict policy:  
\- Last write wins per document.  
\- Prefer session-level updates with \`updatedAt\` to avoid partial merges.

\---

\#\# 10\) Dev Plan (Agent Tasks)

\#\#\# Chapter T1 — Training domain package  
1\. Create \`packages/training\`  
2\. Domain models \+ validation:  
 \- template item target shapes  
 \- session item shapes  
3\. Ports:  
 \- \`ExerciseLibraryRepository\`  
 \- \`WorkoutTemplatesRepository\`  
 \- \`WorkoutPlansRepository\`  
 \- \`WorkoutSessionsRepository\`  
4\. Usecases:  
 \- \`createExerciseLibraryItem\`  
 \- \`createWorkoutTemplate\`  
 \- \`createOrUpdateWorkoutPlan\`  
 \- \`getWorkoutVariantsForDate(dateKey)\`  
 \- \`startWorkoutSessionFromTemplate(dateKey, context, templateId)\`  
 \- \`upsertWorkoutSession\`  
 \- \`completeWorkoutSession(sessionId)\`

Acceptance:  
\- Unit tests for target schema validation and session generation

\#\#\# Chapter T2 — Adapters \+ Hooks  
1\. Firestore adapters for new collections  
2\. IndexedDB caches \+ outbox  
3\. Hooks:  
 \- \`useTrainingToday(dateKey)\` (returns the three variants \+ session state)  
 \- \`useWorkoutSession(sessionId)\`  
 \- \`useExerciseLibrary()\`

Acceptance:  
\- Offline: start and complete workout session with sets, then sync

\#\#\# Chapter T3 — UI  
1\. Today Training module:  
 \- show three variant cards  
 \- start/continue buttons  
2\. Workout Session screen:  
 \- exercise list  
 \- set logging UI  
 \- “duplicate last set”  
 \- “bulk set creator” (sets/reps/weight \-\> generate)  
3\. Templates editor (basic):  
 \- create/edit templates and plan schedule

Acceptance:  
\- User can plan day variants and log: bench press 5x8x50kg

\#\#\# Chapter T4 — Integration with Habits \+ Weekly Review  
1\. Auto-upsert exercise habit check-in on completed session  
2\. Weekly Review training summary  
3\. Optional: calendar projection of workouts (internal-only)

Acceptance:  
\- Completing workout updates exercise habit consistency

\---

\#\# 11\) Future Enhancements (Phase 2+)  
\- One-line logging parser:  
 \- "benchpress x 5 x 8 x 50kg" \-\> sets  
\- Rest timers  
\- PR tracking  
\- Volume/tonnage analytics  
\- Program progression (progressive overload rules)  
\- Imports from common workout apps

\---

\#\# 12\) Definition of Done (Exercise Feature)  
\- User can define weekly workout plan with gym/home/road variants per day  
\- User can start a session from Today and log sets/reps/weight quickly  
\- Sessions work offline and sync reliably  
\- Weekly Review shows training consistency and completed sessions
