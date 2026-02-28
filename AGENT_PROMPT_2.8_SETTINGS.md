# Agent Prompt — Task 2.8: Settings — Organized Sections

> **Scope:** Replace the current single-column scroll with a sidebar + content layout, improve the API key UX with reveal/test patterns, and clean up visual grouping.

---

## 0. Context & References

| Item                        | Path (relative to repo root)                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Design tokens**           | `apps/web-vite/src/tokens.css`                                                                                   |
| **UI primitives**           | `apps/web-vite/src/components/ui/`                                                                               |
| **SettingsPage**            | `apps/web-vite/src/pages/SettingsPage.tsx` (~1,281 lines)                                                        |
| **ModelSettingsPage**       | `apps/web-vite/src/pages/ModelSettingsPage.tsx` (311 lines)                                                      |
| **AIToolSettingsPage**      | `apps/web-vite/src/pages/AIToolSettingsPage.tsx` (532 lines)                                                     |
| **CalendarSettingsPanel**   | `apps/web-vite/src/components/CalendarSettingsPanel.tsx` (464 lines)                                             |
| **SlackAppSettingsPanel**   | `apps/web-vite/src/components/settings/SlackAppSettingsPanel.tsx`                                                |
| **SlackConnectionsPanel**   | `apps/web-vite/src/components/settings/SlackConnectionsPanel.tsx`                                                |
| **ChannelConnectionsPanel** | `apps/web-vite/src/components/settings/ChannelConnectionsPanel.tsx`                                              |
| **Hooks**                   | `useAiProviderKeys`, `useSearchToolKeys`, `useSlackAppSettings`, `useSlackConnections`, `useAgentMemorySettings` |
| **CSS (globals)**           | `apps/web-vite/src/globals.css` — lines 6614-7474                                                                |
| **CSS (models)**            | `apps/web-vite/src/styles/pages/ModelSettingsPage.css`                                                           |

**Current layout:** Single-column scroll with 4 collapsible `<details>` sections: Intelligence (open), Behavior, Experience, System.

**Current sections:**

1. **Intelligence** — Theme mode, Provider keys (4 cards), Search keys (4 cards), Memory span, Links to Model/AI Tools pages
2. **Behavior** — Workflow defaults (minimal)
3. **Experience** — Daily quotes (full CRUD + search + pagination)
4. **System** — SystemStatus, CalendarSettingsPanel, ChannelConnectionsPanel

---

## Phase A — Sidebar Navigation Layout

### A1. Replace Collapsible Sections with Sidebar

In `SettingsPage.tsx`, restructure from:

```
<details> Intelligence </details>
<details> Behavior </details>
<details> Experience </details>
<details> System </details>
```

To:

```
<div className="settings-layout">
  <aside className="settings-sidebar">
    <nav>
      <button onClick={() => scrollTo('general')}>General</button>
      <button onClick={() => scrollTo('ai-providers')}>AI Providers</button>
      <button onClick={() => scrollTo('search-tools')}>Search Tools</button>
      <button onClick={() => scrollTo('calendar')}>Calendar</button>
      <button onClick={() => scrollTo('channels')}>Channels</button>
      <button onClick={() => scrollTo('quotes')}>Quotes</button>
      <button onClick={() => scrollTo('system')}>System</button>
    </nav>
  </aside>
  <main className="settings-content">
    <section id="general">...</section>
    <section id="ai-providers">...</section>
    <section id="search-tools">...</section>
    <section id="calendar">...</section>
    <section id="channels">...</section>
    <section id="quotes">...</section>
    <section id="system">...</section>
  </main>
</div>
```

### A2. Sidebar Scroll-Spy

Track the active section via IntersectionObserver:

```tsx
const [activeSection, setActiveSection] = useState('general')

useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id)
        }
      }
    },
    { rootMargin: '-20% 0px -60% 0px' }
  )

  const sections = document.querySelectorAll('.settings-content section[id]')
  sections.forEach((s) => observer.observe(s))
  return () => observer.disconnect()
}, [])
```

### A3. Scroll-To Handler

```tsx
const scrollTo = (id: string) => {
  const el = document.getElementById(id)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
```

### A4. Layout CSS

