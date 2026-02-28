# Agent Prompt — Task 2.9: Training — Tabbed Plan Edit & Exercise Library

> **Scope:** Refactor the PlanFormModal into a tabbed-by-day interface to eliminate the massive single scroll, and add pagination/sorting to the Exercise Library table.

---

## 0. Context & References

| Item                       | Path (relative to repo root)                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Design tokens**          | `apps/web-vite/src/tokens.css`                                                                              |
| **UI primitives**          | `apps/web-vite/src/components/ui/`                                                                          |
| **WorkoutPlanPage**        | `apps/web-vite/src/pages/WorkoutPlanPage.tsx` (199 lines)                                                   |
| **ExerciseLibraryPage**    | `apps/web-vite/src/pages/ExerciseLibraryPage.tsx` (290 lines)                                               |
| **PlanFormModal**          | `apps/web-vite/src/components/training/PlanFormModal.tsx` (539 lines)                                       |
| **ExerciseFormModal**      | `apps/web-vite/src/components/training/ExerciseFormModal.tsx`                                               |
| **TodayWorkout**           | `apps/web-vite/src/components/training/TodayWorkout.tsx`                                                    |
| **WorkoutAIToolsDropdown** | `apps/web-vite/src/components/training/WorkoutAIToolsDropdown.tsx`                                          |
| **Hooks**                  | `useWorkoutPlan`, `useWorkoutOperations`, `useTrainingToday`                                                |
| **CSS**                    | `apps/web-vite/src/styles/training.css`                                                                     |
| **Domain models**          | `packages/training/src/domain/models.ts` — `WorkoutDaySchedule`, `DayExerciseBlock`, `ExerciseTypeCategory` |
| **Default exercises**      | `apps/web-vite/src/utils/defaultExercises.ts` — `EXERCISE_CATEGORY_LABELS`, `EXERCISE_TYPE_CATEGORIES`      |
| **Select component**       | `apps/web-vite/src/components/Select.tsx`                                                                   |
| **SegmentedControl**       | `apps/web-vite/src/components/SegmentedControl.tsx`                                                         |

**Current PlanFormModal:** Single scrolling modal with all 7 days visible in one continuous list. Each day has a header with rest-day toggle, expandable category blocks with time + exercise pickers. The modal has no height cap — extremely long scroll for a full week.

**Current ExerciseLibraryPage:** Table with columns: Exercise, Target Muscle, Category, Variants (G/H/R), Actions. Has search input and category filter buttons. All exercises render at once with no pagination.

---

## Phase A — PlanFormModal Tabbed-by-Day

### A1. Replace Scroll with Day Tabs

In `PlanFormModal.tsx`, replace the `.plan-schedule-builder` that renders all 7 days in a single scroll with a tab interface showing one day at a time:

```tsx
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const [activeDay, setActiveDay] = useState(0)
```

### A2. Day Tab Bar

Replace the `.plan-schedule-builder` div with:

```tsx
<div className="plan-day-tabs">
  {schedule.map((day, index) => {
    const hasBlocks = day.blocks.length > 0
    const isRest = day.restDay
    return (
      <button
        key={index}
        className={`plan-day-tab ${index === activeDay ? 'plan-day-tab--active' : ''} ${isRest ? 'plan-day-tab--rest' : ''} ${hasBlocks ? 'plan-day-tab--has-content' : ''}`}
        onClick={() => setActiveDay(index)}
      >
        <span className="plan-day-tab__name">{DAY_SHORT[day.dayOfWeek]}</span>
        {isRest && <span className="plan-day-tab__badge plan-day-tab__badge--rest">R</span>}
        {!isRest && hasBlocks && <span className="plan-day-tab__badge">{day.blocks.length}</span>}
      </button>
    )
  })}
</div>
```

### A3. Single Day Content Panel

Below the tabs, render only the active day:

```tsx
{/* Active Day Content */}
{schedule[activeDay] && (
  <div className="plan-day-panel">
    <div className="plan-day-panel__header">
      <h3>{DAY_NAMES[schedule[activeDay].dayOfWeek]}</h3>
      <label className="checkbox-label-inline">
        <input
          type="checkbox"
          checked={schedule[activeDay].restDay || false}
          onChange={() => handleToggleRestDay(activeDay)}
        />
        <span>Rest Day</span>
      </label>
    </div>

    {schedule[activeDay].restDay ? (
      <div className="plan-day-panel__rest">
        <p>Recovery day — no exercises scheduled</p>
      </div>
    ) : (
      <div className="plan-day-panel__blocks">
        {/* Existing block rendering code for schedule[activeDay].blocks */}
        {schedule[activeDay].blocks.map((block, blockIndex) => (
          /* ... existing exercise-block JSX, using activeDay instead of dayIndex ... */
        ))}

        {/* Add category button */}
        {getAvailableCategories(activeDay).length > 0 && (
          <div className="add-block-row">
            <Select
              value=""
              placeholder="+ Add category"
              options={getAvailableCategories(activeDay)}
              onChange={(value) => {
                if (value) handleAddBlock(activeDay, value as ExerciseTypeCategory);
              }}
              className="add-category-select"
            />
          </div>
        )}
      </div>
    )}
  </div>
)}
```

