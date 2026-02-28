# LifeOS Comprehensive Redesign Plan

> Generated from full analysis of 20 UI screenshots, 79 CSS files, 40+ pages/components, and complete codebase audit.

---

## TASK 1: Design System Consolidation & Visual Consistency

### Problem Statement

The app has a solid token foundation (`tokens.css`) but inconsistent application across 79+ CSS files. Border radii range from 2px to 32px for similar elements, 20+ font sizes exist without a clear scale, spacing alternates between CSS variables and raw values, and dark mode has gaps. There are no reusable UI primitives (Modal, Card, FormField), leading to duplicated patterns across every modal and page.

---

### 1.1 Rationalize the Design Token Scale

**What to do:** Audit and tighten the token system in `tokens.css` so every value has exactly one semantic purpose.

#### 1.1.1 Typography Scale (reduce 20+ sizes to 8)

- **AC:** Define exactly 8 type tokens: `--text-xs` (0.75rem), `--text-sm` (0.8125rem), `--text-base` (0.875rem), `--text-md` (1rem), `--text-lg` (1.125rem), `--text-xl` (1.25rem), `--text-2xl` (1.5rem), `--text-3xl` (2rem).
- **AC:** Define 3 weight tokens: `--font-regular` (400), `--font-medium` (500), `--font-bold` (700).
- **AC:** Create semantic aliases: `--text-body` = `--text-base`, `--text-heading` = `--text-xl`, `--text-page-title` = `--text-2xl`, `--text-caption` = `--text-xs`, `--text-label` = `--text-sm`.
- **AC:** Find-and-replace all raw font-size values (0.55rem, 0.625rem, 0.65rem, 0.7rem, 0.85rem, 0.9rem, 0.9375rem, 1.05rem, 1.1rem, 1.2rem, 1.75rem, 1.8rem, 2.5rem, 15px, 32px) to their nearest token alias across all 79 CSS files.
- **AC:** Every page title, section heading, body text, label, and caption uses only the 8 defined tokens.

#### 1.1.2 Spacing Scale (enforce token usage)

- **AC:** The existing `--space-1` through `--space-8` scale is good. Add `--space-0` (0) and `--space-10` (64px), `--space-12` (80px) for page-level margins.
- **AC:** Grep all CSS files for raw padding/margin/gap values (e.g., `0.35rem`, `0.4rem`, `0.625rem`, `1.25rem`, `2rem`) and replace each with its nearest `--space-*` token.
- **AC:** Zero raw px/rem spacing values remain in any component CSS file except where truly dynamic (e.g., calculated positions).

#### 1.1.3 Border Radius Scale (reduce to 4 values)

- **AC:** Define: `--radius-sm` (6px), `--radius-md` (10px), `--radius-lg` (16px), `--radius-full` (999px).
- **AC:** Update `--radius-lg` from current 8px (same as md) to 16px so there's an actual progression.
- **AC:** Replace all hardcoded radius values: 2px->sm, 4px->sm, 8px->md, 10px->md, 12px->lg, 1.25rem->lg, 1.5rem->lg, 2rem->lg.
- **AC:** Cards, modals, and panels all use `--radius-lg`. Buttons and inputs use `--radius-md`. Badges and small chips use `--radius-full`. No raw radius values remain.

#### 1.1.4 Shadow Scale (standardize to 3 levels)

- **AC:** Define: `--shadow-sm` (0 1px 3px rgba(...)), `--shadow-md` (0 4px 12px rgba(...)), `--shadow-lg` (0 10px 24px rgba(...)).
- **AC:** Map: inputs/buttons -> `--shadow-sm` on focus, cards/panels -> `--shadow-md`, modals/overlays -> `--shadow-lg`.
- **AC:** Remove all one-off `box-shadow` declarations and replace with tokens.
- **AC:** Dark mode overrides for all 3 shadow levels defined.

#### 1.1.5 Add Missing Color Variables

- **AC:** Define these currently-referenced-but-undefined variables: `--border-light`, `--border-dark`, `--accent-light`, `--accent-lighter`, `--accent-darker`, `--destructive-light`, `--destructive-foreground`, `--success-subtle`, `--error-subtle`, `--warning-subtle`.
- **AC:** Both light and dark mode values defined for each.
- **AC:** Zero `undefined variable` warnings when building.

---

### 1.2 Complete Dark Mode Coverage

#### 1.2.1 Eliminate Hardcoded Colors

- **AC:** Grep all `.css` and `.tsx` files for hardcoded color values (`#fff`, `#000`, `white`, `black`, `rgb(`, `hsl(`, hardcoded hex like `#94a3b8`).
- **AC:** Replace every hardcoded color with its semantic CSS variable equivalent.
- **AC:** Specifically fix: `background: white` in `AgentCard.css` prompt preview, hardcoded SVG stroke `#94a3b8` in graph components, any inline `style={{ color: '#...' }}` patterns.
- **AC:** The only remaining hardcoded colors are inside SVG asset files and dynamic colors that must be computed at runtime (e.g., user-selected project colors).

#### 1.2.2 Dark Mode Contrast Audit

- **AC:** Test every page in dark mode. Document and fix all cases where text contrast falls below WCAG AA (4.5:1 for body text, 3:1 for large text).
- **AC:** Specifically verify: muted text (`--muted-foreground`) against dark backgrounds, badge text against badge backgrounds, placeholder text contrast, disabled state visibility.
- **AC:** `--panel-sheen` in dark mode should be a subtle dark gradient (not `none`) to maintain visual depth.

#### 1.2.3 Dark Mode for All Components

- **AC:** Verify dark mode renders correctly for every component: all modals (TaskFormModal, ContactFormModal, AgentBuilderModal, WorkflowFormModal, ExerciseFormModal, PlanFormModal, etc.), all cards (AgentCard, RunCard, ContactCard), all dropdowns, the TipTap editor, DateTimePicker, ColorPicker, knowledge graph visualization, calendar views, workout plan tables.
- **AC:** No component has a white flash, unreadable text, or invisible borders in dark mode.

