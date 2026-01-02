# LifeOS Design System

## Overview

The LifeOS design system now follows the **Scandinavian calm × Cyberpunk intelligence** aesthetic: quiet power, intentionality, and clarity. It prioritizes structured hierarchy and an accent-driven focus over decoration.

**Core metaphor:** AI-native personal operating system
**Emotional tone:** Calm, precise, slightly dangerous
**Anti-goals:** Playful, decorative, loud, gamer, neon-heavy

## Design Principles

1. Calm beats clever
2. White space > borders > shadows
3. Accent color reserved for primary actions and active states
4. No more than one glow per screen
5. Empty states always include a clear action

## Design Tokens

Tokens live in `apps/web-vite/src/tokens.css` and are consumed across component and page styles.

### Color Palette

**Base (High-key):**

```css
--background: #f9fafb;
--background-secondary: #f3f4f6;
--background-tertiary: #e5e7eb;
--border: #e5e7eb;
--border-strong: #d1d5db;
--foreground: #111111;
--secondary-foreground: #666666;
--muted-foreground: #999999;
```

**Accent (Cyberpunk Layer):**

```css
--accent: #00e5ff;
--accent-glow: rgba(0, 229, 255, 0.35);
--accent-subtle: rgba(0, 229, 255, 0.12);
```

**Semantic (Muted):**

```css
--success: #2dd4bf;
--warning: #fbbf24;
--error: #cc3333;
```

### Typography

```css
--font-sans: 'Satoshi', 'General Sans', 'Inter', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'IBM Plex Mono', monospace;
```

**Type scale:**

- H1: 24px / 700
- H2: 20px / 600
- H3: 18px / 600
- Body: 16px / 400
- Small: 14px / 400 (muted)
- Mono: 14px (system data)

**Rules:**

- Headings use tight tracking
- Labels use slight positive tracking
- Numbers/time/system data use monospace

### Spacing & Layout

```css
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 24px;
```

- Base grid: 8px
- Container: max 1200px, 24px padding
- Section spacing: 48px

**Layout containers:**

- Use `.page-container` on every top-level page to enforce the global max width and padding.
- Place page-specific grids (dashboards, sidebars) inside the container instead of replacing it.

## Settings IA

Settings are structured as four stacked sections to keep the control center predictable:

- **Intelligence:** provider keys + memory span defaults.
- **Behavior:** workspace defaults and baseline routines.
- **Experience:** quotes and tone adjustments.
- **System:** sync health, calendar connections, and status.

Use provider cards with a `StatusDot`, mono inputs for keys, and inline `[Save] [Clear]` actions.
Use a compact status grid for System health (Network/Auth/Latency/Bandwidth) and a card list for quotes with overflow menu actions.

### Radius

```css
--radius-md: 6px;
--radius-lg: 6px;
```

## Component Patterns

### Cards

```css
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 24px;
}

.card:hover {
  border-top-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-subtle);
}
```

### Buttons

- Primary CTAs use the accent fill; secondary actions stay muted.
- Button corners are sharper than containers (2px radius).

```css
.btn-primary {
  background: var(--accent);
  border: 1px solid var(--accent);
  color: var(--accent-foreground);
  border-radius: 2px;
}

.btn-primary:hover {
  box-shadow: 0 0 5px var(--accent);
}
```

### Navigation

```css
.top-nav {
  height: 64px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}

.top-nav__link--active {
  color: var(--foreground);
}
```

### Search

```css
.search-input {
  height: 36px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.search-input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}
```

## Microcopy Tone

- Prefer system language: “System idle”, “Waiting for input”, “Ready for sync”.
- Frame actions as capabilities: “Create workspace”, “Connect provider”, “Resume run”.
- Avoid negative phrasing like “No X found” unless paired with a next action.

## Motion

```css
--motion-fast: 120ms;
--motion-standard: 160ms;
--motion-slow: 200ms;
--motion-ease: cubic-bezier(0.2, 0, 0, 1);
```

**Rules:**

- Hover: fade + subtle glow
- Focus: single pulse, then settle
- Page load: opacity + translateY(6px)
- No bounce or spring

## Non-Negotiables

- Accent color never appears without interaction/indicator intent
- No filled accent buttons by default
- One glow per screen max
- Empty states include a clear action
- Borders preferred over shadows
