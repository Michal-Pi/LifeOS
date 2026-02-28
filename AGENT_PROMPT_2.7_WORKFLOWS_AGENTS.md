# Agent Prompt — Task 2.7: Workflows & Agents — Reduce Complexity

> **Scope:** Restructure the Agents page from an endless scroll into tabs, make Workflow Detail sections collapsible, and refactor the Agent Builder modal into a stepped wizard.

---

## 0. Context & References

| Item                          | Path (relative to repo root)                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| **Design tokens**             | `apps/web-vite/src/tokens.css`                                                              |
| **UI primitives**             | `apps/web-vite/src/components/ui/`                                                          |
| **AgentsPage**                | `apps/web-vite/src/pages/AgentsPage.tsx`                                                    |
| **WorkflowDetailPage**        | `apps/web-vite/src/pages/WorkflowDetailPage.tsx`                                            |
| **AgentBuilderModal**         | `apps/web-vite/src/components/agents/AgentBuilderModal.tsx`                                 |
| **AgentCard**                 | `apps/web-vite/src/components/agents/AgentCard.tsx`                                         |
| **AgentCard CSS**             | `apps/web-vite/src/components/agents/AgentCard.css`                                         |
| **RunCard**                   | `apps/web-vite/src/components/agents/RunCard.tsx`                                           |
| **RunCard CSS**               | `apps/web-vite/src/styles/components/RunCard.css`                                           |
| **RunDetailModal**            | `apps/web-vite/src/components/agents/RunDetailModal.tsx`                                    |
| **WorkflowFormModal**         | `apps/web-vite/src/components/agents/WorkflowFormModal.tsx`                                 |
| **TemplateSelector**          | `apps/web-vite/src/components/agents/TemplateSelector.tsx`                                  |
| **WorkflowBlueprint**         | `apps/web-vite/src/components/agents/WorkflowBlueprint.tsx`                                 |
| **WorkflowBlueprint CSS**     | `apps/web-vite/src/components/agents/WorkflowBlueprint.css`                                 |
| **CustomWorkflowBuilder**     | `apps/web-vite/src/components/agents/CustomWorkflowBuilder.tsx`                             |
| **CustomWorkflowBuilder CSS** | `apps/web-vite/src/components/agents/CustomWorkflowBuilder.css`                             |
| **Hooks**                     | `useAgentOperations`, `useWorkflowOperations`, `useAgentTemplateOperations`, `useRunEvents` |
| **SegmentedControl**          | `apps/web-vite/src/components/SegmentedControl.tsx`                                         |

**Current Agents page:** Single long scroll with sections: Header → Filters → Agent Grid → Templates Section (collapsible) → Tools Section (collapsible).

**Current Workflow Detail page:** Single scroll with sections: Header → Info Cards (4-grid) → Research Queue → Run History.

**Agent Builder Modal:** Long scrolling form with 10+ fields.

---

## Phase A — Agents Page Tabbed Layout

### A1. Replace Scroll with Tabs

In `AgentsPage.tsx`, restructure the page into 3 tabs: **My Agents** | **Templates** | **Tools**.

```tsx
const [activeTab, setActiveTab] = useState<'agents' | 'templates' | 'tools'>('agents');

// Render:
<div className="agents-page">
  <div className="agents-page__header">
    <div>
      <p className="section-label">Automation</p>
      <h1>AI Agents</h1>
    </div>
    <div className="agents-page__header-actions">
      <SegmentedControl
        value={activeTab}
        options={[
          { value: 'agents', label: 'Agents/Prompts' },  // preserve existing toggle
          ...  // Keep existing Agents/Prompts toggle
        ]}
        onChange={setActiveTab}
      />
      {/* Existing Agents/Prompts SegmentedControl */}
    </div>
  </div>

  {/* Tab bar */}
  <div className="agents-page__tabs">
    <button className={`agents-page__tab ${activeTab === 'agents' ? 'agents-page__tab--active' : ''}`} onClick={() => setActiveTab('agents')}>
      My Agents <span className="agents-page__tab-count">{agents.length}</span>
    </button>
    <button className={`agents-page__tab ${activeTab === 'templates' ? 'agents-page__tab--active' : ''}`} onClick={() => setActiveTab('templates')}>
      Templates <span className="agents-page__tab-count">{templates.length}</span>
    </button>
    <button className={`agents-page__tab ${activeTab === 'tools' ? 'agents-page__tab--active' : ''}`} onClick={() => setActiveTab('tools')}>
      Tools <span className="agents-page__tab-count">{tools.length}</span>
    </button>
  </div>

  {/* Tab content */}
  {activeTab === 'agents' && <AgentsTabContent ... />}
  {activeTab === 'templates' && <TemplatesTabContent ... />}
  {activeTab === 'tools' && <ToolsTabContent ... />}
</div>
```