---

### 1.3 Build Reusable UI Primitives

#### 1.3.1 `<Modal>` Component

- **AC:** Create `components/ui/Modal.tsx` that encapsulates: overlay with backdrop, content container with max-width prop (sm=480px, md=640px, lg=800px, xl=1024px), header slot (title + optional subtitle + close button), scrollable body slot, sticky footer/actions slot, escape key and outside-click close, focus trap, entry/exit animations.
- **AC:** Refactor at least 3 existing modals (TaskFormModal, ContactFormModal, ExerciseFormModal) to use this component, proving it works.
- **AC:** All other modals refactored in subsequent passes.

#### 1.3.2 `<Card>` Component

- **AC:** Create `components/ui/Card.tsx` with: base card styling (background, border, radius, shadow, sheen), optional header slot, body slot, optional footer slot, hover variant (border-color transition), `compact` and `default` size variants, `interactive` prop for clickable cards.
- **AC:** Refactor AgentCard, RunCard, ContactCard, and workflow cards to use `<Card>` as base.

#### 1.3.3 `<FormField>` Component

- **AC:** Create `components/ui/FormField.tsx` with: label, required indicator, input/select/textarea/custom child slot, error message display, helper text, disabled state styling.
- **AC:** Create `components/ui/Input.tsx` wrapping `<input>` with consistent styling.
- **AC:** Create `components/ui/Textarea.tsx` wrapping `<textarea>`.
- **AC:** Refactor TaskFormModal and ContactFormModal forms to use `<FormField>`.

#### 1.3.4 `<Tabs>` Component

- **AC:** Create `components/ui/Tabs.tsx` with: tab list with underline indicator, tab panels with lazy rendering, keyboard navigation (arrow keys), ARIA tablist/tab/tabpanel roles, controlled and uncontrolled modes.
- **AC:** Replace the planner page's raw tab buttons with `<Tabs>`.
- **AC:** Replace agents page section switching with `<Tabs>`.

#### 1.3.5 `<Badge>` Component

- **AC:** Create `components/ui/Badge.tsx` with variants: `default`, `success`, `warning`, `error`, `info`, `outline`, plus domain-specific variants (work, projects, life, learning, wellbeing).
- **AC:** Replace all inline badge styling across contact circles, task priorities, agent roles, workflow statuses.

#### 1.3.6 `<EmptyState>` Component

- **AC:** Create `components/ui/EmptyState.tsx` with: icon/illustration slot, title, description, optional CTA button, optional keyboard shortcut hint.
- **AC:** Use consistently across: Notes (no note selected), People (no contact selected), Planner (no tasks), Mailbox (no message selected), Calendar (no events).
- **AC:** All empty states follow the same visual pattern.

#### 1.3.7 `<PageHeader>` Component

- **AC:** Create `components/ui/PageHeader.tsx` with: page title, optional subtitle/description, optional action buttons (right-aligned), optional breadcrumb.
- **AC:** Every page uses `<PageHeader>` for its top section, ensuring consistent spacing and alignment.

#### 1.3.8 `<DropdownMenu>` Component

- **AC:** Create `components/ui/DropdownMenu.tsx` (wrapping Radix) with: trigger button, menu items with icons, separators, keyboard navigation, consistent animation.
- **AC:** Replace custom dropdown implementations in AIToolsDropdown, WorkoutAIToolsDropdown, and overflow menus.

---

### 1.4 Visual Consistency Pass (Per-Page)

#### 1.4.1 Today Page

- **AC:** All cards use `<Card>` component with consistent `--radius-lg` and `--shadow-md`.
- **AC:** Section titles use `--text-label` style (uppercase, `--text-xs`, `letter-spacing: 0.1em`, `--muted-foreground` color).
- **AC:** All stat numbers use `--font-mono` family for tabular alignment.
- **AC:** Consistent `--space-5` (24px) gap between all sections.
- **AC:** Check-in card, priority card, calendar preview, mailbox widget, momentum card, follow-up widget, and metrics bar all have identical card styling.

#### 1.4.2 Mailbox Page

- **AC:** Message list items have consistent padding (`--space-3` vertical, `--space-4` horizontal).
- **AC:** Channel badges use `<Badge>` component.
- **AC:** Selected message has clear highlight (accent border-left or background).
- **AC:** Empty detail pane uses `<EmptyState>`.
- **AC:** Composer uses same input/textarea styling as rest of app.

#### 1.4.3 Calendar Page

- **AC:** Calendar grid cells have consistent sizing and `--radius-md`.
- **AC:** Event chips inside calendar cells use `<Badge>` variant.
- **AC:** Sidebar event detail card uses `<Card>`.
- **AC:** View toggle (Day/Week/Month/Agenda) uses `<Tabs>` or `<SegmentedControl>`.
- **AC:** All time displays use `--font-mono`.

#### 1.4.4 People Page

- **AC:** Contact list items have consistent 48px row height.
- **AC:** Circle filter uses `<SegmentedControl>` or `<Tabs>`.
- **AC:** Contact avatar circles are 36px with `--radius-full`.
- **AC:** Circle badges use domain colors from `<Badge>`.
- **AC:** Detail panel uses `<Card>` sections for profile, interactions, follow-ups.

#### 1.4.5 Planner Page

- **AC:** Project list sidebar uses consistent item height and hover states.
- **AC:** Task cards use `<Card compact>` with domain color left border.
- **AC:** Priority badges use `<Badge>` with defined priority colors.
- **AC:** Quick-add input matches global input styling.
- **AC:** Tab bar at top uses `<Tabs>` component.
- **AC:** Stats row uses `--font-mono` for numbers, consistent card sizing.

