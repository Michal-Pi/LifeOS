# Agent Prompt — Task 3.1: Conversations & Communication Hub

> **Scope:** Make the mailbox intelligent — AI-powered message triage, contextual draft replies, action item extraction from messages, and unified conversation history per contact.

---

## 0. Context & References

| Item                   | Path (relative to repo root)                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Design tokens**      | `apps/web-vite/src/tokens.css`                                                                                                                                                               |
| **UI primitives**      | `apps/web-vite/src/components/ui/`                                                                                                                                                           |
| **MailboxPage**        | `apps/web-vite/src/pages/MailboxPage.tsx`                                                                                                                                                    |
| **Message model**      | `packages/agents/src/domain/mailbox.ts` — `PrioritizedMessage`, `MessagePriority`, `MessageSource`                                                                                           |
| **Mailbox repository** | `packages/agents/src/ports/mailboxRepository.ts` — `PrioritizedMessageRepository`, `MailboxSyncRepository`                                                                                   |
| **Mailbox hook**       | `apps/web-vite/src/hooks/useMessageMailbox.ts` — `syncMailbox()`, `markAsRead()`, `dismissMessage()`                                                                                         |
| **Composer hook**      | `apps/web-vite/src/hooks/useMailboxComposer.ts` — `saveDraft()`, `send()`, `loadDrafts()`                                                                                                    |
| **Mailbox AI tools**   | `apps/web-vite/src/hooks/useMailboxAITools.ts` — `generateResponseDraft()`, `getCleanupRecommendations()`, `researchSender()`                                                                |
| **AI tools lib**       | `apps/web-vite/src/lib/mailboxAITools.ts`                                                                                                                                                    |
| **Channel adapters**   | `functions/src/channels/` — `gmailAdapter.ts`, `slackAdapter.ts`, `linkedinAdapter.ts`, etc.                                                                                                 |
| **Channel interface**  | `packages/agents/src/ports/channelAdapter.ts` — `ChannelAdapter`, `RawMessage`                                                                                                               |
| **UI components**      | `apps/web-vite/src/components/mailbox/` — `MessageMailbox.tsx`, `MailboxMessageList.tsx`, `MessageItem.tsx`, `MailboxComposer.tsx`, `MailboxMessageDetail.tsx`, `MailboxAIToolsDropdown.tsx` |
| **Contact model**      | `packages/agents/src/domain/contacts.ts` — `Contact`, `Interaction`, `SenderPersona`                                                                                                         |
| **ContactDetail**      | `apps/web-vite/src/components/contacts/ContactDetail.tsx`                                                                                                                                    |
| **CSS**                | `apps/web-vite/src/styles/components/MessageMailbox.css`, `MailboxMessageList.css`, `MailboxMessageDetail.css`, `MailboxComposer.css`                                                        |

**Current state:** Messages already have `priority` (high/medium/low), `aiSummary`, `requiresFollowUp`, and `contactId` linking. The `generateResponseDraft()` AI tool exists but is basic. No action extraction. No per-contact conversation view.

**Existing patterns to follow:**

- AI tools: lib file → `httpsCallable()` Cloud Function → hook wrapper → dropdown UI
- Firestore paths: `/users/{userId}/mailboxMessages/{messageId}`
- Drafts: `/users/{userId}/mailboxDrafts/{draftId}`

---

## Phase A — AI Message Triage

### A1. Extend Message Model with Triage Category

In `packages/agents/src/domain/mailbox.ts`, add a triage classification:

```ts
export type TriageCategory = 'urgent' | 'important' | 'fyi' | 'automated';

// Add to PrioritizedMessage:
triageCategory?: TriageCategory;
triageCategoryOverride?: TriageCategory; // User correction
triageCategoryConfidence?: number; // 0-1
```

### A2. Triage Cloud Function

Create or extend the mailbox sync Cloud Function. After AI summarization (which already runs), add a classification step:

```ts
// In functions/src/agents/ or within the sync pipeline:
async function classifyMessage(
  message: RawMessage,
  senderPersona?: SenderPersona
): Promise<TriageCategory> {
  // Prompt the AI model to classify into urgent/important/fyi/automated
  // Context: message content, sender history, user's circle for this contact
  // Return classification + confidence score
}
```

The prompt should use:

- Message content and subject
- Sender's CRM circle (Core contacts → bias toward urgent)
- Whether message contains questions, deadlines, or action words
- Whether sender is a known newsletter/automated source

### A3. User Override Persistence

When a user corrects the triage category, store it as `triageCategoryOverride` on the message doc. Future messages from the same sender should learn from these overrides.