### A2. Agents Tab Content

The "My Agents" tab shows:

- Role and Provider filter dropdowns (existing)
- Agent count summary
- Grid of AgentCard components
- "+ New Agent" button

### A3. Templates Tab Content

The "Templates" tab shows:

- Grid of template cards
- Batch mode with checkboxes (existing)
- "Add Presets" / "Export" / "Import" buttons
- "Create from Template" CTA on each card

### A4. Tools Tab Content

The "Tools" tab shows:

- "+ New Tool" button
- Grid of tool cards (built-in vs custom distinction)
- Edit/Delete actions

### A5. Tab CSS

```css
.agents-page__tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-5);
}

.agents-page__tab {
  padding: var(--space-2) var(--space-4);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all var(--motion-fast) var(--motion-ease);
}

.agents-page__tab:hover {
  color: var(--foreground);
}

.agents-page__tab--active {
  color: var(--foreground);
  border-bottom-color: var(--accent);
}

.agents-page__tab-count {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--text-tertiary);
  margin-left: var(--space-1);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Workflow Detail Collapsible Sections

### B1. Wrap Sections in Collapsible Cards

In `WorkflowDetailPage.tsx`, each major section becomes a collapsible card:

```tsx
{/* Configuration section */}
<details className="workflow-section">
  <summary className="workflow-section__header">
    <h3>Configuration</h3>
    <span className="workflow-section__summary">{workflow.type} · {workflow.agentIds.length} agents</span>
  </summary>
  <div className="workflow-section__body">
    {/* existing configuration content */}
  </div>
</details>

{/* Runs section - open by default */}
<details className="workflow-section" open>
  <summary className="workflow-section__header">
    <h3>Runs</h3>
    <span className="workflow-section__summary">{runs.length} runs</span>
  </summary>
  <div className="workflow-section__body">
    {/* existing run history content */}
  </div>
</details>

{/* Project Manager section */}
{workflow.projectManagerEnabled && (
  <details className="workflow-section">
    <summary className="workflow-section__header">
      <h3>Project Manager</h3>
    </summary>
    <div className="workflow-section__body">
      {/* existing PM content */}
    </div>
  </details>
)}

{/* Research section */}
{researchQueue.length > 0 && (
  <details className="workflow-section">
    <summary className="workflow-section__header">
      <h3>Research</h3>
      <span className="workflow-section__summary">{pendingCount} pending</span>
    </summary>
    <div className="workflow-section__body">
      <ResearchQueue ... />
    </div>
  </details>
)}
```

### B2. Section CSS

```css
.workflow-section {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.workflow-section__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  cursor: pointer;
  list-style: none;
  transition: background var(--motion-fast) var(--motion-ease);
}

.workflow-section__header:hover {
  background: var(--background-tertiary);
}

.workflow-section__header::-webkit-details-marker {
  display: none;
}

.workflow-section__header h3 {
  font-size: var(--text-lg);
  font-weight: 600;
}

.workflow-section__summary {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  font-family: var(--font-mono);
}

