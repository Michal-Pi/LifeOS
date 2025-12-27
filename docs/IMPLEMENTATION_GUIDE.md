# Design System Implementation Guide

## Overview

This guide provides step-by-step instructions for applying the refined minimalist design system to existing and new pages.

## Quick Start Checklist

For each page/component you're updating:

- [ ] Replace pill-shaped buttons (`999px`) with refined radius (`0.5rem`)
- [ ] Update card border radius from `2rem` to `1rem`
- [ ] Standardize padding to `1.5rem` for cards
- [ ] Use spacing tokens from the 8px grid
- [ ] Apply consistent typography from the scale
- [ ] Ensure dark mode support
- [ ] Test accessibility (color contrast, keyboard nav)

## Component Migration Patterns

### 1. Cards

**Before:**

```tsx
<div className="content-card">
  {' '}
  {/* Has padding: 2.5rem, border-radius: 2rem */}
  <h2>Card Title</h2>
  <p>Content</p>
</div>
```

**After:**

```tsx
<div className="card">
  {' '}
  {/* Now has padding: 1.5rem, border-radius: 1rem */}
  <h2 className="card-title">Card Title</h2>
  <div className="card-content">
    <p>Content</p>
  </div>
</div>
```

**CSS Update:**

```css
/* Update in globals.css */
.your-custom-card {
  border-radius: 1rem; /* Changed from 2rem */
  padding: 1.5rem; /* Changed from 2.5rem */
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); /* Simplified */
}
```

### 2. Buttons

**Before:**

```tsx
<button className="primary-button">Click Me</button>
```

**CSS Before:**

```css
.primary-button {
  border-radius: 999px; /* Pill shape */
  padding: 0.75rem 1.25rem;
}
```

**After (no HTML change needed):**

```css
.primary-button {
  border-radius: 0.5rem; /* Refined corner */
  padding: 0.625rem 1rem; /* Adjusted padding */
}
```

### 3. Section Labels

**Before:**

```tsx
<p className="section-label">Section Title</p>
```

**CSS Before:**

```css
.section-label {
  font-size: 0.65rem; /* Too small */
  letter-spacing: 0.4em; /* Too wide */
}
```

**After:**

```css
.section-label {
  font-size: 0.75rem; /* Standardized */
  letter-spacing: 0.05em; /* More readable */
  font-weight: 600;
  text-transform: uppercase;
}
```

### 4. Spacing

**Before:**

```tsx
<div style={{ gap: '0.9rem', marginBottom: '1.3rem' }}>
```

**After:**

```tsx
<div style={{ gap: '1rem', marginBottom: '1.5rem' }}>
  {/* Use values from 8px grid: 0.5rem, 0.75rem, 1rem, 1.5rem, 2rem */}
</div>
```

## Page-Specific Implementation

### Today Page ✅ Complete

Already implemented with:

- Inspiration card with daily quotes
- Refined card radius (1rem)
- Priority legend with color dots
- Stats grid with 3 metrics
- Responsive two-column layout

**Files:**

- `/apps/web-vite/src/pages/TodayPage.tsx`
- `/apps/web-vite/src/globals.css` (refined components section)

### Calendar Page 🔄 Needs Refinement

**Current Status:** Functional, but not fully aligned with the refined design system

**Changes Needed:**

1. **Update card styles:**

```css
/* In globals.css, update these classes */
.calendar-events {
  border-radius: 1rem; /* From 1.5rem */
  padding: 1.5rem; /* Ensure consistent */
}

.calendar-detail {
  border-radius: 1rem; /* From 1.5rem */
  padding: 1.5rem; /* From 1.75rem */
}

.event-card {
  border-radius: 0.5rem; /* From 1rem - smaller for nested */
  padding: 1rem;
}
```

2. **Update buttons:**

```css
.ghost-button {
  border-radius: 0.5rem; /* From 999px */
}

.primary-button {
  border-radius: 0.5rem; /* From 999px */
}
```

