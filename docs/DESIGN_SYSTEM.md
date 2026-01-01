# LifeOS Design System

## Overview

The LifeOS design system now follows the **Quiet Cyberpunk** aesthetic: calm, precise, and slightly dangerous. It prioritizes clarity, restraint, and AI-native utility over decoration.

**Core metaphor:** AI-native personal operating system
**Emotional tone:** Calm, precise, slightly dangerous
**Anti-goals:** Playful, decorative, loud, gamer, neon-heavy

## Design Principles

1. Calm beats clever
2. White space > borders > shadows
3. Accent color only on interaction/indicators
4. No more than one glow per screen
5. Empty states always include a clear action

## Design Tokens

Tokens live in `apps/web-vite/src/globals.css` and are consumed across component and page styles.

### Color Palette

**Base (High-key):**

```css
--background: #ffffff;
--background-secondary: #f7f8fa;
--background-tertiary: #eef0f3;
--border: #e6e8eb;
--border-strong: #d1d5db;
--foreground: #0f172a;
--secondary-foreground: #475569;
--muted-foreground: #94a3b8;
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
--error: #f87171;
```

### Typography

```css
--font-sans: 'Inter', 'SF Pro Text', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'IBM Plex Mono', monospace;
```

**Type scale:**

- H1: 32px / 600 / -0.02em
- H2: 24px / 600 / -0.01em
- H3: 18px / 500
- Body: 14px / 400 / 1.6
- Small: 12px / 400 (muted)
- Mono: 12px (system data)

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

### Radius

```css
--radius-md: 10px;
--radius-lg: 16px;
```

## Component Patterns

### Cards

```css
.card {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
}

.card:hover {
  border-top-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-subtle);
}
```

### Buttons

```css
.btn-primary {
  background: transparent;
  border: 1px solid var(--accent);
  color: var(--accent);
  border-radius: 10px;
}

.btn-primary:hover {
  box-shadow: 0 0 0 3px var(--accent-subtle);
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
  border-radius: 10px;
}

.search-input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}
```

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
