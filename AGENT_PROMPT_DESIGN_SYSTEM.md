# Agent Prompt: Design System Foundation (PLAN.md 1.1 - 1.3)

## Objective

Implement PLAN.md sections 1.1 (Rationalize Design Token Scale), 1.2 (Complete Dark Mode Coverage), and 1.3 (Build Reusable UI Primitives) for the LifeOS web application. This is a large, incremental refactor of the existing design system and the creation of missing shared components.

**Root directory:** `/Users/pilawski/Library/CloudStorage/Dropbox/Cursor_Projects/LifeOS_2`
**App directory:** `apps/web-vite/`
**Plan file:** `PLAN.md` — read sections 1.1, 1.2, and 1.3 in full before starting.

---

## Phase A: Token Rationalization (PLAN.md 1.1)

Work exclusively in `apps/web-vite/src/tokens.css` for definitions, then do a codebase-wide replacement pass through all CSS files.

### A1. Typography Tokens

**In `tokens.css` `:root` (and mirror in `.dark`)**, add these new tokens ABOVE the existing font vars:

```css
/* Typography scale */
--text-xs: 0.75rem; /* 12px — captions, badges */
--text-sm: 0.8125rem; /* 13px — labels, helper text */
--text-base: 0.875rem; /* 14px — body text default */
--text-md: 1rem; /* 16px — emphasized body */
--text-lg: 1.125rem; /* 18px — card titles, sub-headings */
--text-xl: 1.25rem; /* 20px — section headings */
--text-2xl: 1.5rem; /* 24px — page titles */
--text-3xl: 2rem; /* 32px — hero / dashboard headings */
```

Then **search-and-replace** across ALL `.css` files under `apps/web-vite/src/`:

| Find (regex)                                                 | Replace with                  |
| ------------------------------------------------------------ | ----------------------------- |
| `font-size:\s*0\.55rem`                                      | `font-size: var(--text-xs)`   |
| `font-size:\s*0\.625rem`                                     | `font-size: var(--text-xs)`   |
| `font-size:\s*0\.65rem`                                      | `font-size: var(--text-xs)`   |
| `font-size:\s*0\.7rem`                                       | `font-size: var(--text-xs)`   |
| `font-size:\s*0\.75rem`                                      | `font-size: var(--text-xs)`   |
| `font-size:\s*0\.8rem`                                       | `font-size: var(--text-sm)`   |
| `font-size:\s*0\.8125rem`                                    | `font-size: var(--text-sm)`   |
| `font-size:\s*0\.85rem`                                      | `font-size: var(--text-sm)`   |
| `font-size:\s*0\.875rem`                                     | `font-size: var(--text-base)` |
| `font-size:\s*0\.9rem`                                       | `font-size: var(--text-base)` |
| `font-size:\s*0\.9375rem`                                    | `font-size: var(--text-base)` |
| `font-size:\s*1rem` (but NOT inside `calc()` or `em` values) | `font-size: var(--text-md)`   |
| `font-size:\s*1\.05rem`                                      | `font-size: var(--text-md)`   |
| `font-size:\s*1\.1rem`                                       | `font-size: var(--text-lg)`   |
| `font-size:\s*1\.125rem`                                     | `font-size: var(--text-lg)`   |
| `font-size:\s*1\.2rem`                                       | `font-size: var(--text-xl)`   |
| `font-size:\s*1\.25rem`                                      | `font-size: var(--text-xl)`   |
| `font-size:\s*1\.5rem`                                       | `font-size: var(--text-2xl)`  |
| `font-size:\s*1\.75rem`                                      | `font-size: var(--text-2xl)`  |
| `font-size:\s*1\.8rem`                                       | `font-size: var(--text-2xl)`  |
| `font-size:\s*2rem`                                          | `font-size: var(--text-3xl)`  |
| `font-size:\s*2\.5rem`                                       | `font-size: var(--text-3xl)`  |
| `font-size:\s*15px`                                          | `font-size: var(--text-md)`   |
| `font-size:\s*32px`                                          | `font-size: var(--text-3xl)`  |