.workflow-section__body {
  padding: 0 var(--space-4) var(--space-4);
  border-top: 1px solid var(--border);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Agent Builder Stepped Wizard

### C1. Refactor AgentBuilderModal into 3 Steps

In `AgentBuilderModal.tsx`, replace the single long form with a 3-step wizard:

```tsx
type WizardStep = 1 | 2 | 3
const [step, setStep] = useState<WizardStep>(1)
```

**Step 1 — Basics:**

- Agent Name (required)
- Role (select)
- System Prompt (textarea)
- Description (optional)

**Step 2 — Model & Tools:**

- AI Provider (select)
- Model Name (select)
- Temperature (range slider)
- Max Tokens (number)
- Tools (checkbox list)

**Step 3 — Review & Create:**

- Summary of all settings in a read-only view
- "Create Agent" / "Save Changes" button

### C2. Step Indicator

```tsx
<div className="wizard-steps">
  {[1, 2, 3].map((s) => (
    <div
      key={s}
      className={`wizard-step ${s === step ? 'wizard-step--active' : ''} ${s < step ? 'wizard-step--completed' : ''}`}
    >
      <span className="wizard-step__number">{s < step ? '✓' : s}</span>
      <span className="wizard-step__label">
        {s === 1 ? 'Basics' : s === 2 ? 'Model & Tools' : 'Review'}
      </span>
    </div>
  ))}
</div>
```

### C3. Navigation

```tsx
<div className="wizard-nav">
  {step > 1 && (
    <button className="ghost-button" onClick={() => setStep((step - 1) as WizardStep)}>
      Back
    </button>
  )}
  <div style={{ flex: 1 }} />
  {step < 3 ? (
    <button
      className="primary-button"
      onClick={() => setStep((step + 1) as WizardStep)}
      disabled={!isStepValid(step)}
    >
      Next
    </button>
  ) : (
    <button className="primary-button" onClick={handleSave} disabled={saving}>
      {agent ? 'Save Changes' : 'Create Agent'}
    </button>
  )}
</div>
```

### C4. Validation Per Step

```tsx
function isStepValid(step: WizardStep): boolean {
  switch (step) {
    case 1:
      return name.trim() !== '' && systemPrompt.trim() !== ''
    case 2:
      return modelName.trim() !== ''
    case 3:
      return true
  }
}
```

### C5. Wizard CSS

```css
.wizard-steps {
  display: flex;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-4);
}

.wizard-step {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--text-tertiary);
}

.wizard-step--active {
  color: var(--foreground);
  font-weight: 600;
}

.wizard-step--completed {
  color: var(--success);
}

.wizard-step__number {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full);
  border: 2px solid currentColor;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: 600;
}

.wizard-step--active .wizard-step__number {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-foreground);
}

.wizard-step--completed .wizard-step__number {
  background: var(--success);
  border-color: var(--success);
  color: white;
}

.wizard-step__label {
  font-size: var(--text-sm);
}

.wizard-nav {
  display: flex;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
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

Create `apps/web-vite/src/pages/__tests__/AgentsPage.test.tsx`:

1. **Renders 3 tabs** — Verify "My Agents", "Templates", "Tools" tabs render
2. **Default tab is agents** — Verify agent grid is visible on load
3. **Tab switching** — Click "Templates" → verify template grid appears

Create `apps/web-vite/src/components/agents/__tests__/AgentBuilderWizard.test.tsx`:

4. **Step 1 validation** — Empty name → "Next" button disabled
5. **Step navigation** — Fill step 1 → click Next → step 2 visible
6. **Back button** — On step 2, click Back → step 1 visible
7. **Review shows summary** — On step 3, all configured values displayed

---

## Commit

```
feat(agents): tabbed layout, collapsible workflow sections, wizard builder

- AgentsPage: Replace endless scroll with 3 tabs (Agents/Templates/Tools)
- WorkflowDetailPage: Collapsible card sections (only Runs open by default)
- AgentBuilderModal: 3-step wizard (Basics → Model & Tools → Review)
- Step indicator with progress and validation per step
- Back/Next navigation between wizard steps

Co-Authored-By: Claude <noreply@anthropic.com>
```
