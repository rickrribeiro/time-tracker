/**
 * Server → client push events, delivered over SSE (`GET /api/events`).
 * Channels: ai:chunk, ai:done, calendar:updated, inbox:updated, notify, notifications:updated, db:replaced, flights:updated,
 * chats:updated, chats:status, chats:ai.
 */
export type EventListener = (channel: string, payload: unknown) => void

const listeners = new Set<EventListener>()

export function subscribe(fn: EventListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function broadcast(channel: string, payload: unknown): void {
  for (const fn of listeners) {
    try {
      fn(channel, payload)
    } catch {
      // a broken listener must not stop the others
    }
  }
}