**IMPORTANT caveats:**

- Do NOT replace font-size values inside TipTap editor content styles (`.ProseMirror h1`, `.ProseMirror h2`, etc.) that use `em` units — those are relative to the editor base and should stay as-is.
- Do NOT replace font-size values that are already using `var(--text-*)`.
- After replacement, visually verify the mapping makes sense in context (e.g., a page title should use `--text-2xl` or `--text-3xl`, not `--text-xs`).

### A2. Border Radius Tokens

**In `tokens.css`**, change `--radius-lg` from `8px` to `16px` in BOTH `:root` and `.dark`:

```css
--radius-sm: 6px; /* buttons, inputs, small elements */
--radius-md: 10px; /* cards, dropdowns, panels */
--radius-lg: 16px; /* modals, hero cards, page sections */
--radius-full: 999px; /* pills, avatars, circular elements */
```

Note: `--radius-md` changes from 8px to 10px. This is intentional to create visual progression.

Then **search-and-replace** across all `.css` files:

| Find (regex)                         | Replace with                        |
| ------------------------------------ | ----------------------------------- |
| `border-radius:\s*2px`               | `border-radius: var(--radius-sm)`   |
| `border-radius:\s*3px`               | `border-radius: var(--radius-sm)`   |
| `border-radius:\s*4px`               | `border-radius: var(--radius-sm)`   |
| `border-radius:\s*5px`               | `border-radius: var(--radius-sm)`   |
| `border-radius:\s*6px`               | `border-radius: var(--radius-sm)`   |
| `border-radius:\s*7px`               | `border-radius: var(--radius-md)`   |
| `border-radius:\s*8px`               | `border-radius: var(--radius-md)`   |
| `border-radius:\s*10px`              | `border-radius: var(--radius-md)`   |
| `border-radius:\s*12px`              | `border-radius: var(--radius-lg)`   |
| `border-radius:\s*14px`              | `border-radius: var(--radius-lg)`   |
| `border-radius:\s*16px`              | `border-radius: var(--radius-lg)`   |
| `border-radius:\s*1\.25rem`          | `border-radius: var(--radius-lg)`   |
| `border-radius:\s*1\.5rem`           | `border-radius: var(--radius-lg)`   |
| `border-radius:\s*2rem`              | `border-radius: var(--radius-lg)`   |
| `border-radius:\s*50%` (for circles) | `border-radius: var(--radius-full)` |
| `border-radius:\s*999px`             | `border-radius: var(--radius-full)` |
| `border-radius:\s*9999px`            | `border-radius: var(--radius-full)` |
| `border-radius:\s*100px`             | `border-radius: var(--radius-full)` |

**Do NOT replace:**

- `border-radius: var(--radius-*)` (already tokenized)
- `border-radius: 0` (intentional no-radius)
- `border-radius` shorthand with mixed values like `8px 8px 0 0` — convert these to use tokens for the non-zero parts: `var(--radius-md) var(--radius-md) 0 0`

Also update the legacy `--radius: 8px` to `--radius: var(--radius-md)`.

### A3. Shadow Tokens

**In `tokens.css` `:root`**, add:

```css
--shadow-sm: 0 1px 3px rgba(7, 15, 52, 0.06), 0 1px 2px rgba(7, 15, 52, 0.04);
--shadow-md: 0 4px 12px rgba(7, 15, 52, 0.08);
--shadow-lg: 0 10px 24px rgba(3, 19, 166, 0.08);
```

**In `.dark`**, add:

```css
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.15);
--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.3);
--shadow-lg: 0 12px 28px rgba(2, 6, 23, 0.5);
```

