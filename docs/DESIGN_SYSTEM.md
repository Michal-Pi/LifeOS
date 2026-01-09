# LifeOS Design System

## Overview

The LifeOS design system now follows a **retro-futurist cyber + terminal** aesthetic: focused, technical, and intentional. It prioritizes clarity, grounded surfaces, and high-contrast accents that signal action and system state.

**Core metaphor:** AI-native personal operating system
**Emotional tone:** Precise, tactical, slightly electric
**Anti-goals:** Playful, decorative, noisy, neon-heavy everywhere

## Design Principles

1. Calm beats clever
2. White space > borders > shadows
3. Accent color reserved for primary actions and active states
4. No more than one glow per screen
5. Empty states always include a clear action

## Design Tokens

Tokens live in `apps/web-vite/src/tokens.css` and are consumed across component and page styles.

### Color Palette

**Core Brand Anchors:**

```css
--core-obsidian-black: #070f34;
--core-electric-navy: #0313a6;
--core-neon-violet: #9201cb;
--core-hot-magenta: #f715ab;
--core-cyber-teal: #34e5c3;
--core-terminal-green: #39ff14;
```

**Light Mode Foundations:**

```css
--background: #f6f7ff;
--background-secondary: #e8ebff;
--background-tertiary: #d2d7ff;
--foreground: #070f34;
--secondary-foreground: #313a6f;
--muted-foreground: #9aa1c7;
--border: #d2d7ff;
```

**Dark Mode Foundations:**

```css
--background: #070f34;
--background-secondary: #0c154a;
--background-tertiary: #111c66;
--foreground: #e6ebff;
--secondary-foreground: #a9b1ff;
--muted-foreground: #5c6699;
--border: #1b2a7a;
```

**Accents & Semantics (mode-specific):**

```css
--accent: #9201cb; /* Primary action in dark mode */
--accent-secondary: #f715ab;
--accent-tertiary: #34e5c3;
--success: #39ff14;
--warning: #ffd60a;
--error: #ff3b3b;
--info: #34e5c3;
--focus-ring: #39ff14;
```

**Optional Glows (use sparingly):**

```css
--glow-violet: 0 0 12px rgba(146, 1, 203, 0.6);
--glow-magenta: 0 0 12px rgba(247, 21, 171, 0.6);
--glow-green: 0 0 10px rgba(57, 255, 20, 0.7);
```

**Overlays & Shadows:**

```css
--overlay: rgba(7, 15, 52, 0.6);
--shadow-soft: rgba(7, 15, 52, 0.12);
```

**Charts:**

```css
--chart-work: #0313a6;
--chart-projects: #9201cb;
--chart-life: #34e5c3;
--chart-learning: #ffd60a;
--chart-wellbeing: #f715ab;
```

### Typography

```css
--font-sans: 'Inter', 'SF Pro Text', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'IBM Plex Mono', 'Space Mono', monospace;
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

### Dialogs & Alerts

- Never use `alert`, `confirm`, or `prompt` in UI flows.
- Use the dialog system via `useDialog` for confirmations and alerts.
- Dialog overlays use `--overlay`.

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
- Primary CTA uses neon violet, secondary CTA uses electric navy
- One glow per screen max
- Empty states include a clear action
- Borders preferred over shadows
