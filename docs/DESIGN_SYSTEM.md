# LifeOS Design System

## Overview

The LifeOS design system follows a **Refined Minimalist** aesthetic that balances warmth with modern professionalism. This document outlines the design principles, tokens, and component patterns used throughout the application.

## Design Principles

1. **Refined Minimalism** - Clean, purposeful design without unnecessary decoration
2. **Information Density** - Maximize useful content while maintaining readability
3. **Consistent Hierarchy** - Clear visual relationships between elements
4. **Accessibility First** - WCAG compliant color contrasts and keyboard navigation
5. **Dark Mode Support** - Thoughtful theming for both light and dark environments

## Design Tokens

Design tokens live as CSS custom properties in [`/apps/web-vite/src/theme.css`](../apps/web-vite/src/theme.css) and are consumed by [`/apps/web-vite/src/globals.css`](../apps/web-vite/src/globals.css).

### Color Palette

#### Light Theme
```css
--background: #f6f4ef      /* Warm off-white background */
--foreground: #111218      /* Dark text */
--muted: #f0efe9          /* Muted backgrounds */
--muted-foreground: #4b4a49 /* Secondary text */
--card: #ffffff           /* Card backgrounds */
--border: #e1dfd7         /* Borders */
--primary: #445c47        /* Forest green */
--secondary: #8a7b70      /* Taupe */
```

#### Dark Theme
```css
--background: #0f1116     /* Deep dark blue-black */
--foreground: #f8fafc     /* Light text */
--muted: #16181f
--muted-foreground: #a1a3ab
--card: #1a1c25
--border: #2b2f3b
--primary: #7aa57d        /* Lighter forest green */
--secondary: #5c6472
```

#### Status Colors
```css
--status-accepted: #48bb78  /* Green */
--status-tentative: #f6ad55 /* Orange */
--status-declined: #ff6b6b  /* Red */
--status-pending: #a0aec0   /* Gray */
```

### Typography

#### Font Family
```css
font-family: 'Inter Variable', Inter, system-ui, sans-serif
```

#### Type Scale
| Token | Size | Use Case |
|-------|------|----------|
| `text-xs` | 0.75rem (12px) | Labels, captions |
| `text-sm` | 0.875rem (14px) | Secondary text |
| `text-base` | 1rem (16px) | Body text |
| `text-lg` | 1.125rem (18px) | Emphasis |
| `text-xl` | 1.25rem (20px) | Small headings |
| `text-2xl` | 1.5rem (24px) | H3 |
| `text-3xl` | 1.875rem (30px) | H2 |
| `text-4xl` | 2.25rem (36px) | H1, Page headers |
| `text-5xl` | 3rem (48px) | Display headings |

#### Font Weights
- Normal: 400
- Medium: 500
- Semibold: 600
- Bold: 700

### Spacing

Based on an **8px baseline grid**:

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 0.25rem (4px) | Minimal gaps |
| `sm` | 0.5rem (8px) | Tight spacing |
| `md` | 0.75rem (12px) | Small spacing |
| `lg` | 1rem (16px) | Base spacing |
| `xl` | 1.25rem (20px) | Medium spacing |
| `2xl` | 1.5rem (24px) | Large spacing |
| `3xl` | 2rem (32px) | Section spacing |
| `4xl` | 2.5rem (40px) | Extra large |
| `5xl` | 3rem (48px) | Hero spacing |
| `6xl` | 4rem (64px) | Maximum spacing |

### Border Radius

**Refined approach** - reduced from pill shapes to modern corners:

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | 0.375rem (6px) | Small elements |
| `default` | 0.5rem (8px) | Buttons, inputs |
| `md` | 0.75rem (12px) | Medium cards |
| `lg` | 1rem (16px) | Large cards |
| `xl` | 1.25rem (20px) | Extra large cards |
| `2xl` | 1.5rem (24px) | Hero sections |
| `full` | 9999px | Pills (use sparingly) |

### Shadows

Elevation system for depth:

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05)
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1)
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1)
--shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.1)
--shadow-2xl: 0 25px 50px rgba(0, 0, 0, 0.25)
```

## Component Patterns

### Cards

```css
.card {
  border-radius: 1rem;           /* Refined from 2rem */
  border: 1px solid var(--border);
  background: var(--card);
  padding: 1.5rem;               /* Consistent padding */
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}
```

### Buttons

```css
/* Primary Button */
.btn-primary {
  border-radius: 0.5rem;         /* Refined from 999px */
  padding: 0.625rem 1rem;
  background: var(--primary);
  color: var(--primary-foreground);
  font-size: 0.875rem;
  font-weight: 500;
}

/* Ghost Button */
.btn-ghost {
  border-radius: 0.5rem;
  padding: 0.625rem 1rem;
  border: 1px solid var(--border);
  background: transparent;
}
```

### Section Labels

Consistent uppercase labels throughout the app:

```css
.section-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted-foreground);
}
```

### Priority Badges

Semantic color coding for task priorities:

```css
/* P1 - Critical */
.priority-badge-p1 {
  background: rgba(239, 68, 68, 0.1);
  color: #dc2626;
}