Then replace scattered `box-shadow` declarations that use inline rgba values with the appropriate token. Leave `--glow-*` and `--panel-shadow` as-is (they serve specific purposes). Update `--panel-shadow` to reference `--shadow-lg`: `--panel-shadow: var(--shadow-lg);`

### A4. Missing Color Variables

**In `tokens.css` `:root`**, add:

```css
--accent-light: rgba(3, 19, 166, 0.08);
--accent-lighter: rgba(3, 19, 166, 0.04);
--accent-darker: #020a6b;
--destructive-light: rgba(247, 21, 171, 0.1);
--destructive-foreground: #ffffff;
--success-subtle: rgba(15, 191, 74, 0.08);
--error-subtle: rgba(255, 59, 59, 0.08);
--warning-subtle: rgba(255, 214, 10, 0.1);
```

**In `.dark`**, add:

```css
--accent-light: rgba(146, 1, 203, 0.12);
--accent-lighter: rgba(146, 1, 203, 0.06);
--accent-darker: #6a01a0;
--destructive-light: rgba(247, 21, 171, 0.15);
--destructive-foreground: #ffffff;
--success-subtle: rgba(57, 255, 20, 0.1);
--error-subtle: rgba(255, 59, 59, 0.12);
--warning-subtle: rgba(255, 214, 10, 0.12);
```

### A5. Spacing — Quick Pass

Do NOT do a full codebase replacement of all spacing values (too risky for visual regressions). Instead, just add the extra tokens:

```css
--space-0: 0;
--space-10: 64px;
--space-12: 80px;
```

to both `:root` and `.dark`. The spacing migration will be done incrementally as components are touched in later phases.

---

## Phase B: Dark Mode Fixes (PLAN.md 1.2)

### B1. Eliminate Hardcoded `white` / `#fff` Backgrounds

Search for and fix these specific known issues:

1. **`globals.css` lines with `background: white`** — Replace with `background: var(--card)` or `background: var(--background-secondary)` depending on context.
2. **`AgentCard.css:157`** — `background: white` → `background: var(--card)`
3. **`WhatsAppSettingsPanel.css:150`** — `background: white` → `background: var(--card)`

Run: `grep -rn "background:\s*white\|background:\s*#fff[^f]\|background:\s*#ffffff" apps/web-vite/src/ --include="*.css"` to find any others.

### B2. Eliminate Hardcoded Text Colors

Run: `grep -rn "color:\s*#[0-9a-fA-F]\|color:\s*white\|color:\s*black" apps/web-vite/src/ --include="*.css"` and replace each with the appropriate semantic variable:

- `color: #070f34` or similar dark → `color: var(--foreground)`
- `color: #fff` / `color: white` → `color: var(--foreground)` or `var(--accent-foreground)` depending on context (is it on a dark surface like a button? then `--accent-foreground`)
- `color: #6e77a6` or similar gray → `color: var(--muted-foreground)`

**Exception:** Colors inside tokens.css itself are definitions, not usages — leave those.

### B3. Fix `--panel-sheen` in Dark Mode

In `tokens.css`, change `.dark` `--panel-sheen` from `none` to:

```css
--panel-sheen: linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent 45%);
```

This gives dark mode cards a subtle depth instead of being completely flat.

### B4. Inline Style Hardcoded Colors in TSX

Run: `grep -rn "style={{" apps/web-vite/src/ --include="*.tsx" | grep -i "color:\s*['\"]#"` to find inline hardcoded colors in JSX. For each one, evaluate if it can be replaced with a CSS variable reference (e.g., `color: 'var(--muted-foreground)'`). Replace where safe. Skip dynamic/computed colors (e.g., user-selected project colors).

---

## Phase C: Reusable UI Primitives (PLAN.md 1.3)

Create new components in `apps/web-vite/src/components/ui/`. The existing `button.tsx` is the only file there currently. Create a corresponding CSS file for each in `apps/web-vite/src/styles/components/ui/` or co-locate it next to the component.