#### 1.4.6 Notes Page

- **AC:** Sidebar note list items have consistent padding and hover states.
- **AC:** Selected note has clear accent indicator (left border or background).
- **AC:** "Unassigned" section header matches `--text-label` style.
- **AC:** `+ New Note` button matches global `primary-button` exactly.
- **AC:** Editor toolbar uses consistent icon sizing (20px) and spacing.

#### 1.4.7 Note Graph Page

- **AC:** Sidebar filter controls use `<FormField>` and `<Select>`.
- **AC:** Graph nodes have consistent styling (same radius, font, padding).
- **AC:** Edge legend colors match CSS variable names.
- **AC:** Stats section uses `--font-mono` for numbers.

#### 1.4.8 Workflows Page

- **AC:** Workflow cards use `<Card>` with consistent sizing.
- **AC:** "Create Workflow" link and button match primary style.
- **AC:** Agent count badges use `<Badge>`.
- **AC:** Action buttons (View Details, Edit, Save Template, Delete) use `ghost-button` consistently.

#### 1.4.9 Agents Page

- **AC:** Agent cards in grid use `<Card interactive>` with consistent height.
- **AC:** Role badges use `<Badge>` with role-specific colors.
- **AC:** Tool cards use `<Card compact>`.
- **AC:** Template cards match agent card styling.
- **AC:** Filter controls use `<Select>` component.
- **AC:** Section switching uses `<Tabs>`.

#### 1.4.10 Settings Page

- **AC:** Each settings section uses `<Card>` with consistent header.
- **AC:** API key inputs use `<FormField>` with masked display.
- **AC:** Status indicators (connected/disconnected) use `<Badge success/error>`.
- **AC:** Section collapse/expand has consistent arrow icon and animation.
- **AC:** All buttons (Connect, Disconnect, Save) use proper button variants.

#### 1.4.11 Training Pages (Exercise Library, Workout Plan, Today)

- **AC:** Exercise table uses consistent row height, padding, and alternating row colors.
- **AC:** Category badges use `<Badge>`.
- **AC:** Workout day cards use `<Card>` with day header.
- **AC:** Duration badges use `--font-mono` and consistent pill styling.
- **AC:** "Edit Plan" modal uses `<Modal lg>` with `<FormField>` for all inputs.

#### 1.4.12 Prompt Library Page

- **AC:** Prompt cards use `<Card>` with consistent height (or min-height with truncation).
- **AC:** Category chips use `<Badge>`.
- **AC:** Grid layout uses consistent gap (`--space-4`).
- **AC:** Card hover state matches global interactive card pattern.

#### 1.4.13 Model Settings Page

- **AC:** Provider cards use `<Card>` with provider icon header.
- **AC:** Enable/disable toggles match global switch styling.
- **AC:** Model selector uses `<Select>` component.
- **AC:** Pricing display uses `--font-mono`.

---

### 1.5 Responsive & Accessibility Polish

#### 1.5.1 Responsive Breakpoints

- **AC:** Define 3 breakpoints in tokens: `--breakpoint-sm` (640px), `--breakpoint-md` (768px), `--breakpoint-lg` (1024px).
- **AC:** Every page gracefully collapses: 3-col -> 2-col -> 1-col at appropriate breakpoints.
- **AC:** Modals go full-screen on `< 640px`.
- **AC:** Navigation collapses to hamburger on `< 768px`.
- **AC:** All touch targets are minimum 44px.

#### 1.5.2 Focus States

- **AC:** Every interactive element (button, link, input, select, card) has a visible `:focus-visible` ring using `outline: 2px solid var(--accent); outline-offset: 2px`.
- **AC:** No focus state uses `outline: none` without a replacement.
- **AC:** Tab order is logical on every page.

#### 1.5.3 Motion & Animation

- **AC:** All animations respect `prefers-reduced-motion: reduce`.
- **AC:** Modal open/close uses consistent `--motion-standard` timing.
- **AC:** Dropdown open/close uses `--motion-fast` timing.
- **AC:** Hover transitions use `--motion-fast`.
- **AC:** No animation exceeds 300ms.

---

## TASK 2: UX, Layout & Information Architecture Improvements

### Problem Statement

The app packs a huge amount of functionality but suffers from: (1) pages that scroll endlessly without hierarchy (Settings, Agents, Edit Plan), (2) underutilized screen real estate (Mailbox right pane, People right pane), (3) too many top-level concepts competing for attention on single pages (Planner tabs), (4) inconsistent navigation depth (some features are buried, others prominent), and (5) cognitive overload from dense data presentation without progressive disclosure.

---

### 2.1 Today Page - Command Center Redesign

#### 2.1.1 Reduce Vertical Scroll with Grid Layout

- **AC:** Restructure Today page into a 2-column dashboard grid (on desktop):
  - Left column (60%): Check-in, Top Priorities, Calendar Preview
  - Right column (40%): Daily State/Quote, Momentum (Habits + Workout), Follow-ups
  - Full-width bottom: Mailbox Widget, Daily Metrics
- **AC:** Each section is a collapsible `<Card>` with a header that shows summary even when collapsed.
- **AC:** The "Daily State" card combines time, quote, and incantation into one compact card (currently spread across multiple).
- **AC:** Page fits above the fold on 1080p without scrolling to see all section headers.

#### 2.1.2 Priority Tasks - Quick Actions

- **AC:** Each priority task has inline quick-actions: complete (checkbox), snooze (defer to tomorrow), and start timer - without opening a modal.
- **AC:** "The Frog" task is visually distinct (larger card, accent border, motivational micro-copy).
- **AC:** Quick-add input is always visible at the bottom of the priorities section.

#### 2.1.3 Calendar Preview - At-a-Glance