/* P2 - High */
.priority-badge-p2 {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

/* P3 - Normal */
.priority-badge-p3 {
  background: rgba(234, 179, 8, 0.1);
  color: #ca8a04;
}
```

## Layout System

### Container Widths

```css
--content-width-sm: 640px   /* Forms, reading */
--content-width-md: 768px   /* Articles */
--content-width-lg: 1024px  /* Dashboards */
--content-width-xl: 1280px  /* Wide layouts */
```

### Grid Patterns

**Responsive Two-Column:**
```css
grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
gap: 1.5rem;
```

**Stats Grid:**
```css
grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
gap: 1.5rem;
```

## Page-Specific Components

### Today Page

#### Inspiration Card
- **Purpose**: Daily motivational quotes
- **Height**: ~120px (50% reduction from original "Stay centered")
- **Features**: Rotating quotes, date/time/location header
- **Border radius**: 1rem

#### Calendar Preview
- **Layout**: Event time (8rem width) + Event info (flex 1)
- **Spacing**: 0.75rem gaps between items
- **Hover**: Subtle background color change

#### Task List
- **Features**: Priority legend with color dots
- **Interactive**: Checkboxes for completion
- **Priority badges**: P1 (red), P2 (orange), P3 (yellow)

#### Stats Grid
- **Metrics**: Meetings, Free Time, Utilization
- **Layout**: 3 columns on desktop, responsive on mobile
- **Typography**: 2.25rem values, 0.75rem labels

### Calendar Page

- Event cards with hover states
- Month view grid (7 columns)
- Attendee lists with status indicators
- Recurrence indicators

### Common Patterns

#### Hover States
```css
transition: background 0.15s ease;
```
```css
:hover {
  background: var(--muted);
}
```

#### Focus States
```css
:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

## Accessibility

### Color Contrast
- All text meets WCAG AA standards (4.5:1 for normal text)
- Interactive elements have clear focus indicators
- Status colors are distinguishable even without color

### Keyboard Navigation
- All interactive elements are keyboard accessible
- Focus indicators are clearly visible
- Tab order follows logical flow

### Screen Readers
- Semantic HTML5 elements
- ARIA labels on interactive components
- Alternative text for icons

## Animation & Transitions

### Duration
```typescript
fast: 150ms    /* Micro-interactions */
normal: 200ms  /* Standard transitions */
slow: 300ms    /* Page transitions */
```

### Easing
```css
default: cubic-bezier(0.4, 0, 0.2, 1)  /* Ease in-out */
```

## Migration from Previous Design

### Key Changes

1. **Border Radius**: Reduced from 2rem/999px to 0.5-1rem range
2. **Typography**: Simplified from 12+ sizes to 9 sizes
3. **Spacing**: Standardized to 8px baseline grid
4. **Shadows**: Reduced from heavy (25px) to subtle (1-3px)
5. **Information Density**: +30% more content above fold

### Before & After

| Element | Before | After | Improvement |
|---------|--------|-------|-------------|
| Hero card | 240px height | 120px height | 50% space savings |
| Button radius | 999px (pill) | 8px | More professional |
| Card radius | 2rem (32px) | 1rem (16px) | Modern, refined |
| Card padding | Varies (32-48px) | 1.5rem (24px) | Consistent |
| Font sizes | 12 sizes | 9 sizes | Simpler hierarchy |

## Usage Examples

### Creating a New Card Component

```tsx
<div className="card">
  <h2 className="section-label">Section Title</h2>
  <div className="mt-4 space-y-3">
    {/* Card content */}
  </div>
</div>
```

### Adding a Priority Badge

```tsx
<span className={`priority-badge priority-badge-p${priority}`}>
  P{priority}
</span>
```

### Creating a Stats Display

```tsx
<div className="stat-card">
  <p className="stat-label">Label</p>
  <p className="stat-value">42</p>
  <p className="stat-description">Description</p>
</div>
```

## Design System Maintenance

### Adding New Components
1. Define component styles in `globals.css` under appropriate section
2. Add or adjust tokens in `theme.css` if needed
3. Document the component in this file
4. Ensure dark mode support

### Modifying Tokens
1. Update values in `theme.css`
2. Update CSS usage in `globals.css` if needed
3. Test in both light and dark modes
4. Update this documentation

## Future Improvements

- [ ] Add component library (shadcn/ui integration)
- [ ] Migrate to Tailwind CSS v4 for better DX
- [ ] Add animation library for micro-interactions
- [ ] Create Figma design system file
- [ ] Add Storybook for component showcase
- [ ] Implement design tokens in JSON for cross-platform use

## Resources

- [Inter Font](https://rsms.me/inter/)
- [Color Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [8-Point Grid System](https://spec.fm/specifics/8-pt-grid)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