### C1. `<Modal>` — `components/ui/Modal.tsx` + `styles/components/ui/Modal.css`

```tsx
// Props interface
interface ModalProps {
  open: boolean
  onClose: () => void
  size?: 'sm' | 'md' | 'lg' | 'xl' // sm=480px, md=640px, lg=800px, xl=1024px
  title: string
  subtitle?: string
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}
```

**Implementation requirements:**

- Renders a portal to `document.body` (use `createPortal`)
- Overlay: `position: fixed; inset: 0; background: var(--overlay); backdrop-filter: blur(4px); z-index: 1000`
- Content: centered, `max-height: 90vh; overflow-y: auto`, `background: var(--card)`, `border: 1px solid var(--border)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-lg)`
- Header: flex row with title (left) and close button X (right), `border-bottom: 1px solid var(--border)`, `padding: var(--space-5)`
- Body: `padding: var(--space-5); flex: 1; overflow-y: auto`
- Footer (sticky): `border-top: 1px solid var(--border); padding: var(--space-4) var(--space-5); display: flex; justify-content: flex-end; gap: var(--space-3)`
- Close on Escape key (`useEffect` with `keydown` listener)
- Close on overlay click (but NOT on content click — use `stopPropagation`)
- Focus trap: on open, focus the close button; on close, restore previous focus
- Animations: overlay fades in (opacity 0→1), content slides up (translateY(8px)→0 + opacity)
- Use `--motion-standard` for animation timing
- When `open` is false, render nothing (unmount, don't just hide)
- **Do NOT use any external library** — keep it vanilla React

**CSS structure:**

```css
.ui-modal-overlay { ... }
.ui-modal-content { ... }
.ui-modal-content--sm { max-width: 480px; }
.ui-modal-content--md { max-width: 640px; }
.ui-modal-content--lg { max-width: 800px; }
.ui-modal-content--xl { max-width: 1024px; }
.ui-modal-header { ... }
.ui-modal-title { ... }
.ui-modal-subtitle { ... }
.ui-modal-close { ... }
.ui-modal-body { ... }
.ui-modal-footer { ... }
```

Prefix all classes with `ui-modal-` to avoid collisions with existing `.modal-*` classes.

### C2. `<Card>` — `components/ui/Card.tsx` + `styles/components/ui/Card.css`

```tsx
interface CardProps {
  children: React.ReactNode
  header?: React.ReactNode
  footer?: React.ReactNode
  compact?: boolean // reduces padding
  interactive?: boolean // adds hover effect
  className?: string
  onClick?: () => void
  as?: 'div' | 'article' | 'section'
}
```

**Implementation:**

- `background: var(--card)`, `border: 1px solid var(--border)`, `border-radius: var(--radius-lg)`, `box-shadow: var(--shadow-md)`, `background-image: var(--panel-sheen)`
- Default padding: `var(--space-5)`. Compact: `var(--space-3) var(--space-4)`.
- When `interactive`: on hover `border-color: var(--accent)`, `box-shadow: var(--shadow-md), 0 0 0 1px var(--accent-subtle)`, `cursor: pointer`. Transition with `--motion-fast`.
- Header: `padding-bottom: var(--space-3); border-bottom: 1px solid var(--border); margin-bottom: var(--space-4)`. Only renders if `header` prop provided.
- Footer: `padding-top: var(--space-3); border-top: 1px solid var(--border); margin-top: var(--space-4)`.
- `as` prop controls the HTML element (default `div`).
- If `onClick` is provided, set `interactive` to true automatically.

### C3. `<FormField>` — `components/ui/FormField.tsx` + `styles/components/ui/FormField.css`

```tsx
interface FormFieldProps {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  helperText?: string
  children: React.ReactNode
  className?: string
}
```

Also create:

```tsx
// components/ui/Input.tsx
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean
}

// components/ui/Textarea.tsx
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean
}
```

**Implementation:**

- `FormField` wraps a label + child + error/helper in a `.ui-form-field` container.
- Label: `font-size: var(--text-sm); font-weight: 500; color: var(--foreground); margin-bottom: var(--space-1)`. Required indicator: red asterisk.
- Error message: `font-size: var(--text-xs); color: var(--error); margin-top: var(--space-1)`.
- Helper text: `font-size: var(--text-xs); color: var(--muted-foreground); margin-top: var(--space-1)`.
- `Input` and `Textarea` should match existing `.form-group input` styling from `globals.css` but as standalone components: `padding: 0.625rem 1rem; min-height: 40px; border: 1px solid var(--border-strong); background: var(--background-tertiary); border-radius: var(--radius-md); color: var(--foreground); font-size: var(--text-base)`. When `error` prop: `border-color: var(--error)`. Focus: `border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-subtle)`.
- Forward refs on Input and Textarea.

### C4. `<Tabs>` — `components/ui/Tabs.tsx` + `styles/components/ui/Tabs.css`

```tsx
interface TabItem {
  id: string
  label: string
  icon?: React.ReactNode
}

interface TabsProps {
  tabs: TabItem[]
  activeTab: string
  onChange: (tabId: string) => void
  children: React.ReactNode // the active tab panel content
  className?: string
}
```

**Implementation:**

- Tab list: `display: flex; gap: 0; border-bottom: 1px solid var(--border)`.
- Each tab button: `padding: var(--space-2) var(--space-4); font-size: var(--text-sm); font-weight: 500; color: var(--muted-foreground); background: none; border: none; cursor: pointer; position: relative; min-height: 40px`.
- Active tab: `color: var(--foreground); font-weight: 600`. Underline: `::after { content: ''; position: absolute; bottom: -1px; left: 0; right: 0; height: 2px; background: var(--accent); }`.
- Hover: `color: var(--foreground)`.
- ARIA: `role="tablist"` on container, `role="tab"` + `aria-selected` on buttons, `role="tabpanel"` on content area.
- Keyboard: Left/Right arrow keys move between tabs. Home/End jump to first/last.

### C5. `<Badge>` — `components/ui/Badge.tsx` + `styles/components/ui/Badge.css`

```tsx
type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'outline'
  | 'work'
  | 'projects'
  | 'life'
  | 'learning'
  | 'wellbeing'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md'
}
```

**Implementation:**

- Base: `display: inline-flex; align-items: center; padding: 2px 8px; border-radius: var(--radius-full); font-size: var(--text-xs); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; line-height: 1.4; white-space: nowrap`.
- `sm` size: `padding: 1px 6px; font-size: 0.625rem`.
- Variants map to existing token colors:
  - `default`: `bg: var(--muted), color: var(--foreground)`
  - `success`: `bg: var(--success-light), color: var(--success-color)`
  - `warning`: `bg: var(--warning-light), color: var(--warning-color)`
  - `error`: `bg: var(--error-light), color: var(--error-color)`
  - `info`: `bg: var(--info-light), color: var(--info-color)`
  - `outline`: `bg: transparent, color: var(--foreground), border: 1px solid var(--border)`
  - `work`: `bg: var(--domain-work-bg), color: var(--domain-work-text)`
  - `projects`: `bg: var(--domain-projects-bg), color: var(--domain-projects-text)`
  - `life`: `bg: var(--domain-life-bg), color: var(--domain-life-text)`
  - `learning`: `bg: var(--domain-learning-bg), color: var(--domain-learning-text)`
  - `wellbeing`: `bg: var(--domain-wellbeing-bg), color: var(--domain-wellbeing-text)`

### C6. `<EmptyState>` — `components/ui/EmptyState.tsx` + `styles/components/ui/EmptyState.css`

```tsx
interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode // e.g., a button
  hint?: string // e.g., "Press ⌘N to create a new note"
  className?: string
}
```

**Implementation:**

- Centered flex column, `padding: var(--space-8) var(--space-5)`.
- Icon: `font-size: 3rem; color: var(--muted-foreground); margin-bottom: var(--space-4); opacity: 0.5`.
- Title: `font-size: var(--text-lg); font-weight: 600; color: var(--foreground); margin-bottom: var(--space-2)`.
- Description: `font-size: var(--text-base); color: var(--muted-foreground); max-width: 400px; text-align: center`.
- Action: `margin-top: var(--space-5)`.
- Hint: `margin-top: var(--space-3); font-size: var(--text-xs); color: var(--muted-foreground); font-family: var(--font-mono)`.

### C7. `<PageHeader>` — `components/ui/PageHeader.tsx` + `styles/components/ui/PageHeader.css`

```tsx
interface PageHeaderProps {
  title: string
  subtitle?: string
  actions?: React.ReactNode // right-aligned buttons
  breadcrumb?: React.ReactNode
  className?: string
}
```

**Implementation:**

- Title: `font-size: var(--text-2xl); font-weight: 700; color: var(--foreground)`.
- Subtitle: `font-size: var(--text-base); color: var(--muted-foreground); margin-top: var(--space-1)`.
- Layout: flex row, title/subtitle on left, actions on right, `align-items: flex-start`.
- `margin-bottom: var(--space-5)` to space from content below.

### C8. `<DropdownMenu>` — `components/ui/DropdownMenu.tsx` + `styles/components/ui/DropdownMenu.css`

```tsx
interface DropdownMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}

interface DropdownMenuProps {
  trigger: React.ReactNode
  items: DropdownMenuItem[]
  align?: 'start' | 'end'
  className?: string
}
```

**Implementation:**

- Use Radix `@radix-ui/react-dropdown-menu` (already a project dependency via Select).
- Menu content: `background: var(--card); border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-1); box-shadow: var(--shadow-lg); min-width: 180px`.
- Menu item: `padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); font-size: var(--text-sm); cursor: pointer; display: flex; align-items: center; gap: var(--space-2)`.
- Hover: `background: var(--background-tertiary)`.
- Danger item: `color: var(--error)`.
- Disabled: `opacity: 0.5; pointer-events: none`.
- Animation: slide-down with fade, `--motion-fast` timing.
- Separator: `height: 1px; background: var(--border); margin: var(--space-1) 0`.

**Check if Radix dropdown is already installed:** `grep "@radix-ui/react-dropdown-menu" apps/web-vite/package.json`. If not, install it: `cd apps/web-vite && pnpm add @radix-ui/react-dropdown-menu`.

---

## Phase D: Create Index Barrel Export

Create `apps/web-vite/src/components/ui/index.ts`:

```ts
export { Button } from './button'
export { Modal } from './Modal'
export { Card } from './Card'
export { FormField } from './FormField'
export { Input } from './Input'
export { Textarea } from './Textarea'
export { Tabs } from './Tabs'
export { Badge } from './Badge'
export { EmptyState } from './EmptyState'
export { PageHeader } from './PageHeader'
export { DropdownMenu } from './DropdownMenu'
```

---

## Phase E: Refactor 3 Existing Modals to Prove `<Modal>`

Pick these 3 modals and refactor them to use the new `<Modal>` component:

1. **`components/TaskFormModal.tsx`** — the most-used modal, medium complexity
2. **`components/contacts/ContactFormModal.tsx`** — validates contact forms work
3. **`components/training/ExerciseFormModal.tsx`** — validates training domain

For each modal:

- Replace the custom overlay/content/header/close/footer markup with `<Modal>`.
- Keep all form logic, state, and handlers unchanged.
- The modal's internal content (form fields) goes as `children`.
- The action buttons (Cancel, Save) go in the `footer` prop.
- Import the `title` and `onClose` from existing props.
- Remove any custom modal CSS classes that are now handled by `<Modal>` (overlay, content positioning, header, footer).
- Keep form-specific CSS (field layout, sections, etc.).

---

## Verification & Quality Gates

### After each phase, run:

```bash
# Typecheck — must pass with zero errors
cd apps/web-vite && pnpm typecheck

# Lint — must pass (fix any auto-fixable issues)
cd apps/web-vite && pnpm lint --fix

# Tests — must pass
cd apps/web-vite && pnpm test

# Build — must succeed
cd apps/web-vite && pnpm build
```

Fix any failures before proceeding to the next phase.

### Write tests for new UI primitives:

Create `apps/web-vite/src/components/ui/__tests__/` with:

1. **`Modal.test.tsx`**:
   - Renders when `open={true}`, does not render when `open={false}`
   - Displays title and subtitle
   - Calls `onClose` when Escape is pressed
   - Calls `onClose` when overlay is clicked
   - Does NOT call `onClose` when content is clicked
   - Renders footer content
   - Applies size classes correctly

2. **`Card.test.tsx`**:
   - Renders children
   - Renders header and footer when provided
   - Applies `compact` class
   - Applies `interactive` class and handles onClick
   - Renders correct HTML element via `as` prop

3. **`Badge.test.tsx`**:
   - Renders children text
   - Applies variant classes for each variant
   - Applies size class

4. **`Tabs.test.tsx`**:
   - Renders all tab labels
   - Marks active tab with aria-selected
   - Calls onChange when a tab is clicked
   - Supports keyboard navigation (ArrowLeft, ArrowRight)

5. **`FormField.test.tsx`**:
   - Renders label text
   - Shows required indicator when required
   - Shows error message when error prop provided
   - Shows helper text
   - Renders children (input)

Use `vitest` + `@testing-library/react`. Match the existing test patterns in the project (check `apps/web-vite/src/components/TopNav.test.tsx` for style reference).

---

## Final Steps: Code Review & Commit

After ALL phases are complete and all checks pass:

1. **Self-review:**
   - Verify no console warnings about undefined CSS variables
   - Verify the build output size hasn't increased by more than 5KB (the new components should be small)
   - Grep to confirm no `background: white` or `background: #fff` remain in CSS files (except tokens.css definitions)
   - Verify all new components export correctly from the barrel file

2. **Commit the work as a SINGLE commit:**

```
feat(design-system): rationalize tokens, fix dark mode, add UI primitives

- Rationalize typography to 8-token scale (--text-xs through --text-3xl)
- Fix border-radius scale: sm=6px, md=10px, lg=16px, full=999px
- Add shadow tokens (--shadow-sm, --shadow-md, --shadow-lg)
- Add missing color variables (accent-light, destructive-light, etc.)
- Eliminate all hardcoded white/black colors in CSS (dark mode fix)
- Add subtle panel-sheen for dark mode depth
- Create 8 reusable UI primitives: Modal, Card, FormField, Input,
  Textarea, Tabs, Badge, EmptyState, PageHeader, DropdownMenu
- Refactor TaskFormModal, ContactFormModal, ExerciseFormModal to use <Modal>
- Add tests for all new UI primitives

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

---

## Key Constraints

- **Do NOT break existing functionality.** This is a refactor, not a rewrite. Every page should look the same or better after changes.
- **Work incrementally.** Complete Phase A, verify, then Phase B, verify, etc.
- **Be careful with regex replacements.** Always check a few results before doing mass replacements. If a value appears in a context that doesn't make sense (e.g., a padding value being matched by a font-size regex), skip it.
- **Co-locate or don't split.** Put new component CSS either next to the component as `ComponentName.css` OR in `styles/components/ui/`. Pick one pattern and be consistent. Recommendation: co-locate in `components/ui/` since these are foundational primitives.
- **Preserve all existing CSS classes.** The old `.modal-overlay`, `.modal-content`, etc. classes in `globals.css` must stay — other modals still use them. Only the 3 refactored modals should switch to the new `<Modal>`.