```ts
// In useMessageMailbox hook, add:
const overrideTriageCategory = async (messageId: string, category: TriageCategory) => {
  await updateDoc(doc(db, `users/${userId}/mailboxMessages/${messageId}`), {
    triageCategoryOverride: category,
    updatedAtMs: Date.now(),
  })
}
```

### A4. Triage Badge UI

In `MessageItem.tsx`, display the triage category as a colored badge:

```tsx
const triageCategory = message.triageCategoryOverride || message.triageCategory

;<span className={`triage-badge triage-badge--${triageCategory}`}>
  {triageCategory === 'urgent'
    ? 'Urgent'
    : triageCategory === 'important'
      ? 'Important'
      : triageCategory === 'fyi'
        ? 'FYI'
        : 'Auto'}
</span>
```

### A5. Default Sort by Triage

In `MailboxMessageList.tsx`, default sort order should be: urgent → important → fyi → automated, then by recency within each group:

```ts
const TRIAGE_ORDER: Record<TriageCategory, number> = {
  urgent: 0,
  important: 1,
  fyi: 2,
  automated: 3,
}

const sortedMessages = [...messages].sort((a, b) => {
  const catA = a.triageCategoryOverride || a.triageCategory || 'fyi'
  const catB = b.triageCategoryOverride || b.triageCategory || 'fyi'
  const orderDiff = TRIAGE_ORDER[catA] - TRIAGE_ORDER[catB]
  if (orderDiff !== 0) return orderDiff
  return b.receivedAtMs - a.receivedAtMs
})
```

### A6. Triage Filter Tabs

Add filter tabs above the message list:

```tsx
const [triageFilter, setTriageFilter] = useState<TriageCategory | 'all' | 'action'>('action')

// 'action' = urgent + important
// 'all' = everything
```

```css
.triage-badge {
  padding: 1px 6px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 600;
}
.triage-badge--urgent {
  background: var(--error-light);
  color: var(--error-color);
}
.triage-badge--important {
  background: var(--warning-light);
  color: var(--warning-color);
}
.triage-badge--fyi {
  background: var(--info-light);
  color: var(--info-color);
}
.triage-badge--automated {
  background: var(--background-tertiary);
  color: var(--text-tertiary);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — AI Draft Replies

### B1. Enhance `generateResponseDraft()`

The existing `generateResponseDraft()` in `mailboxAITools.ts` needs enhancement. Extend it to accept a tone parameter and sender context:

```ts
export interface DraftReplyOptions {
  messageId: string
  tone: 'professional' | 'friendly' | 'brief'
  senderContext?: {
    circle?: DunbarCircle
    recentInteractions?: string[]
    communicationStyle?: string
  }
}

export interface DraftReplyResult {
  subject: string
  body: string
  richContent?: string // HTML for composer
  suggestedFollowUp?: string
}
```

### B2. Cloud Function Enhancement

In the Cloud Function backing `generateResponseDraft`, enrich the prompt with:

- Sender's CRM profile (circle, company, relationship)
- Recent interaction summaries (last 3)
- Sender's communication style from `SenderPersona.languageProfile`
- User's preferred tone

### B3. Tone Selector UI

In `MailboxMessageDetail.tsx`, add a "Draft Reply" section with tone selection:

```tsx
<div className="draft-reply-actions">
  <span className="draft-reply-label">Draft Reply</span>
  <div className="draft-reply-tones">
    {(['professional', 'friendly', 'brief'] as const).map((tone) => (
      <button
        key={tone}
        className={`tone-button ${selectedTone === tone ? 'tone-button--active' : ''}`}
        onClick={() => handleGenerateDraft(tone)}
        disabled={generating}
      >
        {tone.charAt(0).toUpperCase() + tone.slice(1)}
      </button>
    ))}
  </div>
