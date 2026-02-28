# Agent Prompt — Task 2.2: Mailbox — Better Use of Space

> **Scope:** Improve the mailbox detail pane empty state with a smart dashboard, add thread grouping for messages, and implement quick actions on hover.

---

## 0. Context & References

| Item                              | Path (relative to repo root)                                      |
| --------------------------------- | ----------------------------------------------------------------- |
| **Design tokens**                 | `apps/web-vite/src/tokens.css`                                    |
| **UI primitives**                 | `apps/web-vite/src/components/ui/`                                |
| **MailboxPage**                   | `apps/web-vite/src/pages/MailboxPage.tsx`                         |
| **MailboxMessageList**            | `apps/web-vite/src/components/mailbox/MailboxMessageList.tsx`     |
| **MailboxMessageDetail**          | `apps/web-vite/src/components/mailbox/MailboxMessageDetail.tsx`   |
| **MailboxComposer**               | `apps/web-vite/src/components/mailbox/MailboxComposer.tsx`        |
| **MessageItem**                   | `apps/web-vite/src/components/mailbox/MessageItem.tsx`            |
| **MessageMailbox (Today widget)** | `apps/web-vite/src/components/mailbox/MessageMailbox.tsx`         |
| **MailboxAIToolsDropdown**        | `apps/web-vite/src/components/mailbox/MailboxAIToolsDropdown.tsx` |
| **RecipientAutocomplete**         | `apps/web-vite/src/components/mailbox/RecipientAutocomplete.tsx`  |
| **useMessageMailbox**             | `apps/web-vite/src/hooks/useMessageMailbox.ts`                    |
| **useMailboxComposer**            | `apps/web-vite/src/hooks/useMailboxComposer.ts`                   |
| **CSS — Page**                    | `apps/web-vite/src/styles/pages/MailboxPage.css`                  |
| **CSS — List**                    | `apps/web-vite/src/styles/components/MailboxMessageList.css`      |
| **CSS — Detail**                  | `apps/web-vite/src/styles/components/MailboxMessageDetail.css`    |
| **CSS — Composer**                | `apps/web-vite/src/styles/components/MailboxComposer.css`         |
| **CSS — Autocomplete**            | `apps/web-vite/src/styles/components/RecipientAutocomplete.css`   |

**Current layout:** Master-detail split — 380px sidebar (message list) + flex detail pane. Responsive stacks at 768px.

**Message type:** `PrioritizedMessage` with fields: `messageId`, `source`, `sender`, `senderEmail`, `subject`, `snippet`, `aiSummary`, `priority`, `importanceScore`, `isRead`, `isDismissed`, `requiresFollowUp`, `receivedAtMs`, `contactId`, `threadId`.

---

## Phase A — Smart Detail Pane (Empty State Dashboard)

### A1. Create `MailboxDashboard` Component

Create `apps/web-vite/src/components/mailbox/MailboxDashboard.tsx`:

```tsx
interface MailboxDashboardProps {
  messages: PrioritizedMessage[]
  syncStatus: { lastSyncMs?: number; stats?: SyncStats }
}
```

This replaces the current empty state in `MailboxPage.tsx` (the `.mailbox-page__empty-detail` div that shows "Select a message to read").

**Dashboard sections:**

1. **Unread Summary** — One row per channel showing unread count:

   ```
   Gmail      12 unread
   Slack       5 unread
   LinkedIn    2 unread
   ```

   Each row is clickable to filter the message list to that channel.

2. **Quick Stats** — 3 metrics in a row:
   - Messages today (count of messages where `receivedAtMs` is today)
   - Needs reply (count of `requiresFollowUp === true`)
   - AI Top 10 (count of messages with `importanceScore >= threshold`)

3. **Suggested Actions** — If `requiresFollowUp` count > 0:

   ```
   "3 messages need your reply"  [View →]
   ```

   Clicking "View" filters the list to follow-up messages.

4. **Last Sync** — "Last synced 5 minutes ago" with a "Sync Now" button.

### A2. Dashboard CSS

Create styles in `MailboxMessageDetail.css` (or a new `MailboxDashboard.css`):

```css
.mailbox-dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-6);
  height: 100%;
  justify-content: center;
  max-width: 480px;
  margin: 0 auto;
}

.mailbox-dashboard__section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.mailbox-dashboard__section-title {
  font-size: var(--text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary);
}

.mailbox-dashboard__channel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--motion-fast) var(--motion-ease);
}

.mailbox-dashboard__channel-row:hover {
  background: var(--background-tertiary);
}

.mailbox-dashboard__stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-3);
  background: var(--background-tertiary);
  border-radius: var(--radius-md);
  flex: 1;
}

.mailbox-dashboard__stat-value {
  font-size: var(--text-xl);
  font-weight: 700;
  font-family: var(--font-mono);
}

.mailbox-dashboard__stat-label {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

.mailbox-dashboard__stats-row {
  display: flex;
  gap: var(--space-3);
}
```

### A3. Wire Into MailboxPage

In `MailboxPage.tsx`, replace the empty state conditional:

```tsx
// Before:
{
  !selectedMessage && <div className="mailbox-page__empty-detail">Select a message...</div>
}

// After:
{
  !selectedMessage && (
    <MailboxDashboard
      messages={messages}
      syncStatus={syncStatus}
      onFilterChannel={(channel) => setChannelFilter(channel)}
      onFilterFollowUp={() => {
        /* filter to requiresFollowUp */
      }}
      onSync={() => syncMailbox()}
    />
  )
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase B — Thread Grouping

### B1. Group Messages by Thread/Sender

In `MailboxPage.tsx` or `MailboxMessageList.tsx`, add a grouping function:

```tsx
interface MessageThread {
  threadKey: string // threadId or senderId
  sender: string
  senderEmail?: string
  latestMessage: PrioritizedMessage
  messages: PrioritizedMessage[]
  unreadCount: number
  latestTimestamp: number
}