3. **Refine stats display:**

```css
.calendar-stats {
  border-radius: 1rem; /* From 1.5rem */
  padding: 1.25rem;
  gap: 1.5rem; /* Standardize */
}
```

4. **Month view improvements:**

```css
.month-view {
  border-radius: 1rem; /* From 1rem - no change needed */
}

.day-cell {
  border-radius: 0.5rem; /* Keep as is */
}
```

**Implementation Steps:**

1. Test current page functionality
2. Update CSS values in globals.css
3. Test all interactions (create, edit, delete events)
4. Verify dark mode
5. Check responsive layouts

### Todos Page 🔄 To Implement

**Recommended Changes:**

1. **Apply task list pattern from Today page:**

```tsx
<div className="task-list-card">
  <div className="task-list-header">
    <h2 className="section-label">Tasks</h2>
    <div className="priority-legend">{/* Add priority dots */}</div>
  </div>
  <div className="task-items">{/* Map tasks */}</div>
</div>
```

2. **Use priority badges:**

```tsx
<span className={`priority-badge priority-badge-p${task.priority}`}>P{task.priority}</span>
```

3. **Add checkboxes:**

```tsx
<input
  type="checkbox"
  className="task-checkbox"
  checked={task.completed}
  onChange={() => toggleTask(task.id)}
/>
```

### Projects Page 🔄 To Implement

**Recommended Pattern:**

1. **Project cards:**

```tsx
<div className="card">
  <h3 className="card-title">{project.name}</h3>
  <p className="text-sm text-muted-foreground">{project.description}</p>
  <div className="mt-4 flex gap-2">
    <span className="badge">{project.taskCount} tasks</span>
    <span className="badge">{project.status}</span>
  </div>
</div>
```

2. **Grid layout:**

```css
.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}
```

### Notes Page 🔄 To Implement

**Recommended Pattern:**

1. **Note list:**

```tsx
<div className="card">
  <div className="note-header">
    <h3 className="card-title">{note.title}</h3>
    <span className="text-sm text-muted-foreground">{formatDate(note.updatedAt)}</span>
  </div>
  <p className="mt-2 text-sm">{note.preview}</p>
</div>
```

2. **Editor styling:**

```css
.note-editor {
  border-radius: 1rem;
  padding: 1.5rem;
  background: var(--card);
  border: 1px solid var(--border);
  min-height: 400px;
}
```

### People Page 🔄 To Implement

**Recommended Pattern:**

1. **Contact cards:**

```tsx
<div className="card">
  <div className="flex items-center gap-4">
    <div className="avatar">{person.initials}</div>
    <div className="flex-1">
      <h3 className="font-semibold">{person.name}</h3>
      <p className="text-sm text-muted-foreground">{person.email}</p>
    </div>
  </div>
</div>
```

2. **Avatar styling:**

```css
.avatar {
  width: 3rem;
  height: 3rem;
  border-radius: 50%; /* Keep circular */
  background: var(--primary);
  color: var(--primary-foreground);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}
```

## Common Patterns

### Stats Display

Use the refined stats pattern from Today page:

```tsx
<div className="stats-grid-refined">
  <div className="stat-card">
    <p className="stat-label">Metric Name</p>
    <p className="stat-value">42</p>
    <p className="stat-description">Descriptive text</p>
  </div>
</div>
```

### List Items with Hover

```css
.list-item {
  padding: 1rem;
  border-radius: 0.5rem;
  transition: background 0.15s ease;
  cursor: pointer;
}

.list-item:hover {
  background: var(--muted);
}
```

### Responsive Grids

```css
/* Two-column responsive */
.grid-2-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1.5rem;
}

/* Three-column responsive */
.grid-3-col {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
}
```

## Testing Checklist

After implementing design changes:

### Visual Testing

- [ ] Cards have 1rem border radius
- [ ] Buttons have 0.5rem border radius
- [ ] Padding is consistent (1.5rem on cards)
- [ ] Spacing follows 8px grid
- [ ] Typography uses standard scale
- [ ] Shadows are subtle (not heavy)