- **AC:** Show only next 3-5 events (not the full day list that currently scrolls).
- **AC:** Each event shows: time, title, guest count. One line per event.
- **AC:** "See full calendar" link to `/calendar`.
- **AC:** Current/next event is highlighted with accent left border.

#### 2.1.4 Daily Metrics Bar - Compact

- **AC:** Metrics bar (MTG, FREE, UTIL, Exercise) is a single compact row at the top of the page, not at the bottom.
- **AC:** Each metric is a small pill: icon + value. All on one line.
- **AC:** Clicking a metric navigates to its respective page (calendar, planner, training).

---

### 2.2 Mailbox - Better Use of Space

#### 2.2.1 Smart Detail Pane

- **AC:** When no message is selected, the right pane shows a dashboard: unread count per channel, quick stats (messages today, response rate), and suggested actions ("3 messages need reply").
- **AC:** This replaces the current generic "Select a message to read" empty state.

#### 2.2.2 Thread Grouping

- **AC:** Messages from the same sender/thread are grouped with an expand/collapse toggle.
- **AC:** Each thread group shows: sender, latest message preview, message count, latest timestamp.
- **AC:** Expanded thread shows all messages in chronological order.

#### 2.2.3 Quick Actions on Hover

- **AC:** Hovering a message row reveals quick action icons: archive, mark read/unread, snooze, reply.
- **AC:** These appear on the right side of the row without shifting layout.

---

### 2.3 Calendar - Improved Event Interaction

#### 2.3.1 Event Creation Shortcut

- **AC:** Clicking an empty time slot in day/week view opens a quick-create popover (title + time + save) instead of a full modal.
- **AC:** Full modal available via "More options" link in the popover.

#### 2.3.2 Event Detail Sidebar Enrichment

- **AC:** When an event is selected, the sidebar shows: linked contacts (with avatars), related tasks, previous meetings with same attendees, and AI-generated meeting prep button.
- **AC:** If attendees match CRM contacts, show their circle and last interaction.

#### 2.3.3 View Toggle Improvement

- **AC:** Replace current text-only view toggle with `<SegmentedControl>` showing icons + labels: Day (calendar icon), Week (columns icon), Month (grid icon), Agenda (list icon).
- **AC:** Current view persists across navigation (stored in localStorage).

---

### 2.4 People/CRM - From List to Relationship Hub

#### 2.4.1 Circle Visualization

- **AC:** Above the contact list, add a compact "circle overview" showing 5 concentric rings (Dunbar circles) with contact counts: Core (5), Close (15), Regular (50), Acquaintance (150), Everyone.
- **AC:** Clicking a ring filters the list to that circle.
- **AC:** This replaces the current flat button filter bar.

#### 2.4.2 Contact Detail - Relationship Timeline

- **AC:** The right pane shows a visual timeline of all interactions: calendar events, messages, notes mentions, follow-up actions - in chronological order.
- **AC:** Each timeline entry is one line: date + icon (calendar/message/note) + brief description.
- **AC:** "Next follow-up" prominently shown at the top of the detail pane with a countdown (e.g., "in 3 days").

#### 2.4.3 Quick Add Contact

- **AC:** A floating "+" button or keyboard shortcut (Cmd+Shift+C) opens a minimal contact creation form: name, email, circle. Nothing else.
- **AC:** Full form available via "More details" link.

---

### 2.5 Planner - Focused Task Management

#### 2.5.1 Simplify the Tab Bar

- **AC:** The current Planner tab bar shows: Tasks, Training, Habits, Phases, Life. Reduce to: **Tasks** (primary), **Habits**. Move Training to its own nav section or a sub-route.
- **AC:** Remove "Phases" and "Life" tabs if they duplicate functionality available elsewhere.
- **AC:** The planner should focus on task management. Other concerns live in their dedicated pages.

#### 2.5.2 Task Board View Option

- **AC:** Add a Kanban board view toggle alongside the current list view.
- **AC:** Columns: Inbox, Active, In Progress, Done.
- **AC:** Cards show: title, project color dot, priority badge, due date if within 7 days.
- **AC:** Drag-and-drop between columns updates status.

#### 2.5.3 Priority View Improvement

- **AC:** The priority view groups tasks by urgency band: "Today" (red), "This Week" (orange), "This Month" (blue), "Someday" (gray).
- **AC:** Each band is collapsible with a task count.
- **AC:** Tasks within a band are sorted by priority score (descending).

#### 2.5.4 Project Sidebar Cleanup

- **AC:** Projects in the sidebar show: name, color dot, task count (active/total), progress bar.
- **AC:** Projects are grouped by domain (Work, Personal, etc.) with collapsible sections.
- **AC:** "All Tasks" option at the top shows everything regardless of project.

---

### 2.6 Notes - Better Organization & Discovery

#### 2.6.1 Sidebar Hierarchy

- **AC:** Notes sidebar shows topics/projects as collapsible tree nodes.
- **AC:** Each topic shows: name, note count, last-edited timestamp.
- **AC:** Notes under each topic are sorted by last-edited (most recent first).
- **AC:** "Unassigned" section is at the bottom, not the top.
- **AC:** Pinned notes appear in a separate "Pinned" section at the very top.

#### 2.6.2 Note Preview on Hover

- **AC:** Hovering a note title in the sidebar shows a tooltip/popover with: first 2-3 lines of content, tags, last edited date.
- **AC:** This helps identify notes without clicking through each one.

#### 2.6.3 Note Metadata Bar

- **AC:** Below the note title, show a compact metadata bar: word count, last edited (relative time), linked project badge, tag chips.
- **AC:** This bar is always visible but doesn't take significant space.

---

### 2.7 Workflows & Agents - Reduce Complexity

#### 2.7.1 Agents Page - Tabbed Layout

