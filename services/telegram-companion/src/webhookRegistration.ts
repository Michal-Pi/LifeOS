/**
 * Telegram Webhook Registration
 *
 * Registers a webhook URL with the Telegram Bot API
 * so that incoming messages are forwarded to this service.
 */

const TELEGRAM_API = 'https://api.telegram.org'

/**
 * Register a webhook URL for a Telegram bot.
 * @param botToken - The bot's token from BotFather
 * @param webhookUrl - The URL that Telegram should send updates to
 */
export async function registerWebhook(botToken: string, webhookUrl: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message'],
    }),
  })

  const data = (await res.json()) as { ok: boolean; description?: string }

  if (!data.ok) {
    throw new Error(`Failed to set webhook: ${data.description || 'Unknown error'}`)
  }

  console.log(`Webhook registered: ${webhookUrl}`)
}

/**
 * Remove the webhook for a Telegram bot.
 * @param botToken - The bot's token from BotFather
 */
export async function removeWebhook(botToken: string): Promise<void> {
  const res = await fetch(`${TELEGRAM_API}/bot${botToken}/deleteWebhook`, {
    method: 'POST',
  })

  const data = (await res.json()) as { ok: boolean; description?: string }

  if (!data.ok) {
    throw new Error(`Failed to delete webhook: ${data.description || 'Unknown error'}`)
  }

  console.log('Webhook removed')
}
