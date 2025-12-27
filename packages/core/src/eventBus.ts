export type EventHandler<Payload> = (payload: Payload) => void | Promise<void>

export interface EventBus<EventMap extends Record<string, unknown> = Record<string, unknown>> {
  publish<EventKey extends keyof EventMap>(
    event: EventKey,
    payload: EventMap[EventKey]
  ): Promise<void>
  subscribe<EventKey extends keyof EventMap>(
    event: EventKey,
    handler: EventHandler<EventMap[EventKey]>
  ): () => void
}

export class SimpleEventBus<
  EventMap extends Record<string, unknown> = Record<string, unknown>,
> implements EventBus<EventMap> {
  private subscribers = new Map<keyof EventMap, Set<EventHandler<EventMap[keyof EventMap]>>>()

  async publish<EventKey extends keyof EventMap>(event: EventKey, payload: EventMap[EventKey]) {
    const handlers = this.subscribers.get(event)
    if (!handlers) {
      return
    }
    await Promise.all([...handlers].map((handler) => handler(payload)))
  }

  subscribe<EventKey extends keyof EventMap>(
    event: EventKey,
    handler: EventHandler<EventMap[EventKey]>
  ) {
    const handlers = this.subscribers.get(event) ?? new Set()
    handlers.add(handler as EventHandler<EventMap[keyof EventMap]>)
    this.subscribers.set(event, handlers)
    return () => handlers.delete(handler as EventHandler<EventMap[keyof EventMap]>)
  }
}