- **AC:** Currently screenshot 015 shows the agents page as an endless scroll of sections. Restructure into `<Tabs>`: "My Agents" | "Templates" | "Tools".
- **AC:** Each tab is its own focused view, not a section on a mega-page.
- **AC:** "My Agents" shows the agent card grid.
- **AC:** "Templates" shows template cards with a "Create from Template" CTA.
- **AC:** "Tools" shows tool cards with built-in vs. custom distinction.

#### 2.7.2 Workflow Detail - Collapsible Sections

- **AC:** Workflow detail page sections (Configuration, Runs, Project Manager, Research) are collapsible cards.
- **AC:** Only "Runs" is expanded by default.
- **AC:** Each section header shows a summary count (e.g., "Runs (12)", "Research (3 pending)").

#### 2.7.3 Agent Builder Modal - Stepped Wizard

- **AC:** The agent builder is currently a long scrolling form. Refactor into a 3-step wizard:
  1. **Basics**: Name, role, description, model selection
  2. **Tools & Permissions**: Tool checkboxes, parameter overrides
  3. **Review & Create**: Summary of all settings, create button
- **AC:** Step indicator at top shows progress (1/3, 2/3, 3/3).
- **AC:** Back/Next navigation between steps.

---

### 2.8 Settings - Organized Sections

#### 2.8.1 Settings Sidebar Navigation

- **AC:** Replace the current single-column scroll (screenshot 020) with a sidebar + content layout.
- **AC:** Sidebar sections: General, AI Providers, Search Tools, Calendar, Channels, Quotes, System.
- **AC:** Clicking a sidebar item scrolls to / shows that section in the main content area.
- **AC:** On mobile, sidebar becomes a dropdown selector.

#### 2.8.2 API Key UX

- **AC:** API keys show masked value (\*\*\*...abc) with a "Reveal" toggle.
- **AC:** "Test Connection" button next to each key with pass/fail indicator.
- **AC:** Last-tested timestamp shown.
- **AC:** Clear visual grouping: AI Providers (OpenAI, Anthropic, Google, xAI) in one card, Search Tools (Serper, Exa, Firecrawl, Jina) in another.

---

### 2.9 Training - Streamlined Plan Editing

#### 2.9.1 Plan Edit - Tabbed by Day

- **AC:** The "Edit Plan" modal (screenshot 014) currently scrolls through all 7 days in one view. Replace with a tab per day: Sun | Mon | Tue | Wed | Thu | Fri | Sat.
- **AC:** Each tab shows only that day's categories and exercises.
- **AC:** "REST DAY" toggle at the top of each tab.
- **AC:** Modal height is capped at 70vh, no page-length scroll.

#### 2.9.2 Exercise Library - Table with Pagination

- **AC:** The exercise library (screenshot 018) currently shows all exercises in one massive grid. Add pagination (20 per page) or virtual scrolling.
- **AC:** Add column sorting (by name, category, muscle group).
- **AC:** Add a category filter bar above the table.
- **AC:** Search is instant-filter (as-you-type).

---

### 2.10 Prompt Library - Better Browsing

#### 2.10.1 Category Filters

- **AC:** Screenshot 019 shows dozens of prompt cards with no filtering. Add a category filter bar: All, Research, Writing, Analysis, Creative, Custom.
- **AC:** Add a search input that filters by title and description.
- **AC:** Cards show a truncated description (3 lines max) with "Show more" expansion.

#### 2.10.2 Prompt Preview

- **AC:** Clicking a prompt card opens a side panel (not a new page) with the full prompt text, variables, and a "Use in Workflow" button.
- **AC:** This avoids navigating away from the library.

---

### 2.11 Global Navigation Improvements

#### 2.11.1 Navigation Grouping

- **AC:** Group navigation items semantically:
  - **Daily**: Today, Calendar
  - **Organize**: Planner, Notes, People
  - **Communicate**: Mailbox
  - **Automate**: Workflows, Agents
  - **System**: Settings
- **AC:** Use subtle separators or spacing between groups in the top nav.

#### 2.11.2 Global Search Enhancement

- **AC:** Search results are grouped by type: Tasks, Notes, Events, Contacts, Workflows.
- **AC:** Each result shows: type icon, title, relevant metadata (project, date, circle).
- **AC:** Keyboard navigation: arrow keys to select, Enter to open, Escape to close.
- **AC:** Recent searches shown when search is opened with no query.

#### 2.11.3 Keyboard Shortcuts Guide

- **AC:** A "?" keyboard shortcut opens a shortcuts overlay showing all available shortcuts per page.
- **AC:** Each page has its own shortcut context (e.g., Notes: Cmd+N new note, Cmd+K search; Planner: Cmd+T new task).

---

## TASK 3: Feature Enhancements for a True "Second Brain"

### Problem Statement

LifeOS has strong foundations in notes, tasks, calendar, contacts, and AI workflows. To become a genuine "second brain" for managing conversations, storing/searching/retrieving knowledge, calendar management with scheduling links, a powerful CRM, and AI-assisted work, several feature gaps need addressing.

---

### 3.1 Conversations & Communication Hub

#### 3.1.1 AI Message Triage

- **AC:** When new messages arrive, an AI agent automatically categorizes each into: Urgent (needs reply today), Important (needs reply this week), FYI (no reply needed), Automated (newsletters, receipts).
- **AC:** Users can train the classifier by correcting categories.
- **AC:** The mailbox default view shows "Needs Action" messages first, then "FYI".
- **AC:** Acceptance: messages sorted by AI priority, categories shown as badges, user override persists.

#### 3.1.2 AI Draft Replies

- **AC:** Each message has a "Draft Reply" button that generates a contextual response using: message content, sender's CRM profile (circle, recent interactions), user's communication style.
- **AC:** Draft appears in the composer for editing before sending.
- **AC:** Multiple tone options: Professional, Friendly, Brief.
- **AC:** Acceptance: AI-generated draft is contextually relevant, editable, and respects sender relationship.