function groupByThread(messages: PrioritizedMessage[]): MessageThread[] {
  const groups = new Map<string, PrioritizedMessage[]>()
  for (const msg of messages) {
    const key = msg.threadId || msg.senderEmail || msg.sender
    const existing = groups.get(key) || []
    existing.push(msg)
    groups.set(key, existing)
  }
  return Array.from(groups.entries())
    .map(([key, msgs]) => ({
      threadKey: key,
      sender: msgs[0].sender,
      senderEmail: msgs[0].senderEmail,
      latestMessage: msgs.sort((a, b) => b.receivedAtMs - a.receivedAtMs)[0],
      messages: msgs.sort((a, b) => b.receivedAtMs - a.receivedAtMs),
      unreadCount: msgs.filter((m) => !m.isRead).length,
      latestTimestamp: Math.max(...msgs.map((m) => m.receivedAtMs)),
    }))
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp)
}
```

### B2. Thread List Item Rendering

For threads with > 1 message, render as expandable:

```tsx
<div className="mailbox-thread">
  <button className="mailbox-thread__header" onClick={() => toggleThread(thread.threadKey)}>
    <span className="mailbox-thread__sender">{thread.sender}</span>
    <span className="mailbox-thread__count">{thread.messages.length}</span>
    <span className="mailbox-thread__preview">{thread.latestMessage.snippet}</span>
    <span className="mailbox-thread__time">{formatRelative(thread.latestTimestamp)}</span>
  </button>
  {expandedThreads.has(thread.threadKey) && (
    <div className="mailbox-thread__messages">
      {thread.messages.map(msg => <MessageItem key={msg.messageId} ... />)}
    </div>
  )}
</div>
```

For single-message "threads", render as regular message items (current behavior).

### B3. Thread CSS

```css
.mailbox-thread__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  width: 100%;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  transition: background var(--motion-fast) var(--motion-ease);
}

.mailbox-thread__header:hover {
  background: var(--background-tertiary);
}

.mailbox-thread__count {
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--text-tertiary);
  background: var(--background-tertiary);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  min-width: 20px;
  text-align: center;
}

.mailbox-thread__messages {
  border-left: 2px solid var(--border);
  margin-left: var(--space-4);
}
```

**Quality gate:** `pnpm typecheck && pnpm lint --fix`

---

## Phase C — Quick Actions on Hover

### C1. Add Hover Actions to Message Items

In `MailboxMessageList.tsx`, each `.mailbox-list__item` should get a hover-reveal actions container:

```tsx
<div
  className="mailbox-list__item"
  onMouseEnter={() => setHoveredId(msg.messageId)}
  onMouseLeave={() => setHoveredId(null)}
>
  {/* existing content */}
  <div className="mailbox-list__hover-actions">
    <button
      className="mailbox-list__hover-btn"
      title="Archive"
      onClick={(e) => {
        e.stopPropagation()
        dismissMessage(msg.messageId)
      }}
    >
      📥
    </button>
    <button
      className="mailbox-list__hover-btn"
      title={msg.isRead ? 'Mark unread' : 'Mark read'}
      onClick={(e) => {
        e.stopPropagation()
        toggleRead(msg.messageId)
      }}
    >
      {msg.isRead ? '📩' : '📧'}
    </button>
    <button
      className="mailbox-list__hover-btn"
      title="Reply"
      onClick={(e) => {
        e.stopPropagation()
        onReply(msg)
      }}
    >
      ↩
    </button>
  </div>
</div>
```

### C2. Hover Actions CSS

Add to `MailboxMessageList.css`:

```css
.mailbox-list__hover-actions {
  position: absolute;
  right: var(--space-2);
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: var(--space-1);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--motion-fast) var(--motion-ease);
  background: var(--card);
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
}

.mailbox-list__item {
  position: relative; /* ensure it's set */
}

.mailbox-list__item:hover .mailbox-list__hover-actions {
  opacity: 1;
  pointer-events: auto;
}

.mailbox-list__hover-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: var(--text-sm);
  transition: background var(--motion-fast) var(--motion-ease);
}

.mailbox-list__hover-btn:hover {
  background: var(--background-tertiary);
}
```

**Note:** The existing `.mailbox-list__dismiss` button (currently present) can be removed since the hover actions now cover that functionality.

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

Create `apps/web-vite/src/components/mailbox/__tests__/MailboxDashboard.test.tsx`:

1. **Renders channel counts** — Pass 5 gmail + 3 slack messages → verify "5 unread" and "3 unread" render
2. **Renders follow-up count** — Pass 2 messages with `requiresFollowUp: true` → verify "2 messages need your reply"
3. **Click channel row filters** — Verify `onFilterChannel` callback fires with correct channel

Create `apps/web-vite/src/components/mailbox/__tests__/ThreadGrouping.test.tsx`:

4. **Groups by threadId** — Pass 3 messages with same threadId → verify 1 thread with count 3
5. **Single messages not grouped** — Pass 3 messages with unique threadIds → verify 3 separate items
6. **Latest timestamp sorts first** — Verify threads sorted by most recent message

---

## Commit

```
feat(mailbox): add smart dashboard, thread grouping, and hover quick actions

- Replace empty detail pane with smart dashboard (unread counts, stats, suggested actions)
- Group messages by thread/sender with expand/collapse
- Hover-reveal quick actions (archive, mark read/unread, reply)
- Maintain existing keyboard navigation

Co-Authored-By: Claude <noreply@anthropic.com>
```
