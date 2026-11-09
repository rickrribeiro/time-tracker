import { createNotification, NotificationInput, DbNotification } from '../database/queries'
import { broadcast } from '../events'

/**
 * Cria uma notificação: grava na central (sino da sidebar) e avisa todos os
 * clientes conectados. `notify` → popup (nativo no desktop, Notification API na web);
 * `notifications:updated` → os clientes recarregam a lista/badge.
 */
export async function notify(input: NotificationInput): Promise<DbNotification | null> {
  try {
    const n = await createNotification(input)
    broadcast('notify', n)
    broadcast('notifications:updated', { id: n.id })
    return n
  } catch {
    // a notificação nunca pode derrubar quem a disparou: ao menos mostra o popup
    broadcast('notify', { title: input.title, body: input.body ?? '' })
    return null
  }
}

/** Avisa os clientes que a lista mudou (leitura/remoção). */
export function notificationsChanged(): void {
  broadcast('notifications:updated', {})
}