#### 3.1.3 Action Item Extraction

- **AC:** When reading a message, an AI sidebar panel shows extracted action items: tasks to create, events to schedule, contacts to update, follow-ups to set.
- **AC:** Each extracted item has a one-click "Create" button that pre-fills the respective form (task, event, contact update).
- **AC:** Acceptance: extracted items are accurate, one-click creation works, items link back to source message.

#### 3.1.4 Conversation History Per Contact

- **AC:** On the People/Contact detail page, add a "Conversations" tab showing all messages exchanged with that contact across all channels (Gmail, Slack, etc.).
- **AC:** Messages are chronological with channel icons.
- **AC:** Search within conversation history.
- **AC:** Acceptance: unified view of all communication with a contact, searchable, filterable by channel.

---

### 3.2 Knowledge Management (Notes Enhancement)

#### 3.2.1 Bi-directional Linking

- **AC:** Typing `[[` in the editor triggers a note search popover. Selecting a note inserts a link.
- **AC:** The linked note automatically gains a "backlinks" section showing all notes that reference it.
- **AC:** Backlinks section appears at the bottom of each note, showing: linking note title, the paragraph context containing the link.
- **AC:** Acceptance: `[[` trigger works, links are clickable, backlinks auto-update, backlinks show context.

#### 3.2.2 Daily Notes

- **AC:** A "Daily Note" is auto-created (or prompted) when opening the app each day.
- **AC:** Daily notes have a special template: date header, "What's on my mind", links to today's events, quick capture section.
- **AC:** Daily notes are accessible via the Today page and via a "Daily Notes" section in the Notes sidebar.
- **AC:** Acceptance: daily note auto-creates, template is pre-filled, navigable from Today page.

#### 3.2.3 Web Clipper / Quick Capture

- **AC:** A "Quick Capture" floating button (or keyboard shortcut Cmd+Shift+N) opens a minimal capture modal from any page in the app.
- **AC:** Capture fields: text content, optional URL, optional tags, target note (or "Inbox" default).
- **AC:** Captured items appear in a "Capture Inbox" note or section for later processing.
- **AC:** Acceptance: capture works from any page, items land in inbox, can be processed later.

#### 3.2.4 Note Templates

- **AC:** Users can create and manage note templates (e.g., "Meeting Notes", "Project Brief", "Weekly Review", "Research Note").
- **AC:** When creating a new note, a template picker appears with options.
- **AC:** Templates include: title pattern, section headers, placeholder text, default tags.
- **AC:** Acceptance: template CRUD works, template picker on new note, template content pre-fills.

#### 3.2.5 Semantic Search Across Notes

- **AC:** Search uses AI embeddings to find semantically related content, not just keyword matching.
- **AC:** Results show relevance score and matching context snippet.
- **AC:** "Find similar notes" button on each note returns semantically related notes.
- **AC:** Acceptance: semantic search returns relevant results even without exact keyword match, similar notes feature works.

#### 3.2.6 Note Versioning

- **AC:** Notes automatically save versions every 5 minutes (or on significant change).
- **AC:** A "Version History" panel shows timestamps of versions with diff highlighting.
- **AC:** Users can restore any previous version.
- **AC:** Acceptance: versions are saved, history is browsable, restore works, diff is readable.

---

### 3.3 Calendar & Scheduling

#### 3.3.1 Scheduling Links (Calendly-like)

- **AC:** Users can create "Scheduling Links" that define: available time slots (based on connected calendar), duration options (15, 30, 60 min), buffer between meetings, daily meeting limit.
- **AC:** Each link has a shareable URL (e.g., `/schedule/michal` or via a custom domain).
- **AC:** When someone books via the link, an event is auto-created in the user's Google Calendar with both parties' details.
- **AC:** Acceptance: scheduling link CRUD, public booking page, auto-event creation, conflict detection.

#### 3.3.2 Availability Sharing

- **AC:** A "Share Availability" feature generates a visual availability card for a specific week.
- **AC:** The card can be copied as text (time slots) or shared as an image/link.
- **AC:** Available slots are calculated from calendar gaps, respecting working hours preferences.
- **AC:** Acceptance: availability calculation is correct, export as text/image works, respects preferences.

#### 3.3.3 Smart Scheduling Suggestions

- **AC:** When creating an event with attendees who are CRM contacts, the system suggests optimal times based on: both parties' calendars (if available), historical meeting patterns, user's energy preferences (e.g., creative work in morning, meetings in afternoon).
- **AC:** Suggestions appear as clickable time slot chips.
- **AC:** Acceptance: suggestions are reasonable, based on real calendar data, clickable to set event time.

#### 3.3.4 Recurring Event Intelligence

- **AC:** For recurring meetings, show a "Meeting Stats" panel: attendance rate, average duration, agenda completion.
- **AC:** AI-generated suggestion: "This meeting has been cancelled 3 of the last 5 times. Consider reducing frequency."
- **AC:** Acceptance: stats are accurate, suggestions are contextual, shown on recurring event detail.

---

### 3.4 CRM Enhancements

#### 3.4.1 Contact Pipeline View

- **AC:** For consulting contacts, add a pipeline/kanban view: Lead, Proposal, Active Project, Completed, Follow-up.
- **AC:** Pipeline stages are customizable (user can rename/add/remove stages).
- **AC:** Drag contacts between pipeline stages.
- **AC:** Each contact card in pipeline shows: name, company, last interaction, pipeline value (if applicable).
- **AC:** Acceptance: pipeline view renders, drag-and-drop works, stages are customizable.

#### 3.4.2 Family & Personal CRM Features

