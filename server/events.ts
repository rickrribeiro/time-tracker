/**
 * Server → client push events, delivered over SSE (`GET /api/events`).
 * Channels: ai:chunk, ai:done, calendar:updated, inbox:updated, notify, db:replaced.
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

/** Ask every connected client to show a notification (native on desktop, Notification API on web). */
export function notify(title: string, body: string): void {
  broadcast('notify', { title, body })
}
