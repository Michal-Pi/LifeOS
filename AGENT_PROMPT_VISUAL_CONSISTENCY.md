# Agent Prompt: Visual Consistency & Accessibility (PLAN.md 1.4 - 1.5)

## Objective

Implement PLAN.md sections 1.4 (Visual Consistency Pass — Per-Page) and 1.5 (Responsive & Accessibility Polish) for the LifeOS web application. This work DEPENDS on Phase 1.1–1.3 being complete — the design tokens (`--text-*`, `--radius-*`, `--shadow-*`) and UI primitives (`<Card>`, `<Badge>`, `<Tabs>`, `<PageHeader>`, `<EmptyState>`) must already exist in the codebase.

**Root directory:** `/Users/pilawski/Library/CloudStorage/Dropbox/Cursor_Projects/LifeOS_2`
**App directory:** `apps/web-vite/`
**Plan file:** `PLAN.md` — read sections 1.4 and 1.5 in full before starting.
**Prerequisite prompt:** `AGENT_PROMPT_DESIGN_SYSTEM.md` — understand what was created in that phase.

---

## IMPORTANT: How to Approach This Work

This is a **surgical consistency pass**, not a rewrite. For each page:

1. Read the page TSX file and its CSS file(s).
2. Identify every remaining hardcoded `font-size`, `border-radius`, `color`, and `box-shadow` value.
3. Replace each with the correct design token.
4. Migrate card-like containers to use the `<Card>` component OR apply the standard card CSS pattern.
5. Migrate badge/tag patterns to use the `<Badge>` component OR apply the standard badge CSS pattern.
6. Ensure section labels follow the standard pattern.
7. Ensure stat/metric numbers use `--font-mono`.
8. **Run typecheck + lint + build after EVERY page** to catch regressions early.

**Do NOT change layout, functionality, or component structure** unless explicitly stated. Only change styling tokens and component wrappers.

---

## Phase F: Per-Page Visual Consistency (PLAN.md 1.4)

### F1. Today Page

**Files to modify:**

- `apps/web-vite/src/globals.css` — classes starting with `today-*`, `daily-*`, `stats-*`, `section-*`
- `apps/web-vite/src/pages/TodayPage.tsx` — inline styles, component usage

**Token replacements in globals.css:**

1. `.today-label` — `font-size: 0.7rem` → `font-size: var(--text-xs)`. Keep `letter-spacing: 0.2em` and `text-transform: uppercase` (this IS the standard label pattern).
2. `.today-heading` — `font-size: 2.5rem` → `font-size: var(--text-3xl)`.
3. `.today-time` — `font-size: 1.25rem` → `font-size: var(--text-xl)`.
4. `.today-time-zone` — `font-size: 0.8rem` → `font-size: var(--text-sm)`.
5. `.today-card` — `border-radius: 6px` → `border-radius: var(--radius-lg)`. Add `box-shadow: var(--shadow-md)` if not present.
6. `.today-hero` — `border-radius: 2rem` → `border-radius: var(--radius-lg)`.
7. `.today-frog` — `border-radius: 2rem` → `border-radius: var(--radius-lg)`. `padding: 2rem` → `padding: var(--space-5)`.
8. `.today-shell` — `gap: 1.5rem` → `gap: var(--space-5)`.
9. `.section-label` (global) — `font-size: 0.7rem` → `font-size: var(--text-xs)`.
10. `.section-hint` — `font-size: 0.875rem` → `font-size: var(--text-base)`.
11. `.stats-grid strong` — `font-size: 1.8rem` → `font-size: var(--text-3xl)`. Add `font-family: var(--font-mono)`.

**AC:**

- Every `.today-card` uses `var(--radius-lg)` and `var(--shadow-md)`.
- All section titles use the `.section-label` pattern: `var(--text-xs)`, uppercase, `letter-spacing: 0.1em`, `color: var(--muted-foreground)`.
- All stat numbers use `font-family: var(--font-mono)`.
- Consistent `var(--space-5)` gap between sections.
- Check-in, priority, calendar preview, mailbox widget, momentum, follow-up, metrics — all identical card styling.

---

### F2. Mailbox Page

**Files to modify:**

- `apps/web-vite/src/styles/pages/MailboxPage.css`
- `apps/web-vite/src/styles/components/MailboxMessageList.css`
- `apps/web-vite/src/styles/components/MailboxMessageDetail.css`
- `apps/web-vite/src/styles/components/MailboxComposer.css`
- `apps/web-vite/src/styles/components/MessageMailbox.css`

**Token replacements:**