- **AC:** Add "Relationship Type" field to contacts: Family, Friend, Colleague, Client, Mentor, Mentee.
- **AC:** Family members can have: birthday tracking (with reminders), gift ideas list, shared events/traditions.
- **AC:** A "Family Dashboard" widget on the Today page shows upcoming birthdays, anniversaries, and family events.
- **AC:** Acceptance: relationship types assignable, birthday reminders fire, family dashboard widget shows data.

#### 3.4.3 Automated Follow-up Workflows

- **AC:** Users can set follow-up rules per contact or per circle: "Follow up every 2 weeks", "Follow up after every meeting within 24h".
- **AC:** When a follow-up is due, a task is auto-created in the Planner and a notification appears on the Today page.
- **AC:** AI generates a suggested follow-up message based on last interaction context.
- **AC:** Acceptance: rules are configurable, tasks auto-create, AI suggestions are contextual.

#### 3.4.4 Interaction Scoring

- **AC:** Each contact has an "Interaction Health" score (0-100) based on: frequency of interactions, recency of last interaction, diversity of interaction types (meeting, message, note mention).
- **AC:** Score decays over time if no interaction.
- **AC:** Low-score contacts in important circles (Core, Close) trigger follow-up suggestions.
- **AC:** Acceptance: score calculated correctly, decay works, suggestions trigger for important contacts.

#### 3.4.5 Contact Notes & Tags

- **AC:** Each contact has a "Notes" section for freeform text (meeting observations, personal preferences, project context).
- **AC:** Notes are timestamped and searchable.
- **AC:** Contacts can be tagged (e.g., "AI Expert", "Investor", "React Developer") for easy filtering.
- **AC:** Tags are searchable across all contacts.
- **AC:** Acceptance: notes CRUD works, tags are assignable and filterable, search works across both.

---

### 3.5 AI Workflows & Automation

#### 3.5.1 Scheduled Workflow Runs

- **AC:** Users can schedule workflows to run on a cron-like schedule: daily, weekly, specific days/times.
- **AC:** Use cases: "Run competitive intel research every Monday", "Summarize this week's notes every Friday".
- **AC:** Scheduled runs appear in a "Scheduled" tab on the workflow detail page.
- **AC:** Run results are automatically linked to a note or pushed as a mailbox message.
- **AC:** Acceptance: schedule CRUD works, workflows execute on schedule, results are stored/linked.

#### 3.5.2 Event-Triggered Workflows

- **AC:** Users can define triggers that automatically start workflows: "When a new contact is added", "When a meeting with a client ends", "When a task is marked complete".
- **AC:** Trigger -> Workflow mapping is configured in the workflow settings.
- **AC:** Trigger history shows: trigger event, workflow started, result status.
- **AC:** Acceptance: trigger CRUD works, events fire workflows, history is logged.

#### 3.5.3 Workflow Output -> Notes Integration

- **AC:** When a workflow completes, its output can be automatically saved as a new note or appended to an existing note.
- **AC:** The note includes: workflow name, run timestamp, full output, linked source data.
- **AC:** Deep Research results specifically create well-formatted research notes with citations.
- **AC:** Acceptance: auto-note creation works, formatting is clean, citations included for research.

#### 3.5.4 Personal AI Assistant (Conversational)

- **AC:** A global "Ask LifeOS" chat interface (floating button or sidebar) allows natural language queries across all data: "What did I discuss with John last week?", "When is my next free afternoon?", "Summarize my notes on Project X".
- **AC:** The assistant has access to: notes, tasks, calendar events, contacts, message history, workflow results.
- **AC:** Results include clickable links to source data.
- **AC:** Acceptance: natural language queries return accurate results, sources are linked, works across all domains.

---

### 3.6 Search & Retrieval

#### 3.6.1 Universal Search with Filters

- **AC:** The global search (Cmd+K) searches across ALL data types: notes, tasks, events, contacts, messages, workflows, prompts.
- **AC:** Results are grouped by type with counts.
- **AC:** Filter chips allow narrowing: type, date range, project, tags.
- **AC:** Recent searches and frequently accessed items shown on empty search state.
- **AC:** Acceptance: all data types searchable, filters work, results are grouped, recent searches displayed.

#### 3.6.2 Saved Searches / Smart Filters

- **AC:** Users can save search queries as "Smart Filters" (e.g., "All tasks due this week in Project X", "All notes tagged #strategy from last month").
- **AC:** Smart filters appear in the sidebar of their respective pages.
- **AC:** Filters update results in real-time as data changes.
- **AC:** Acceptance: save filter works, filters appear in sidebar, results are live.

#### 3.6.3 Cross-Reference Discovery

- **AC:** When viewing any item (note, task, event, contact), a "Related" panel shows items connected to it across domains.
- **AC:** Example: viewing a note shows related tasks (same project), related contacts (mentioned), related events (linked).
- **AC:** Connections are determined by: shared project, shared tags, explicit links, AI-detected relevance.
- **AC:** Acceptance: related panel shows relevant cross-domain connections, clickable links, auto-discovered.

---

### 3.7 Data Export & Portability

#### 3.7.1 Full Data Export

- **AC:** A "Export All Data" button in Settings exports everything: notes (as markdown), tasks (as CSV/JSON), contacts (as vCard), calendar events (as ICS), workflow configurations (as JSON).
- **AC:** Export is a ZIP file with organized folders.
- **AC:** Acceptance: export includes all data types, formats are standard, file structure is logical.

#### 3.7.2 Import from Other Tools

- **AC:** Import capabilities for: Notion (markdown export), Todoist (CSV), Google Contacts (CSV/vCard), Apple Notes (if feasible), Obsidian vault (markdown with backlinks).
- **AC:** Import wizard maps source fields to LifeOS fields.
- **AC:** Acceptance: import works for at least 3 sources, field mapping is correct, data integrity maintained.

---

### 3.8 Habits & Personal Development