### A4. Nav Buttons Between Days

```tsx
<div className="plan-day-nav">
  <button
    className="ghost-button"
    onClick={() => setActiveDay((d) => Math.max(0, d - 1))}
    disabled={activeDay === 0}
  >
    Previous Day
  </button>
  <span className="plan-day-nav__indicator">{activeDay + 1} / 7</span>
  <button
    className="ghost-button"
    onClick={() => setActiveDay((d) => Math.min(6, d + 1))}
    disabled={activeDay === 6}
  >
    Next Day
  </button>
</div>
```

### A5. Cap Modal Height

Ensure the modal has a max height:

```css
.plan-form-modal {
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}

.plan-form-modal .modal-body {
  flex: 1;
  overflow-y: auto;
}
```

### A6. Tab CSS

```css
.plan-day-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-4);
  overflow-x: auto;
}

.plan-day-tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all var(--motion-fast) var(--motion-ease);
  min-width: 0;
}

.plan-day-tab:hover {
  color: var(--foreground);
  background: var(--background-tertiary);
}

.plan-day-tab--active {
  color: var(--foreground);
  border-bottom-color: var(--accent);
}

.plan-day-tab--rest {
  color: var(--text-tertiary);
}

.plan-day-tab__name {
  font-weight: 600;
}

.plan-day-tab__badge {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--accent);
}

.plan-day-tab__badge--rest {
  color: var(--text-tertiary);
}

.plan-day-panel {
  min-height: 200px;
}

.plan-day-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.plan-day-panel__rest {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: var(--text-tertiary);
  font-style: italic;
}

.plan-day-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--space-3);
  border-top: 1px solid var(--border);
  margin-top: var(--space-3);
}

.plan-day-nav__indicator {
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  color: var(--text-tertiary);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Exercise Library Pagination & Sorting

### B1. Add Pagination State

In `ExerciseLibraryPage.tsx`, add pagination:

```tsx
const PAGE_SIZE = 20
const [currentPage, setCurrentPage] = useState(1)
const [sortField, setSortField] = useState<'name' | 'target' | 'category'>('name')
const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
```

### B2. Sorting Logic

Replace the current `.sort()` with configurable sorting:

```tsx
const sortedExercises = useMemo(() => {
  return [...filteredExercises].sort((a, b) => {
    let cmp = 0
    switch (sortField) {
      case 'name':
        cmp = getExerciseName(a).localeCompare(getExerciseName(b))
        break
      case 'target':
        cmp = getTargetMuscleDisplay(a).localeCompare(getTargetMuscleDisplay(b))
        break
      case 'category':
        cmp = getCategoryLabel(a).localeCompare(getCategoryLabel(b))
        break
    }
    return sortDir === 'asc' ? cmp : -cmp
  })
}, [filteredExercises, sortField, sortDir])
```

### B3. Paginated Slice

```tsx
const totalPages = Math.ceil(sortedExercises.length / PAGE_SIZE)
const paginatedExercises = sortedExercises.slice(
  (currentPage - 1) * PAGE_SIZE,
  currentPage * PAGE_SIZE
)

// Reset to page 1 when filters change
useEffect(() => {
  setCurrentPage(1)
}, [searchQuery, selectedCategory])
```

### B4. Sortable Table Headers

Replace static `<th>` elements with clickable sort headers:

```tsx
<thead>
  <tr>
    <th className="sortable-header" onClick={() => toggleSort('name')}>
      Exercise{' '}
      {sortField === 'name' && <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
    <th className="sortable-header" onClick={() => toggleSort('target')}>
      Target Muscle{' '}
      {sortField === 'target' && (
        <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>
      )}
    </th>
    <th className="sortable-header" onClick={() => toggleSort('category')}>
      Category{' '}
      {sortField === 'category' && (
        <span className="sort-arrow">{sortDir === 'asc' ? '↑' : '↓'}</span>
      )}
    </th>
    <th>Variants</th>
    <th className="actions-column">Actions</th>
  </tr>
</thead>
```

Toggle sort handler:

```tsx
const toggleSort = (field: 'name' | 'target' | 'category') => {
  if (sortField === field) {
    setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
  } else {
    setSortField(field)
    setSortDir('asc')
  }
}
```

### B5. Pagination Controls

Below the table, add pagination:

```tsx
{
  totalPages > 1 && (
    <div className="pagination">
      <button
        className="ghost-button pagination__button"
        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
        disabled={currentPage === 1}
      >
        Previous
      </button>
      <div className="pagination__pages">
        {Array.from({ length: totalPages }, (_, i) => i + 1)
          .filter((page) => {
            // Show first, last, and pages near current
            return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1
          })
          .map((page, i, arr) => (
            <Fragment key={page}>
              {i > 0 && arr[i - 1] !== page - 1 && (
                <span className="pagination__ellipsis">...</span>
              )}
              <button
                className={`pagination__page ${page === currentPage ? 'pagination__page--active' : ''}`}
                onClick={() => setCurrentPage(page)}
              >
                {page}
              </button>
            </Fragment>
          ))}
      </div>
      <button
        className="ghost-button pagination__button"
        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
        disabled={currentPage === totalPages}
      >
        Next
      </button>
    </div>
  )
}
```

### B6. Show Result Summary

Above the table, add a result count line:

```tsx
<div className="exercise-library-summary">
  <span>
    Showing {(currentPage - 1) * PAGE_SIZE + 1}–
    {Math.min(currentPage * PAGE_SIZE, sortedExercises.length)} of {sortedExercises.length}{' '}
    exercises
  </span>
</div>
```

### B7. Pagination & Sorting CSS

```css
.sortable-header {
  cursor: pointer;
  user-select: none;
  transition: color var(--motion-fast) var(--motion-ease);
}

.sortable-header:hover {
  color: var(--accent);
}

.sort-arrow {
  font-size: var(--text-xs);
  margin-left: var(--space-1);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-4) 0;
}