</div>
```

### B4. Draft Insertion into Composer

When a draft is generated, auto-populate the `MailboxComposer` and open it:

```ts
const handleGenerateDraft = async (tone: DraftReplyOptions['tone']) => {
  setGenerating(true)
  const result = await generateResponseDraft({
    messageId: message.messageId,
    tone,
    senderContext: {
      circle: linkedContact?.circle,
      recentInteractions: recentInteractionSummaries,
      communicationStyle: senderPersona?.languageProfile?.speakingStyle,
    },
  })
  // Open composer with draft pre-filled
  openComposer({
    inReplyTo: message.messageId,
    threadId: message.threadId,
    recipientId: message.senderEmail,
    recipientName: message.sender,
    subject: result.subject,
    body: result.body,
    source: message.source,
  })
  setGenerating(false)
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Action Item Extraction

### C1. Create Action Extraction AI Tool

Add to `mailboxAITools.ts`:

```ts
export interface ExtractedAction {
  type: 'task' | 'event' | 'contact_update' | 'follow_up'
  title: string
  details?: string
  dueDate?: string // ISO string if detected
  contactName?: string
  confidence: number // 0-1
}

export async function extractActionItems(messageId: string): Promise<ExtractedAction[]> {
  const result = await httpsCallable(
    functions,
    'mailboxAITool'
  )({
    tool: 'extractActions',
    messageId,
  })
  return result.data as ExtractedAction[]
}
```

### C2. Cloud Function for Extraction

The prompt should identify:

- Tasks: "Can you send me...", "Please review...", deadlines, requests
- Events: "Let's meet...", date/time mentions, scheduling requests
- Contact updates: new email/phone, job change, company change
- Follow-ups: "I'll get back to you...", promises made by either party

### C3. Action Sidebar Panel

In `MailboxMessageDetail.tsx`, add a collapsible sidebar panel showing extracted actions:

```tsx
const [actions, setActions] = useState<ExtractedAction[]>([])
const [extracting, setExtracting] = useState(false)

// Auto-extract when viewing a message (or on-demand button)
useEffect(() => {
  if (message && !actions.length) {
    void extractActionItems(message.messageId).then(setActions)
  }
}, [message])
```

```tsx
{
  actions.length > 0 && (
    <div className="action-panel">
      <h4 className="action-panel__title">Extracted Actions</h4>
      {actions.map((action, i) => (
        <div key={i} className="action-item">
          <div className="action-item__header">
            <span className={`action-item__type action-item__type--${action.type}`}>
              {action.type === 'task'
                ? 'Task'
                : action.type === 'event'
                  ? 'Event'
                  : action.type === 'contact_update'
                    ? 'Update'
                    : 'Follow-up'}
            </span>
            <span className="action-item__title">{action.title}</span>
          </div>
          {action.details && <p className="action-item__details">{action.details}</p>}
          <button className="action-item__create" onClick={() => handleCreateAction(action)}>
            Create
          </button>
        </div>
      ))}
    </div>
  )
}
```

### C4. One-Click Creation

The "Create" button pre-fills the appropriate form:

```ts
const handleCreateAction = (action: ExtractedAction) => {
  switch (action.type) {
    case 'task':
      openTaskModal({
        title: action.title,
        dueDate: action.dueDate,
        description: `From message: ${message.subject}\nSender: ${message.sender}`,
        sourceMessageId: message.messageId,
      })
      break
    case 'event':
      openEventModal({
        title: action.title,
        description: action.details,
        // Pre-fill date/time if detected
      })
      break
    case 'follow_up':
      // Set follow-up on the linked contact
      if (linkedContact) {
        setFollowUp(linkedContact.contactId, action.dueDate)
      }
      break
    case 'contact_update':
      // Open contact edit with the update suggestion
      if (linkedContact) {
        openContactEditModal(linkedContact.contactId, action.details)
      }
      break
  }
}
```

### C5. Action Panel CSS

```css
.action-panel {
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--card);
}
.action-panel__title {
  font-size: var(--text-sm);
  font-weight: 600;
  margin-bottom: var(--space-2);
}
.action-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
  border-bottom: 1px solid var(--border);
}
.action-item:last-child {
  border-bottom: none;
}
.action-item__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.action-item__type {
  font-size: var(--text-xs);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  font-weight: 600;
}
.action-item__type--task {
  background: var(--accent-subtle);
  color: var(--accent);
}
.action-item__type--event {
  background: var(--info-light);
  color: var(--info-color);
}
.action-item__type--follow_up {
  background: var(--warning-light);
  color: var(--warning-color);
}
.action-item__type--contact_update {
  background: var(--background-tertiary);
  color: var(--text-secondary);
}
.action-item__title {
  font-size: var(--text-sm);
  font-weight: 500;
}
.action-item__details {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}
.action-item__create {
  align-self: flex-end;
  font-size: var(--text-xs);
  padding: var(--space-1) var(--space-2);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase D — Conversation History Per Contact

### D1. Add "Conversations" Tab to ContactDetail

In `ContactDetail.tsx`, add a tab that shows all messages exchanged with this contact:

```tsx
const [activeTab, setActiveTab] = useState<'overview' | 'conversations' | 'timeline'>('overview')

// Fetch messages linked to this contact
const contactMessages = useMemo(
  () =>
    allMessages
      .filter(
        (m) =>
          m.contactId === contact.contactId || m.senderEmail === contact.identifiers?.emails?.[0]
      )
      .sort((a, b) => b.receivedAtMs - a.receivedAtMs),
  [allMessages, contact]
)
```

### D2. Conversation List UI

```tsx
{
  activeTab === 'conversations' && (
    <div className="contact-conversations">
      <div className="contact-conversations__filters">
        <input
          type="text"
          placeholder="Search conversations..."
          value={convSearch}
          onChange={(e) => setConvSearch(e.target.value)}
          className="contact-conversations__search"
        />
        <div className="contact-conversations__channel-filter">
          {(['all', 'gmail', 'slack', 'linkedin'] as const).map((ch) => (
            <button
              key={ch}
              className={`filter-chip ${channelFilter === ch ? 'filter-chip--active' : ''}`}
              onClick={() => setChannelFilter(ch)}
            >
              {ch === 'all' ? 'All' : ch.charAt(0).toUpperCase() + ch.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filteredConvMessages.length === 0 ? (
        <div className="empty-state">
          <p>No conversations with this contact yet.</p>
        </div>
      ) : (
        <div className="contact-conversations__list">
          {filteredConvMessages.map((msg) => (
            <div key={msg.messageId} className="conversation-entry">
              <span
                className={`conversation-entry__source conversation-entry__source--${msg.source}`}
              >
                {msg.source}
              </span>
              <div className="conversation-entry__content">
                <span className="conversation-entry__subject">{msg.subject || msg.sender}</span>
                <p className="conversation-entry__snippet">{msg.snippet}</p>
              </div>
              <span className="conversation-entry__date">{formatRelative(msg.receivedAtMs)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
```

### D3. Conversation CSS

```css
.contact-conversations {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.contact-conversations__filters {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.contact-conversations__search {
  max-width: 300px;
}
.contact-conversations__channel-filter {
  display: flex;
  gap: var(--space-1);
}
.conversation-entry {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  border-bottom: 1px solid var(--border);
}
.conversation-entry__source {
  font-size: var(--text-xs);
  padding: 2px 6px;
  border-radius: var(--radius-full);
  font-weight: 600;
  flex-shrink: 0;
}
.conversation-entry__source--gmail {
  background: var(--error-light);
  color: var(--error-color);
}
.conversation-entry__source--slack {
  background: var(--info-light);
  color: var(--info-color);
}
.conversation-entry__source--linkedin {
  background: var(--accent-subtle);
  color: var(--accent);
}
.conversation-entry__content {
  flex: 1;
  min-width: 0;
}
.conversation-entry__subject {
  font-size: var(--text-sm);
  font-weight: 500;
  display: block;
}
.conversation-entry__snippet {
  font-size: var(--text-xs);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.conversation-entry__date {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
  flex-shrink: 0;
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Quality Gates (run after ALL phases)

```bash
pnpm typecheck
pnpm lint --fix
pnpm vitest run --reporter=verbose apps/web-vite
pnpm vitest run --reporter=verbose functions
pnpm build
```

---

## Tests

Create `apps/web-vite/src/hooks/__tests__/useMessageTriage.test.ts`:

1. **Triage badge renders** — Message with `triageCategory: 'urgent'` shows Urgent badge
2. **User override persists** — Override triage → verify `triageCategoryOverride` set
3. **Sort order respects triage** — Urgent before FYI, newest first within group
4. **Filter tabs work** — Select 'action' → only urgent + important shown

Create `apps/web-vite/src/components/mailbox/__tests__/ActionExtraction.test.tsx`:

5. **Actions render** — Pass 3 extracted actions → verify 3 items shown
6. **Create task from action** — Click "Create" on task action → verify task modal opens with pre-filled data
7. **Action type badges** — Verify correct badge classes for each type

Create `apps/web-vite/src/components/contacts/__tests__/ConversationHistory.test.tsx`:

8. **Conversations tab renders** — Switch to conversations tab → verify message list
9. **Channel filter** — Filter by Gmail → only Gmail messages shown
10. **Search within conversations** — Search query filters by subject/snippet

---

## Commit

```
feat(mailbox): AI triage, contextual draft replies, action extraction, conversation history

- AI message triage: urgent/important/fyi/automated classification with user overrides
- Triage-sorted message list with filter tabs (Needs Action / All)
- Draft reply enhancement: 3 tone options (Professional/Friendly/Brief) with CRM context
- Action item extraction: tasks, events, contact updates, follow-ups with one-click creation
- Conversation history tab on contact detail: all messages across channels, searchable

Co-Authored-By: Claude <noreply@anthropic.com>
```