```css
.settings-layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: var(--space-6);
  min-height: calc(100vh - var(--nav-height) - var(--space-8));
}

.settings-sidebar {
  position: sticky;
  top: calc(var(--nav-height) + var(--space-4));
  height: fit-content;
}

.settings-sidebar nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.settings-sidebar__link {
  display: block;
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: var(--radius-md);
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  transition: all var(--motion-fast) var(--motion-ease);
}

.settings-sidebar__link:hover {
  background: var(--background-tertiary);
  color: var(--foreground);
}

.settings-sidebar__link--active {
  background: var(--accent-subtle);
  color: var(--accent);
  font-weight: 500;
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  max-width: 800px;
}

.settings-content section {
  scroll-margin-top: calc(var(--nav-height) + var(--space-4));
}

/* Mobile: sidebar becomes dropdown */
@media (max-width: 768px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }

  .settings-sidebar {
    position: static;
    border-bottom: 1px solid var(--border);
    padding-bottom: var(--space-3);
  }

  .settings-sidebar nav {
    flex-direction: row;
    overflow-x: auto;
    gap: 0;
  }

  .settings-sidebar__link {
    white-space: nowrap;
    padding: var(--space-1) var(--space-3);
  }
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — API Key UX Improvements

### B1. Masked Display with Reveal Toggle

Replace the current password inputs with a reveal/hide pattern:

```tsx
const [revealed, setRevealed] = useState<Record<string, boolean>>({})

// For each provider card:
;<div className="api-key-field">
  <div className="api-key-field__display">
    {providerKeys[keyField] ? (
      revealed[provider] ? (
        providerKeys[keyField]
      ) : (
        `${'•'.repeat(8)}${providerKeys[keyField]!.slice(-4)}`
      )
    ) : (
      <span className="api-key-field__empty">Not configured</span>
    )}
  </div>
  {providerKeys[keyField] && (
    <button
      className="ghost-button api-key-field__reveal"
      onClick={() => setRevealed((r) => ({ ...r, [provider]: !r[provider] }))}
    >
      {revealed[provider] ? 'Hide' : 'Reveal'}
    </button>
  )}
</div>
```

### B2. Test Connection Button

For search tools (already partially implemented), ensure all 4 tools have a "Test" button that:

1. Calls the existing `testSearchToolKey()` function
2. Shows a pass/fail indicator with timestamp

For AI providers, add a similar "Test" button that pings the provider API.

### B3. Visual Grouping

Ensure AI Providers and Search Tools are clearly grouped:

```tsx
<section id="ai-providers">
  <h2 className="settings-section__title">AI Providers</h2>
  <p className="settings-section__description">Configure API keys for AI model providers.</p>
  <div className="provider-grid">
    {/* 4 provider cards: OpenAI, Anthropic, Google, xAI */}
  </div>
  <div className="settings-section__links">
    <Link to="/settings/models">Model Settings →</Link>
    <Link to="/settings/ai-tools">AI Tool Settings →</Link>
  </div>
</section>

<section id="search-tools">
  <h2 className="settings-section__title">Search Tools</h2>
  <p className="settings-section__description">API keys for web search and content extraction.</p>
  <div className="provider-grid">
    {/* 4 tool cards: Serper, Firecrawl, Exa, Jina */}
  </div>
</section>
```

### B4. API Key Field CSS

```css
.api-key-field {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--background-tertiary);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.api-key-field__display {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.api-key-field__empty {
  color: var(--text-tertiary);
  font-style: italic;
}

.api-key-field__reveal {
  font-size: var(--text-xs);
  padding: var(--space-1) var(--space-2);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Section Content Cleanup

### C1. General Section

The "General" section contains:

- Theme mode toggle (Light/Dark/Auto)
- Memory span configuration
- These were previously under "Intelligence" — keep the same content, just in the new section.

### C2. Merge ModelSettings and AITools links

Below the AI Providers card grid, add prominent links to the sub-pages:

```tsx
<div className="settings-links">
  <Link to="/settings/models" className="settings-link-card">
    <h4>Model Settings</h4>
    <p>Configure which AI models to use for each provider</p>
  </Link>
  <Link to="/settings/ai-tools" className="settings-link-card">
    <h4>AI Tool Settings</h4>
    <p>Customize system prompts and parameters for AI tools</p>
  </Link>
</div>
```

### C3. System Section Simplification

The System section shows:

- System status (version, last deploy, etc.)
- Links to Calendar settings and Channel connections
- Keep these compact. The detailed Calendar/Channel panels should be in their own sections.

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

Create `apps/web-vite/src/pages/__tests__/SettingsPage.test.tsx`:

1. **Renders sidebar** — Verify 7 sidebar links render
2. **Active section highlights** — Mock IntersectionObserver → verify active class applied
3. **Scroll-to works** — Click sidebar link → verify `scrollIntoView` called
4. **API key masked** — With saved key → verify masked display (••••abc)
5. **Reveal toggle** — Click "Reveal" → full key shown
6. **Mobile layout** — At 768px, sidebar becomes horizontal scroll

---

## Commit

```
feat(settings): add sidebar navigation, improve API key UX

- Replace collapsible single-column with sidebar + content layout
- Sidebar with scroll-spy active section highlighting
- Mobile: sidebar becomes horizontal scrollable tabs
- API keys show masked value with Reveal/Hide toggle
- Test connection button with pass/fail indicator
- Clear visual grouping: AI Providers, Search Tools, Calendar, Channels

Co-Authored-By: Claude <noreply@anthropic.com>
```