.pagination__pages {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.pagination__page {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: none;
  cursor: pointer;
  font-size: var(--text-sm);
  font-family: var(--font-mono);
  color: var(--text-secondary);
  transition: all var(--motion-fast) var(--motion-ease);
}

.pagination__page:hover {
  background: var(--background-tertiary);
  color: var(--foreground);
}

.pagination__page--active {
  background: var(--accent);
  color: var(--accent-foreground);
  border-color: var(--accent);
  font-weight: 600;
}

.pagination__ellipsis {
  color: var(--text-tertiary);
  font-size: var(--text-sm);
}

.exercise-library-summary {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  padding: var(--space-2) 0;
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Category Filter Bar Enhancement

### C1. Replace Button Row with Chip Bar

In `ExerciseLibraryPage.tsx`, replace the current `.category-filters` with a styled chip bar:

```tsx
<div className="exercise-filter-bar">
  <input
    type="text"
    className="exercise-filter-bar__search"
    placeholder="Search exercises..."
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
  />
  <div className="exercise-filter-bar__chips">
    <button
      className={`filter-chip ${selectedCategory === 'all' ? 'filter-chip--active' : ''}`}
      onClick={() => setSelectedCategory('all')}
    >
      All ({exercises.filter((e) => !e.archived).length})
    </button>
    {EXERCISE_TYPE_CATEGORIES.map((cat) => {
      const count = exercises.filter((e) => e.category === cat && !e.archived).length
      return (
        <button
          key={cat}
          className={`filter-chip ${selectedCategory === cat ? 'filter-chip--active' : ''}`}
          onClick={() => setSelectedCategory(cat)}
        >
          {EXERCISE_CATEGORY_LABELS[cat]} ({count})
        </button>
      )
    })}
  </div>
</div>
```

### C2. Filter Chip CSS

```css
.exercise-filter-bar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
}

.exercise-filter-bar__search {
  max-width: 320px;
}

.exercise-filter-bar__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.filter-chip {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-sm);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--motion-fast) var(--motion-ease);
}

.filter-chip:hover {
  background: var(--background-tertiary);
  color: var(--foreground);
}

.filter-chip--active {
  background: var(--accent-subtle);
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 500;
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Quality Gates (run after ALL phases)

```bash
pnpm typecheck
pnpm lint --fix
pnpm vitest run --reporter=verbose apps/web-vite
pnpm build
```

---

## Tests

Create `apps/web-vite/src/components/training/__tests__/PlanFormModal.test.tsx`:

1. **Renders 7 day tabs** — Verify all 7 day tabs render (Sun-Sat)
2. **Shows one day at a time** — Default shows Sunday, clicking "Tue" shows Tuesday content
3. **Rest day toggle** — Toggle rest day on Monday tab, verify "Recovery day" message
4. **Nav buttons** — Click "Next Day" advances tab, "Previous Day" goes back
5. **Modal height capped** — Verify `.plan-form-modal` has `max-height: 70vh` style

Create `apps/web-vite/src/pages/__tests__/ExerciseLibraryPage.test.tsx`:

6. **Pagination renders** — With 25 exercises, verify 2 pages (20 + 5)
7. **Page navigation** — Click page 2, verify exercises 21-25 shown
8. **Column sorting** — Click "Exercise" header, verify sort changes
9. **Category counts** — Verify category chips show correct counts
10. **Search resets page** — On page 2, type search query, verify back to page 1

---

## Commit

```
feat(training): tabbed plan editor by day, exercise library pagination

- PlanFormModal: replace 7-day scroll with day tabs (Sun-Sat)
- Only one day visible at a time, with Previous/Next navigation
- Modal height capped at 70vh
- Exercise Library: add pagination (20 per page)
- Sortable table headers (name, target muscle, category)
- Category filter chips with exercise counts
- Result summary showing current range

Co-Authored-By: Claude <noreply@anthropic.com>
```