1. `.mailbox-page__title` — `font-size: 1.25rem` → `font-size: var(--text-xl)`.
2. `.mailbox-page__empty-text` — `font-size: 0.9375rem` → `font-size: var(--text-base)`.
3. `.mailbox-page__panel-error-detail` — `font-size: 0.75rem` → `font-size: var(--text-xs)`.
4. All message list items — verify consistent `padding: var(--space-3) var(--space-4)`.
5. Channel badges (`.mailbox-channel-chip`) — channel-specific colors (#ea4335 gmail, #4a154b slack, #0a66c2 linkedin, #25d366 whatsapp, #0088cc telegram) → create CSS variables in tokens.css:
   ```css
   --channel-gmail: #ea4335;
   --channel-slack: #4a154b;
   --channel-linkedin: #0a66c2;
   --channel-whatsapp: #25d366;
   --channel-telegram: #0088cc;
   ```
   Then replace hardcoded hex in MailboxMessageList.css, MessageMailbox.css, and ChannelConnectionsPanel.css.
6. Priority badges (`.mailbox-list__priority`, `.priority-badge`) — verify they use `var(--priority-high-*)`, `var(--priority-medium-*)`, `var(--priority-low-*)` tokens.
7. Selected message — verify clear accent highlight (left border or background tint).
8. Verify the empty detail pane says something useful (not just blank).
9. Composer inputs — verify they match global `.form-group input` styling.

**All hardcoded font-size values in these 5 files** must be replaced with `var(--text-*)` tokens. Grep each file for `font-size:` and map them:

- `0.625rem` → `var(--text-xs)`
- `0.6875rem` → `var(--text-xs)`
- `0.75rem` → `var(--text-xs)`
- `0.8rem` → `var(--text-sm)`
- `0.8125rem` → `var(--text-sm)`
- `0.85rem` → `var(--text-sm)`
- `0.875rem` → `var(--text-base)`
- `0.9rem` → `var(--text-base)`
- `0.9375rem` → `var(--text-base)`
- `1rem` → `var(--text-md)`
- `1.25rem` → `var(--text-xl)`

**All hardcoded border-radius values** → map to `var(--radius-*)`:

- `3px`, `4px`, `5px`, `6px` → `var(--radius-sm)`
- `7px`, `8px`, `10px` → `var(--radius-md)`
- `12px`, `16px`, `1.25rem`, `1.5rem`, `2rem` → `var(--radius-lg)`
- `50%`, `999px`, `9999px`, `100px` → `var(--radius-full)`

**Apply this same font-size + border-radius mapping to EVERY file in every subsequent section (F3–F13). I will not repeat the mapping table — use it universally.**

**AC:**

- Message list items have consistent padding.
- Channel badges use tokenized channel colors.
- Selected message has visible accent highlight.
- Empty detail pane has an `<EmptyState>` or equivalent pattern.
- Composer matches global input styling.

---

### F3. Calendar Page

**Files to modify:**

- `apps/web-vite/src/pages/CalendarPage.tsx` — inline styles in JSX
- `apps/web-vite/src/globals.css` — classes starting with `calendar-*`

**Token replacements:**

1. `.calendar-meta` — hardcoded `font-size: 0.85rem` → `var(--text-sm)`.
2. Calendar grid cells — verify consistent sizing and `border-radius: var(--radius-md)`.
3. Event chips inside calendar — verify they use badge-like styling.
4. Sidebar event detail — verify it uses card-like styling (`var(--card)`, `var(--border)`, `var(--radius-lg)`).
5. View toggle (Day/Week/Month/Agenda) — verify uses `<SegmentedControl>` or consistent button group.
6. All time displays — add `font-family: var(--font-mono)` where not present.
7. Stats displays (meeting hours, free time) — ensure `font-family: var(--font-mono)` on numeric values.

**AC:**

- Calendar cells use `var(--radius-md)`.
- Event chips use badge styling.
- Sidebar detail card uses standard card pattern.
- View toggle is visually consistent with rest of app.
- Times use monospace font.

---

### F4. People Page

**Files to modify:**

- `apps/web-vite/src/styles/pages/PeoplePage.css`
- `apps/web-vite/src/styles/components/ContactCard.css`
- `apps/web-vite/src/styles/components/ContactDetail.css`
- `apps/web-vite/src/styles/components/ContactFormModal.css`

**Token replacements:**

1. `.people-page__title` — `font-size: 1.25rem` → `var(--text-xl)`.
2. `.people-page__search` — `padding: 6px 12px` → `padding: var(--space-1) var(--space-3)`.
3. `.people-page__add-btn` — `color: white` → `color: var(--accent-foreground)`.
4. `.people-page__empty-icon` — `font-size: 2.5rem` → `font-size: var(--text-3xl)`.
5. ContactCard circle badge colors — hardcoded hex (#f0e6ff, #7c3aed, #dbeafe, #2563eb, #d1fae5, #059669, #fef3c7, #b45309) → create CSS variables in tokens.css:
   ```css
   /* Circle badge colors - Dunbar layers */
   --circle-0-bg: #f0e6ff;
   --circle-0-text: #7c3aed;
   --circle-1-bg: #dbeafe;
   --circle-1-text: #2563eb;
   --circle-2-bg: #d1fae5;
   --circle-2-text: #059669;
   --circle-3-bg: #fef3c7;
   --circle-3-text: #b45309;
   ```
   And dark mode equivalents:
   ```css
   --circle-0-bg: rgba(124, 58, 237, 0.2);
   --circle-0-text: #a78bfa;
   --circle-1-bg: rgba(37, 99, 235, 0.2);
   --circle-1-text: #93c5fd;
   --circle-2-bg: rgba(5, 150, 105, 0.2);
   --circle-2-text: #6ee7b7;
   --circle-3-bg: rgba(180, 83, 9, 0.2);
   --circle-3-text: #fcd34d;
   ```
6. ContactCard follow-up dot colors (`.contact-card__followup-dot`) — `#f59e0b`, `#3b82f6` → use `var(--warning)`, `var(--info)`.
7. ContactDetail follow-up status colors — same pattern.
8. Contact list items — verify consistent 48px row height.
9. Contact avatar circles — verify 36px with `var(--radius-full)`.
10. Detail panel — verify uses card-like sections.

**AC:**

- Contact list items have consistent 48px row height.
- Circle filter uses consistent button group pattern.
- Avatars are 36px with `var(--radius-full)`.
- Circle badges use tokenized colors.
- Detail panel has card sections for profile, interactions, follow-ups.

---

### F5. Planner Page

**Files to modify:**

- `apps/web-vite/src/pages/PlannerPage.tsx`
- `apps/web-vite/src/globals.css` — classes starting with `planner-*`, `task-*`, `project-*`
- `apps/web-vite/src/components/TaskList.css`

**Token replacements:**

1. `.page-container` padding — `2rem 1.5rem` → `var(--space-6) var(--space-5)`.
2. `.planner-stats strong` — add `font-family: var(--font-mono)`.
3. Task cards — verify they use card-like styling with domain color left border.
4. Priority badges — verify they use `var(--priority-*-bg)`, `var(--priority-*-text)`, `var(--priority-*-border)`.
5. Quick-add input — verify matches global `.form-group input`.
6. Tab bar at top — if using raw buttons, migrate to `<Tabs>` component or apply consistent tab styling.
7. Stats row numbers — `font-family: var(--font-mono)`.
8. Project list sidebar — verify consistent item height and hover states.

**AC:**

- Project sidebar items have consistent height and hover.
- Task cards have domain color left border.
- Priority badges use token colors.
- Quick-add input matches global styling.
- Tab bar uses `<Tabs>` or equivalent consistent pattern.
- Stat numbers use monospace.

---

### F6. Notes Page

**Files to modify:**

- `apps/web-vite/src/pages/NotesPage.tsx` — **CRITICAL: extract inline `<style>` block to a proper CSS file**
- Create `apps/web-vite/src/styles/pages/NotesPage.css` (or add to globals)

**Step 1: Extract inline styles.** The NotesPage.tsx has an inline `<style>` block (lines ~459–705). Extract ALL of these styles into a new `NotesPage.css` file and import it at the top of the TSX file. Do NOT leave any inline `<style>` blocks.

**Token replacements (in the extracted CSS):**

1. `.editor-header` — `padding: 2rem 3rem` → `padding: var(--space-6) var(--space-7)`.
2. `.editor-wrapper` — `padding: 2rem 3rem` → `padding: var(--space-6) var(--space-7)`.
3. `.editor-linker-panel` — `border-radius: 12px` → `border-radius: var(--radius-lg)`.
4. `.placeholder-content` — `padding: 4rem 2rem` → `padding: var(--space-8) var(--space-6)`.
5. `.placeholder-icon` — `font-size: 4rem` → `font-size: var(--text-3xl)` (or keep at 4rem since it's an icon, not text — use judgment).
6. `.placeholder-content h2` — `font-size: 1.5rem` → `font-size: var(--text-2xl)`.
7. `.notes-header-button` — `padding: 0.45rem 0.85rem` → `padding: var(--space-2) var(--space-3)`.
8. `.notes-header-export .export-button` — `min-height: 32px` → `min-height: 40px` (standard touch target).
9. `.editor-overflow-menu` — `border-radius: 10px` → `border-radius: var(--radius-md)`.
10. `.editor-overflow-item` — `font-size: 0.8rem` → `font-size: var(--text-sm)`.

**Component-level fixes:** 11. Sidebar note list items — verify consistent padding and hover states. 12. Selected note — verify clear accent indicator (left border or background tint). 13. "Unassigned" section header — verify matches `.section-label` style. 14. `+ New Note` button — verify matches `primary-button` class exactly. 15. Editor toolbar — verify consistent icon sizing (~20px) and spacing.

**AC:**

- No inline `<style>` block in NotesPage.tsx.
- All values use design tokens.
- Sidebar items have consistent hover and selection states.
- Section headers match `.section-label` pattern.
- `+ New Note` button is standard primary button.

---

### F7. Note Graph Page

**Files to modify:**

- `apps/web-vite/src/pages/NoteGraphPage.tsx` — **extract inline `<style>` block to CSS file**
- Create `apps/web-vite/src/styles/pages/NoteGraphPage.css`

**Step 1: Extract inline styles** (lines ~231–353 of NoteGraphPage.tsx).

**Token replacements:**

1. `.note-graph-page__header` — `padding: 1.5rem 2rem` → `padding: var(--space-4) var(--space-6)`.
2. `.note-graph-page__header h1` — `font-size: 1.5rem` → `font-size: var(--text-2xl)`.
3. `.note-graph-page__back-button` — `padding: 0.5rem 1rem` → `padding: var(--space-2) var(--space-4)`. `font-size: 0.875rem` → `font-size: var(--text-base)`.
4. `.note-graph-page__sidebar` — `padding: 1.5rem` → `padding: var(--space-4)`.
5. `.note-graph-page__filters h3` — `font-size: 0.875rem` → `font-size: var(--text-base)`.
6. `.note-graph-page__filter-select` — `padding: 0.5rem` → `padding: var(--space-2)`. `border-radius: 6px` → `border-radius: var(--radius-sm)`.
7. `.note-graph-page__legend` — `margin-top: 1.5rem; padding-top: 1.5rem` → `margin-top: var(--space-5); padding-top: var(--space-5)`.
8. Graph nodes — verify consistent styling.
9. Edge legend colors — verify they reference CSS variables.
10. Stats section — add `font-family: var(--font-mono)` to numeric values.

**AC:**

- No inline `<style>` block in NoteGraphPage.tsx.
- Sidebar filters use `<Select>` or standard form styling.
- Graph node styling is consistent.
- Stats use monospace font.

---

### F8. Workflows Page

**Files to modify:**

- Workflow page TSX (find it: search for "WorkflowsPage" or similar)
- `apps/web-vite/src/components/agents/WorkflowBlueprint.css`

**Token replacements in WorkflowBlueprint.css:**

1. `.workflow-blueprint` — `border-radius: 12px` → `var(--radius-lg)`. Verify `box-shadow: var(--shadow-md)`.
2. `.workflow-blueprint__title` — `font-size: 1.1rem` → `var(--text-lg)`.
3. `.workflow-blueprint__description` — `font-size: 0.875rem` → `var(--text-base)`.
4. `.workflow-blueprint__label` — `font-size: 0.75rem` → `var(--text-xs)`.
5. `.workflow-blueprint__agent` — `font-size: 0.8rem` → `var(--text-sm)`. `border-radius: 4px` → `var(--radius-sm)`.
6. `.workflow-blueprint__tag` — `font-size: 0.9rem` → `var(--text-base)`. `border-radius: 8px` → `var(--radius-md)`.

**Page-level:** 7. "Create Workflow" button — verify matches `primary-button`. 8. Agent count badges — verify they use `<Badge>` or standard badge pattern. 9. Action buttons (View Details, Edit, Save Template, Delete) — verify they use `ghost-button` consistently.

**AC:**

- Workflow cards use `var(--radius-lg)` and `var(--shadow-md)`.
- All typography uses tokens.
- CTA button matches primary button.
- Action buttons match ghost button.

---

### F9. Agents Page

**Files to modify:**

- `apps/web-vite/src/pages/AgentsPage.tsx`
- `apps/web-vite/src/components/agents/AgentCard.css`
- `apps/web-vite/src/components/agents/TemplateSelector.css`
- `apps/web-vite/src/components/agents/PromptCard.css`

**AgentCard.css token replacements:**

1. `.agent-card` — `border-radius: 12px` → `var(--radius-lg)`.
2. `.agent-card__title` — `font-size: 1.05rem` → `var(--text-md)`.
3. `.agent-card__description` — `font-size: 0.8rem` → `var(--text-sm)`.
4. `.agent-card__label` — `font-size: 0.7rem` → `var(--text-xs)`.
5. `.agent-card__role` — `font-size: 0.85rem` → `var(--text-sm)`.
6. `.agent-card__prompt` — `background: white` → `background: var(--card)`. `border-radius: 8px` → `var(--radius-md)`.
7. `.agent-card__meta-item` — `font-size: 0.875rem` → `var(--text-base)`.
8. All other `border-radius: 4px` → `var(--radius-sm)`, `8px` → `var(--radius-md)`.

**TemplateSelector.css:** 9. `.template-card` — `border-radius: 8px` → `var(--radius-md)`. 10. `.template-card__title` — `font-size: 1.1rem` → `var(--text-lg)`. 11. `.template-card__label` — `font-size: 0.65rem` → `var(--text-xs)`. 12. `.template-card__description` — `font-size: 0.85rem` → `var(--text-sm)`. 13. `.template-card__badge` — `font-size: 0.75rem` → `var(--text-xs)`. 14. `.template-card__agent` — `font-size: 0.7rem` → `var(--text-xs)`.

**PromptCard.css:** 15. `.prompt-card` — `border-radius: 12px` → `var(--radius-lg)`. 16. `.prompt-card__title` — `font-size: 1.05rem` → `var(--text-md)`. 17. `.prompt-card__label` — `font-size: 0.7rem` → `var(--text-xs)`. 18. `.prompt-card__type` — `font-size: 0.85rem` → `var(--text-sm)`. `border-radius: 4px` → `var(--radius-sm)`. 19. `.prompt-card__tag` — `font-size: 0.8rem` → `var(--text-sm)`. `border-radius: 8px` → `var(--radius-md)`.

**Page-level:** 20. Section switching — if not already using `<Tabs>`, verify consistent tab/toggle styling. 21. Filter controls — verify using `<Select>` component. 22. Role badges — verify using `<Badge>` or standard badge pattern.

**AC:**

- Agent cards use `var(--radius-lg)` and `var(--shadow-md)`.
- No `background: white` remains.
- All typography uses tokens.
- Role badges use badge pattern.
- Section switching is visually consistent.

---

### F10. Settings Page

**Files to modify:**

- `apps/web-vite/src/pages/SettingsPage.tsx`
- `apps/web-vite/src/globals.css` — `.settings-panel*` classes
- `apps/web-vite/src/styles/components/ChannelConnectionsPanel.css`
- `apps/web-vite/src/styles/components/SlackConnectionsPanel.css`
- `apps/web-vite/src/styles/components/SlackAppSettingsPanel.css`

**Token replacements:**

1. `.settings-panel` — verify card-like styling with `var(--radius-lg)`, `var(--shadow-md)`.
2. `.settings-panel__header` — verify `font-size: var(--text-lg)`, `font-weight: 600`.
3. Channel card colors — same `--channel-*` tokens created in F2.
4. `.channel-badge-soon` — verify badge styling.
5. Status indicators (connected/disconnected) — verify they use `<Badge success>` / `<Badge error>` pattern.
6. Section collapse/expand arrow — verify consistent icon and animation timing (`var(--motion-fast)`).
7. All buttons (Connect, Disconnect, Save) — verify proper `primary-button` or `ghost-button` class.
8. API key inputs — verify standard form field styling.

**SlackConnectionsPanel.css:** 9. `.slack-dm-indicator` — `#22c55e` → `var(--success)`. 10. All font-size replacements per standard mapping.

**ChannelConnectionsPanel.css:** 11. Channel icon colors — use `--channel-*` tokens. 12. All font-size replacements per standard mapping.

**AC:**

- Settings sections use card styling.
- Status indicators use badge pattern.
- Channel colors are tokenized.
- Collapse/expand animations are consistent.
- All buttons use proper variant.

---

### F11. Training Pages

**Files to modify:**

- `apps/web-vite/src/styles/training.css` (large file, ~69KB)
- `apps/web-vite/src/pages/ExerciseLibraryPage.tsx`
- `apps/web-vite/src/styles/components/WorkoutAIToolsDropdown.css`

**training.css — systematic pass:**

1. Grep for all `font-size:` declarations and replace with `var(--text-*)` tokens per mapping.
2. Grep for all `border-radius:` declarations and replace with `var(--radius-*)` per mapping.
3. Verify `var(--card-background)` references → normalize to `var(--card)`.
4. Verify `var(--border-color)` references → normalize to `var(--border)`.
5. Verify `var(--text-primary)` references → normalize to `var(--foreground)`.
6. Workout day cards — verify card-like styling.
7. Duration badges — add `font-family: var(--font-mono)` and consistent pill styling (`var(--radius-full)`).
8. Exercise table — verify consistent row height, padding, alternating row colors using `var(--background-tertiary)`.
9. Category badges — verify badge pattern.

**WorkoutAIToolsDropdown.css:** 10. All font-size and border-radius replacements per standard mapping. 11. `.workout-ai-modal__exercise-pill` — verify pill styling with `var(--radius-full)`.

**AC:**

- Exercise table uses consistent styling.
- Category badges use badge pattern.
- Duration values use monospace.
- Day cards use card pattern.
- No legacy color variable aliases remain.

---

### F12. Prompt Library Page

**Files to modify:**

- `apps/web-vite/src/pages/PromptLibraryPage.tsx`
- `apps/web-vite/src/components/agents/PromptCard.css` (already done in F9)

**Token replacements:**

1. Grid layout gap — verify `gap: var(--space-4)`.
2. Page title — verify `var(--text-2xl)` via `<PageHeader>` or manual.
3. Filter selects — verify standard `<Select>` styling.
4. Card hover states — verify consistent interactive pattern.

**AC:**

- Grid has consistent gap.
- Cards have consistent height/min-height.
- Category chips use badge pattern.
- Card hover matches global interactive card pattern.

---

### F13. Model Settings Page

**Files to modify:**

- `apps/web-vite/src/styles/pages/ModelSettingsPage.css`

**Token replacements (this file has the MOST hardcoded px values):**

1. `.model-settings-page` — `padding: 32px 24px` → `padding: var(--space-8) var(--space-5)`.
2. `.model-settings-page h1` — `font-size: 32px` → `font-size: var(--text-3xl)`.
3. `.model-settings-page .page-description` — `font-size: 15px` → `font-size: var(--text-md)`.
4. `.provider-card` — `border-radius: 8px` → `var(--radius-lg)`. `padding: 24px` → `padding: var(--space-5)`.
5. `.provider-info h3` — `font-size: 20px` → `font-size: var(--text-xl)`.
6. `.provider-description` — `font-size: 14px` → `font-size: var(--text-base)`.
7. `.toggle-switch` — `width: 48px; height: 26px` → keep (functional dimensions for toggle).
8. `.toggle-slider` — `border-radius: 13px` → `border-radius: var(--radius-full)`.
9. `.provider-body .form-group label` — `font-size: 14px` → `font-size: var(--text-base)`.
10. `.model-pricing` — `font-size: 13px` → `font-size: var(--text-sm)`. Add `font-family: var(--font-mono)`.
11. `.last-updated` — `font-size: 12px` → `font-size: var(--text-xs)`.
12. `.models-table th, td` — `padding: 10px 12px` → `padding: var(--space-3) var(--space-3)`.
13. `.models-table th` — `font-size: 12px` → `font-size: var(--text-xs)`.
14. `.discovery-error` — `padding: 12px 16px` → `padding: var(--space-3) var(--space-4)`. Remove hardcoded fallback hex values.
15. `.discovered-models` — `gap: 24px` → `gap: var(--space-5)`.

**AC:**

- Zero hardcoded px font-size values remain.
- Provider cards use `var(--radius-lg)`.
- Pricing uses monospace.
- Toggle switch preserves functional dimensions but uses token colors.
- No fallback hex colors remain.

---

### F14. Remaining Component CSS Files — Bulk Token Pass

For each of these files, do a **token replacement pass** (font-size + border-radius + hardcoded colors):

**AI/Research components:**

- `apps/web-vite/src/styles/components/AIToolsDropdown.css` — 16+ font-sizes, 8 border-radii, 12+ hardcoded colors. Replace verdict colors (#22c55e, #eab308, #f97316, #ef4444) with `var(--success)`, `var(--warning)`, `var(--warning)`, `var(--error)`.
- `apps/web-vite/src/styles/components/AIToolsPanel.css` — same pattern as AIToolsDropdown.
- `apps/web-vite/src/styles/components/MailboxAIToolsDropdown.css` — same pattern. Replace #eab308→`var(--warning)`, #ef4444→`var(--error)`, #22c55e→`var(--success)`.
- `apps/web-vite/src/styles/components/ClaimDetailPanel.css` — evidence badge colors (#8b5cf6, #f59e0b, #3b82f6, #06b6d4, #ec4899, #a855f7) → create evidence type tokens in tokens.css:
  ```css
  --evidence-empirical: #3b82f6;
  --evidence-testimonial: #8b5cf6;
  --evidence-analytical: #06b6d4;
  --evidence-statistical: #f59e0b;
  --evidence-anecdotal: #ec4899;
  --evidence-expert: #a855f7;
  ```
  With dark mode equivalents.
- `apps/web-vite/src/styles/components/DeepResearchViewer.css`
- `apps/web-vite/src/components/agents/KnowledgeGraphExplorer.css`
- `apps/web-vite/src/components/agents/DialecticalCycleVisualization.css`
- `apps/web-vite/src/components/agents/ResearchQueue.module.css`
- `apps/web-vite/src/components/agents/CustomWorkflowBuilder.css`

**Modal/Form components:**

- `apps/web-vite/src/styles/components/ImportModal.css`
- `apps/web-vite/src/styles/components/DuplicateReviewModal.css`
- `apps/web-vite/src/styles/components/NodePropertiesModal.css`
- `apps/web-vite/src/styles/components/ProjectLinkerModal.css`
- `apps/web-vite/src/styles/components/MeetingBriefingModal.css`
- `apps/web-vite/src/styles/components/RunDetailModal.css`

**Mind/Check-in components:**

- `apps/web-vite/src/styles/components/CheckInCard.css`
- `apps/web-vite/src/styles/components/CheckInHistoryModal.css`
- `apps/web-vite/src/styles/components/EmotionPicker.css`
- `apps/web-vite/src/styles/components/EmotionIntervention.css`
- `apps/web-vite/src/styles/components/DetailedEmotionModal.css`

**Other components:**

- `apps/web-vite/src/styles/components/FollowUpWidget.css`
- `apps/web-vite/src/styles/components/MessageCarousel.css`
- `apps/web-vite/src/styles/components/RunCard.css` — phase badge colors (#22c55e, #eab308, #f97316, #ef4444) → `var(--success)`, `var(--warning)`, `var(--warning)`, `var(--error)`.

**For EACH file:**

1. `grep -n "font-size:" <file>` — replace all with `var(--text-*)`.
2. `grep -n "border-radius:" <file>` — replace all with `var(--radius-*)`.
3. `grep -n "color: #" <file>` — replace status/verdict colors with semantic tokens.
4. `grep -n "background: #\|background-color: #" <file>` — replace with semantic tokens.

**AC:**

- After this pass, running `grep -rn "font-size:\s*[0-9]" apps/web-vite/src/ --include="*.css" | grep -v "tokens.css" | grep -v ".ProseMirror"` returns ZERO results (or only intentional exceptions like icon sizes).
- Running `grep -rn "border-radius:\s*[0-9]" apps/web-vite/src/ --include="*.css" | grep -v "tokens.css"` returns ZERO results (or only intentional exceptions like mixed shorthand).

---

## Phase G: Responsive & Accessibility (PLAN.md 1.5)

### G1. Responsive Breakpoints — Add to Token System

**File:** `apps/web-vite/src/tokens.css`

Add to `:root` (CSS custom properties can't be used in media queries directly, but document them as comments for reference):

```css
/* Breakpoints (for reference — use in @media queries directly):
   --breakpoint-sm: 640px;
   --breakpoint-md: 768px;
   --breakpoint-lg: 1024px;
*/
```

### G2. Add Responsive Styles to Key Pages

**46 CSS files currently have NO media queries.** Prioritize the pages/components that are most likely to be used on smaller screens.

**For each of these critical files, add a `@media (max-width: 768px)` block:**

1. **MailboxPage.css** — already has responsive ✓ (verify it works)
2. **PeoplePage.css** — already has responsive ✓ (verify)
3. **ModelSettingsPage.css** — Add:
   ```css
   @media (max-width: 768px) {
     .model-settings-page {
       padding: var(--space-4);
     }
     .providers-grid {
       grid-template-columns: 1fr;
     }
     .model-settings-page h1 {
       font-size: var(--text-2xl);
     }
   }
   ```
4. **NotesPage.css** (new extracted file) — Add:
   ```css
   @media (max-width: 768px) {
     .notes-layout {
       grid-template-columns: 1fr;
     }
     .notes-sidebar {
       display: none;
     } /* or collapse to sheet */
     .editor-header {
       padding: var(--space-4);
     }
     .editor-wrapper {
       padding: var(--space-4);
     }
   }
   ```
5. **NoteGraphPage.css** (new extracted file) — Add:
   ```css
   @media (max-width: 768px) {
     .note-graph-page__content {
       grid-template-columns: 1fr;
     }
     .note-graph-page__sidebar {
       border-bottom: 1px solid var(--border);
     }
   }
   ```
6. **training.css** — Verify existing responsive rules. Add if missing:
   ```css
   @media (max-width: 768px) {
     .training-plan-grid {
       grid-template-columns: 1fr;
     }
   }
   ```
7. **AgentCard.css** — Add:
   ```css
   @media (max-width: 768px) {
     .agent-card {
       min-height: auto;
     }
   }
   ```
8. **Modal components (all)** — Add to each modal CSS:
   ```css
   @media (max-width: 640px) {
     .MODAL_CLASS_NAME {
       width: 100%;
       max-width: 100%;
       max-height: 100%;
       border-radius: 0;
       margin: 0;
     }
   }
   ```
   Apply to: TaskFormModal, ContactFormModal, ImportModal, DuplicateReviewModal, NodePropertiesModal, MeetingBriefingModal, CheckInHistoryModal, DetailedEmotionModal, ProjectLinkerModal, RunDetailModal. Use each modal's actual class name.

**AC:**

- Every page degrades gracefully to single-column on mobile (768px).
- Modals go full-screen on mobile (640px).
- Navigation handles small screens (verify TopNav has hamburger or collapses).
- All touch targets minimum 44px on mobile.

---

### G3. Fix Focus State Violations

**29 CSS files have `outline: none` without replacement focus indicators.** For each one:

**The fix pattern:** Replace bare `outline: none` with a proper focus-visible rule:

```css
/* BEFORE (bad): */
.some-element:focus {
  outline: none;
  border-color: var(--accent);
}

/* AFTER (good): */
.some-element:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-subtle);
}
.some-element:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
```

**Files to fix (complete list with line numbers from audit):**

1. `globals.css` — lines 554, 559: The global `:focus-visible` rule removes outline but adds `box-shadow`. This is acceptable IF the box-shadow is visible. Verify it is.
2. `globals.css` — lines 2209, 2532, 3348, 6000, 7640: Additional `outline: none` instances. Each needs `box-shadow` or `border-color` replacement visible on focus.
3. `DateTimePicker.css` — lines 32, 286: Has `border-color: var(--accent)` replacement. Add `box-shadow: 0 0 0 2px var(--accent-subtle)` as well.
4. `Select.css` — lines 29, 91: Has `border-color` + `box-shadow` replacement. ✓ Already good, verify.
5. `TipTapEditor.css` — lines 49, 318, 322: Editor focus is intentionally hidden (content editable). Acceptable exception.
6. `ContactFormModal.css` — lines 82, 99: Add `box-shadow: 0 0 0 2px var(--accent-subtle)`.
7. `TaskFormModal.css` — line 146: Add `box-shadow: 0 0 0 2px var(--accent-subtle)`.
8. `ImportModal.css` — line 203: Add focus replacement.
9. `MailboxComposer.css` — lines 95, 163: Add focus replacement.
10. `EmotionPicker.css` — line 46: Add focus replacement.
11. `DetailedEmotionModal.css` — line 145: Add focus replacement.
12. `NodePropertiesModal.css` — lines 72, 184: Add focus replacement.
13. `CustomWorkflowBuilder.css` — line 204: Add focus replacement.
14. `KnowledgeGraphExplorer.css` — line 56: Add focus replacement.
15. `CustomPromptModal.css` — line 110: Add focus replacement.
16. `AIToolsDropdown.css` — line 352: Add focus replacement.
17. `AIToolsPanel.css` — line 577: Add focus replacement.
18. `MailboxAIToolsDropdown.css` — line 269: Add focus replacement.
19. `WorkoutAIToolsDropdown.css` — line 236: Add focus replacement.
20. `MessageCarousel.css` — line 256: Add focus replacement.
21. `LabelingInterface.css` — lines 542, 618: Add focus replacement.
22. `SlackAppSettingsPanel.css` — line 109: Add focus replacement.
23. `SlackConnectionsPanel.css` — line 150: Add focus replacement.
24. `LinkedInSettingsPanel.css` — line 113: Add focus replacement.
25. `TelegramSettingsPanel.css` — line 100: Add focus replacement.
26. `WhatsAppSettingsPanel.css` — line 104: Add focus replacement.
27. `ParagraphTagMenu.css` — line 63: Add focus replacement.

For items 6–27: at the location of each `outline: none`, add:

```css
box-shadow: 0 0 0 2px var(--accent-subtle);
```

on the same rule. Then add a `:focus-visible` rule for the same selector with `outline: 2px solid var(--accent); outline-offset: 2px;` if one doesn't already exist.

**AC:**

- Running `grep -rn "outline:\s*none\|outline:\s*0" apps/web-vite/src/ --include="*.css"` — every result has an accompanying `box-shadow` or `border-color` visible replacement in the same rule.
- Every interactive element shows a visible indicator when focused via keyboard.

---

### G4. Add `prefers-reduced-motion` Support

Currently only 1 file (`habits-mind.css`) respects this preference. Add the following block to `globals.css` at the end:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This is a **global catch-all** that respects the user's OS preference. It's more efficient than adding per-file rules.

**Also add to `Select.css`** to handle the custom keyframe animations:

```css
@media (prefers-reduced-motion: reduce) {
  .select-content[data-state='open'] {
    animation: none;
  }
  .select-content[data-state='closed'] {
    animation: none;
  }
}
```

**AC:**

- A user with `prefers-reduced-motion: reduce` sees no animations or transitions.
- The global rule in globals.css covers all files automatically.
- Specific keyframe animations in Select.css are also handled.

---

### G5. Touch Target Minimum Sizes

**File:** `apps/web-vite/src/globals.css`

Add at the end:

```css
@media (hover: none) and (pointer: coarse) {
  button,
  [role='button'],
  a,
  input,
  select,
  textarea,
  .ghost-button,
  .primary-button {
    min-height: 44px;
    min-width: 44px;
  }

  .ghost-button.small {
    min-height: 36px;
    min-width: 36px;
  }
}
```

Also fix the specific issue in `globals.css` where `min-width: 32px; min-height: 32px` is set on some elements — increase to 44px within the coarse pointer media query.

**AC:**

- On touch devices, all interactive elements meet 44px minimum.
- Small button variant is 36px (acceptable for secondary actions).

---

### G6. ARIA Improvements for Custom Components

**Files to add ARIA attributes to:**

1. **MailboxAIToolsDropdown.tsx** — Add `role="menu"` to dropdown, `role="menuitem"` to items, `aria-expanded` on trigger, `aria-haspopup="true"` on trigger.
2. **WorkoutAIToolsDropdown.tsx** — Same pattern as above.
3. **AIToolsDropdown.tsx** (notes version) — Same pattern.
4. **All custom modal components** — Verify `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title element.
5. **Toggle switches** — Verify `role="switch"`, `aria-checked`.

**AC:**

- All dropdown menus have `role="menu"` + `role="menuitem"`.
- All triggers have `aria-expanded` + `aria-haspopup`.
- All modals have `role="dialog"` + `aria-modal` + `aria-labelledby`.

---

### G7. Color Contrast Fixes

**Light mode issues:**

1. `--muted-foreground: #6e77a6` on `--background: #f4f6ff` — ratio ~4.2:1, just below AA for small text. Darken to `#5f6893` for 4.8:1.
2. `--text-label: #7a83b2` on `--card: #ffffff` — ratio ~4.5:1, borderline AA. Darken to `#6b749f` for 5.2:1.

**Dark mode issues:** 3. Dark mode priority badge text on badge background — borderline at 4.5:1. Lighten text colors slightly:

- `--priority-high-text: #fca5a5` → `#fecaca` (on dark bg, this improves contrast)
- `--priority-medium-text: #fdba74` → `#fed7aa`
- `--priority-low-text: #93c5fd` → `#bfdbfe`

**Apply in tokens.css** — update the values in both `:root` and `.dark` blocks.

**AC:**

- All text/background pairings meet WCAG AA (4.5:1 for normal text, 3:1 for large text).
- Priority badges in dark mode have improved readability.

---

## Verification & Quality Gates

### After EACH page (F1–F14), run:

```bash
cd apps/web-vite && pnpm typecheck && pnpm lint --fix && pnpm build
```

Fix any failures before proceeding.

### After Phase G (all responsive/a11y), run:

```bash
cd apps/web-vite && pnpm typecheck && pnpm lint --fix && pnpm test && pnpm build
```

### Final verification greps:

```bash
# Should return ZERO results (or only tokens.css and ProseMirror exceptions):
grep -rn "font-size:\s*[0-9]" apps/web-vite/src/ --include="*.css" | grep -v tokens.css | grep -v ProseMirror | wc -l

# Should return ZERO results (or only tokens.css and 0-value exceptions):
grep -rn "border-radius:\s*[0-9]" apps/web-vite/src/ --include="*.css" | grep -v tokens.css | grep -v "border-radius:\s*0[^.]" | wc -l

# Should return ZERO results:
grep -rn "background:\s*white\|background:\s*#fff" apps/web-vite/src/ --include="*.css" | grep -v tokens.css | wc -l

# Verify no inline <style> blocks remain in page TSX files:
grep -rn "<style>" apps/web-vite/src/pages/ --include="*.tsx" | wc -l
```

---

## Final Steps: Code Review & Commit

After ALL phases are complete and all checks pass:

1. **Self-review:**
   - Visually scan 3–4 page screenshots in both light and dark mode (use the dev tools toggle) to verify nothing looks broken
   - Verify new CSS files (NotesPage.css, NoteGraphPage.css) are properly imported
   - Verify new tokens (channel colors, circle badge colors, evidence type colors) have both light and dark variants
   - Verify the global `prefers-reduced-motion` rule is at the end of globals.css

2. **Commit:**

```
feat(design-system): apply visual consistency across all pages + accessibility

Phase 1.4 — Visual Consistency:
- Tokenize all font-size, border-radius, box-shadow across 76 CSS files
- Extract inline <style> blocks from NotesPage and NoteGraphPage to CSS files
- Add channel, circle-badge, and evidence-type color tokens
- Normalize all card containers to consistent radius/shadow/sheen
- Apply monospace font to all numeric/stat/time displays
- Ensure section labels follow standard pattern across all pages

Phase 1.5 — Responsive & Accessibility:
- Add responsive breakpoints to key pages and modal components
- Fix 27 outline:none accessibility violations with visible focus replacements
- Add global prefers-reduced-motion support
- Add touch-target minimum sizes for coarse-pointer devices
- Add ARIA roles to custom dropdown and modal components
- Fix color contrast for muted-foreground and text-label tokens
- Improve dark mode priority badge contrast

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Key Constraints

- **Do NOT break existing functionality.** This is a token migration and polish pass.
- **Work page-by-page.** Complete F1, verify, F2, verify, etc. Don't batch.
- **The font-size and border-radius mapping is universal.** Apply the same mapping everywhere — do not invent new mappings per-file.
- **Preserve mixed border-radius shorthand.** E.g., `border-radius: 8px 8px 0 0` → `border-radius: var(--radius-md) var(--radius-md) 0 0`. Do NOT flatten to a single value.
- **Keep functional dimensions.** Things like toggle switch width/height, SVG sizes, progress bar heights, avatar sizes — these are functional, not aesthetic. Leave them as hardcoded px.
- **Channel colors are brand colors.** They don't change between light/dark mode. Define them once in `:root` only (not in `.dark`).
- **Inline `<style>` extraction:** When extracting from TSX, the class names must remain identical. Only the CSS location changes.
