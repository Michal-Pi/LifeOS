/**
 * Thread grouping utility for mailbox messages.
 *
 * Groups PrioritizedMessages by threadId when available, then falls back to
 * senderEmail or sender name. Preserves the input ordering so the caller's
 * sort (e.g. AI importance score) is maintained: the first message in the
 * input whose group hasn't been seen yet determines that group's position.
 *
 * Each MessageThread exposes the subject from the earliest message in the
 * thread so thread headers can display the conversation topic.
 */

import type { PrioritizedMessage } from '@lifeos/agents'

export interface MessageThread {
  threadKey: string
  sender: string
  senderEmail?: string
  /** Subject line from the earliest message in the thread (conversation starter). */
  subject?: string
  latestMessage: PrioritizedMessage
  messages: PrioritizedMessage[]
  unreadCount: number
  latestTimestamp: number
  /** Highest importance score across thread messages (for sorting). */
  topImportanceScore: number
}

/**
 * Group an already-sorted list of messages into threads.
 *
 * The returned array preserves the order in which each group first appears in
 * the input so that the caller's sort (importance-score desc, then recency) is
 * respected at the thread level.
 */
export function groupByThread(messages: PrioritizedMessage[]): MessageThread[] {
  // Use a Map to maintain insertion order (first-seen position)
  const groups = new Map<string, PrioritizedMessage[]>()

  for (const msg of messages) {
    const key = msg.threadId || msg.senderEmail || msg.sender
    const existing = groups.get(key)
    if (existing) {
      existing.push(msg)
    } else {
      groups.set(key, [msg])
    }
  }

  const threads: MessageThread[] = []

  for (const [key, msgs] of groups) {
    // Sort messages within the thread by time descending (newest first)
    const sorted = [...msgs].sort((a, b) => b.receivedAtMs - a.receivedAtMs)
    // The earliest message (last in the sorted array) usually has the original subject
    const earliest = sorted[sorted.length - 1]

    threads.push({
      threadKey: key,
      sender: sorted[0].sender,
      senderEmail: sorted[0].senderEmail,
      subject: earliest.subject || sorted[0].subject,
      latestMessage: sorted[0],
      messages: sorted,
      unreadCount: msgs.filter((m) => !m.isRead).length,
      latestTimestamp: Math.max(...msgs.map((m) => m.receivedAtMs)),
      topImportanceScore: Math.max(...msgs.map((m) => m.importanceScore ?? 0)),
    })
  }

  return threads
}