### Functional Testing

- [ ] All interactions still work
- [ ] Forms submit correctly
- [ ] Modals open/close
- [ ] Navigation functions
- [ ] Data loads properly

### Responsive Testing

- [ ] Mobile (320px-767px)
- [ ] Tablet (768px-1023px)
- [ ] Desktop (1024px+)
- [ ] Large desktop (1440px+)

### Accessibility Testing

- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] Keyboard navigation works
- [ ] Focus indicators visible
- [ ] Screen reader labels present
- [ ] ARIA attributes correct

### Dark Mode Testing

- [ ] All colors invert correctly
- [ ] Borders remain visible
- [ ] Shadows work on dark backgrounds
- [ ] Status colors maintain contrast
- [ ] Hover states are visible

## Migration Timeline

### Week 1: Foundation ✅

- [x] Create design tokens
- [x] Document design system
- [x] Refactor Today page
- [x] Test and validate

### Week 2: Core Pages

- [ ] Update Calendar page
- [ ] Update Todos page
- [ ] Test integrations

### Week 3: Secondary Pages

- [ ] Update Projects page
- [ ] Update Notes page
- [ ] Update People page

### Week 4: Polish

- [ ] Settings page
- [ ] Component showcase
- [ ] Final QA testing
- [ ] Documentation updates

## Common Pitfalls

### 1. Inconsistent Spacing

❌ **Wrong:** Using arbitrary values

```css
margin-bottom: 1.3rem;
gap: 0.9rem;
```

✅ **Right:** Using grid values

```css
margin-bottom: 1.5rem; /* 24px from grid */
gap: 1rem; /* 16px from grid */
```

### 2. Mixed Border Radius

❌ **Wrong:** Keeping old pill shapes

```css
.some-button {
  border-radius: 999px;
}
```

✅ **Right:** Using refined radius

```css
.some-button {
  border-radius: 0.5rem; /* 8px */
}
```

### 3. Inconsistent Typography

❌ **Wrong:** One-off font sizes

```css
font-size: 0.93rem;
```

✅ **Right:** Using scale

```css
font-size: 0.875rem; /* text-sm from scale */
```

### 4. Heavy Shadows

❌ **Wrong:** Dated heavy shadows

```css
box-shadow: 0 25px 60px rgba(0, 0, 0, 0.3);
```

✅ **Right:** Subtle elevation

```css
box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
```

## Tools & Resources

### Development

- **Design Tokens**: `/apps/web-vite/src/theme.css`
- **CSS Variables**: `/apps/web-vite/src/globals.css`
- **Documentation**: `/docs/DESIGN_SYSTEM.md`

### Design

- **Color Contrast Checker**: https://webaim.org/resources/contrastchecker/
- **Type Scale Calculator**: https://type-scale.com/
- **Spacing Calculator**: 8px × n

### Testing

- **Responsive Testing**: Browser DevTools
- **Accessibility**: axe DevTools Chrome extension
- **Color Blindness**: Colorblindly Chrome extension

## Getting Help

### Questions About:

**Design Tokens**

- See: `/apps/web-vite/src/theme.css`
- Documentation: `/docs/DESIGN_SYSTEM.md`

**CSS Classes**

- See: `/apps/web-vite/src/globals.css`
- Search for component name in file

**Implementation Examples**

- Reference: `/apps/web-vite/src/pages/TodayPage.tsx`
- Pattern: Refined, consistent spacing

**Migration Issues**

- Check: This file's "Common Pitfalls" section
- Review: Design changelog for context

## Next Steps

1. **Review** this guide and the design system documentation
2. **Plan** which page to update next (Calendar recommended)
3. **Test** changes in development environment
4. **Iterate** based on feedback
5. **Document** any new patterns discovered

---

**Last Updated**: December 19, 2024
**Version**: 1.0.0
**Maintained By**: Design System Team