#### 3.8.1 Habit Streaks & Insights

- **AC:** Each habit shows: current streak (with fire icon), best streak, completion heatmap (GitHub-style grid for the last 90 days).
- **AC:** Weekly insight: "Your best day for exercise is Tuesday (89% completion)."
- **AC:** Monthly report: trend lines for all habits.
- **AC:** Acceptance: streak tracking is accurate, heatmap renders, insights are data-driven.

#### 3.8.2 Habit + Calendar Integration

- **AC:** Habits with specific time preferences create ghost events on the calendar (subtle, non-blocking).
- **AC:** Completing a habit from the calendar view updates the habit tracker.
- **AC:** Acceptance: ghost events appear, completion sync works bidirectionally.

#### 3.8.3 Weekly Review Enhancement

- **AC:** The weekly review page becomes a guided 5-step wizard: Reflect (what went well, what didn't), Review (tasks/habits metrics), Plan (set next week's priorities), Prepare (upcoming events/follow-ups), Commit (save review as a note).
- **AC:** Each step shows relevant data and prompts.
- **AC:** The completed review is saved as a dated note with a "Weekly Review" template.
- **AC:** Acceptance: wizard flow works, data is pre-populated, note is auto-created.

---

### 3.9 Mobile & PWA Optimization

#### 3.9.1 Mobile-First Quick Actions

- **AC:** On mobile, a floating action button (FAB) provides quick access to: new task, new note, quick capture, new event.
- **AC:** Each quick action opens a minimal creation form optimized for mobile (large touch targets, minimal fields).
- **AC:** Acceptance: FAB appears on mobile, forms are touch-optimized, creation works.

#### 3.9.2 Offline-First Reliability

- **AC:** All pages load and display cached data when offline.
- **AC:** Offline indicator is prominent but not intrusive (top banner: "Offline - changes will sync when connected").
- **AC:** Pending changes counter visible in the indicator.
- **AC:** Acceptance: all pages render offline, indicator shows, sync resumes automatically.

#### 3.9.3 Push Notifications

- **AC:** Browser push notifications for: upcoming calendar events (configurable lead time), task due date reminders, follow-up reminders, workflow completion.
- **AC:** Notification preferences configurable per type in Settings.
- **AC:** Acceptance: notifications fire correctly, preferences respected, clickable to relevant item.

---

## Prioritization Recommendation

### Phase 1 (Foundation) - Do First

| #   | Item                               | Task | Effort | Impact                            |
| --- | ---------------------------------- | ---- | ------ | --------------------------------- |
| 1   | 1.1 Token rationalization          | T1   | M      | High - unblocks all styling work  |
| 2   | 1.2 Dark mode completion           | T1   | M      | High - currently broken in places |
| 3   | 1.3.1-1.3.3 Modal, Card, FormField | T1   | L      | High - eliminates duplication     |
| 4   | 2.8 Settings sidebar layout        | T2   | S      | High - currently unusable scroll  |
| 5   | 2.7.1 Agents tabbed layout         | T2   | S      | High - currently unusable scroll  |

### Phase 2 (UX Quick Wins) - High Impact, Lower Effort

| #   | Item                            | Task | Effort | Impact                     |
| --- | ------------------------------- | ---- | ------ | -------------------------- |
| 6   | 1.4 Per-page visual consistency | T1   | L      | High - polishes entire app |
| 7   | 2.1 Today page grid redesign    | T2   | M      | High - daily landing page  |
| 8   | 2.5 Planner simplification      | T2   | M      | High - core feature        |
| 9   | 2.9 Training plan tabbed edit   | T2   | S      | Med - fixes worst modal UX |
| 10  | 2.11 Global search enhancement  | T2   | M      | High - cross-cutting       |

### Phase 3 (Second Brain Core) - Key Differentiators

| #   | Item                          | Task | Effort | Impact                          |
| --- | ----------------------------- | ---- | ------ | ------------------------------- |
| 11  | 3.2.1 Bi-directional linking  | T3   | M      | Very High - PKM core            |
| 12  | 3.2.2 Daily notes             | T3   | S      | High - daily engagement         |
| 13  | 3.1.1-3.1.3 AI message triage | T3   | L      | High - communication efficiency |
| 14  | 3.4.1 Contact pipeline        | T3   | M      | High - CRM power                |
| 15  | 3.6.1 Universal search        | T3   | L      | Very High - retrieval           |

### Phase 4 (Automation & Intelligence)

| #   | Item                                      | Task | Effort | Impact                         |
| --- | ----------------------------------------- | ---- | ------ | ------------------------------ |
| 16  | 3.3.1 Scheduling links                    | T3   | L      | High - replaces Calendly       |
| 17  | 3.5.1-3.5.2 Scheduled/triggered workflows | T3   | L      | High - automation              |
| 18  | 3.5.4 Personal AI assistant               | T3   | XL     | Very High - key differentiator |
| 19  | 3.2.5 Semantic search                     | T3   | L      | High - knowledge retrieval     |
| 20  | 3.4.3 Automated follow-ups                | T3   | M      | Med - CRM intelligence         |

### Phase 5 (Polish & Growth)

| #   | Item                           | Task | Effort | Impact                     |
| --- | ------------------------------ | ---- | ------ | -------------------------- |
| 21  | 1.5 Responsive & accessibility | T1   | M      | Med - wider device support |
| 22  | 3.8 Habits & weekly review     | T3   | M      | Med - personal development |
| 23  | 3.9 Mobile PWA optimization    | T3   | L      | Med - mobile use cases     |
| 24  | 3.7 Data export/import         | T3   | M      | Med - portability          |
| 25  | 3.2.6 Note versioning          | T3   | M      | Low - safety net           |

**Effort Key:** S = 1-2 days, M = 3-5 days, L = 1-2 weeks, XL = 2-4 weeks
