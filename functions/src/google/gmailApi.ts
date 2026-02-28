import { getValidAccessToken } from './calendarApi.js'

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1'

export interface GmailMessageMeta {
  messageId: string
  threadId: string
  subject: string
  from: string
  date: string
  snippet: string
  labelIds: string[]
}

export interface GmailMessageFull {
  messageId: string
  threadId: string
  subject: string
  from: string
  to: string
  date: string
  body: string
  snippet: string
  attachmentCount: number
  labelIds: string[]
}

interface GmailApiError {
  code: number
  message: string
}

async function makeGmailRequest<T>(accessToken: string, method: string, path: string): Promise<T> {
  const url = `${GMAIL_API_BASE}${path}`
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  const responseData = (await response.json()) as { error?: GmailApiError; [key: string]: unknown }

  if (!response.ok) {
    const error = responseData.error
    const apiError = new Error(error?.message ?? 'Gmail API error') as Error & {
      code: number
      statusCode: number
    }
    apiError.code = error?.code ?? response.status
    apiError.statusCode = response.status
    throw apiError
  }

  return responseData as T
}

function extractHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

/**
 * List Gmail messages with metadata only (no body)
 */
export async function listGmailMessages(
  uid: string,
  accountId: string,
  query: string,
  maxResults: number = 20
): Promise<GmailMessageMeta[]> {
  const accessToken = await getValidAccessToken(uid, accountId)
  const limit = Math.min(maxResults, 50)

  // Get message IDs
  const listParams = new URLSearchParams({
    q: query,
    maxResults: String(limit),
  })

  const listResponse = await makeGmailRequest<{
    messages?: Array<{ id: string; threadId: string }>
    resultSizeEstimate?: number
  }>(accessToken, 'GET', `/users/me/messages?${listParams.toString()}`)

  const messageIds = listResponse.messages ?? []
  if (messageIds.length === 0) return []

  // Fetch metadata for each message
  // Batch in chunks of 10 to avoid hitting Gmail API rate limits (250 quota units/sec)
  const BATCH_SIZE = 10
  const messages: GmailMessageMeta[] = []

  for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
    const batch = messageIds.slice(i, i + BATCH_SIZE)
    const batchResults = await Promise.all(
      batch.map(async ({ id }) => {
        // Gmail API only allows one metadataHeaders per param, so build URL manually
        const metaUrl = `/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`

        const msg = await makeGmailRequest<{
          id: string
          threadId: string
          snippet: string
          labelIds?: string[]
          payload?: {
            headers?: Array<{ name: string; value: string }>
          }
        }>(accessToken, 'GET', metaUrl)

        const headers = msg.payload?.headers ?? []

        return {
          messageId: msg.id,
          threadId: msg.threadId,
          subject: extractHeader(headers, 'Subject'),
          from: extractHeader(headers, 'From'),
          date: extractHeader(headers, 'Date'),
          snippet: msg.snippet ?? '',
          labelIds: msg.labelIds ?? [],
        }
      })
    )
    messages.push(...batchResults)
  }

  return messages
}

/**
 * Read full Gmail message body
 */
export async function readGmailMessage(
  uid: string,
  accountId: string,
  messageId: string
): Promise<GmailMessageFull> {
  const accessToken = await getValidAccessToken(uid, accountId)

  const msg = await makeGmailRequest<{
    id: string
    threadId: string
    snippet: string
    labelIds?: string[]
    payload?: {
      headers?: Array<{ name: string; value: string }>
      mimeType?: string
      body?: { data?: string; size?: number }
      parts?: Array<{
        mimeType?: string
        body?: { data?: string; size?: number }
        parts?: Array<{
          mimeType?: string
          body?: { data?: string; size?: number }
        }>
        filename?: string
      }>
    }
  }>(accessToken, 'GET', `/users/me/messages/${messageId}?format=full`)

  const headers = msg.payload?.headers ?? []
  const subject = extractHeader(headers, 'Subject')
  const from = extractHeader(headers, 'From')
  const to = extractHeader(headers, 'To')
  const date = extractHeader(headers, 'Date')

  // Extract body text
  let body = ''
  let attachmentCount = 0

  function extractBody(payload: typeof msg.payload): void {
    if (!payload) return

    // Count attachments
    if (payload.parts) {
      for (const part of payload.parts) {
        if (part.filename && part.filename.length > 0) {
          attachmentCount++
        }
      }
    }

    // Prefer text/plain
    if (payload.mimeType === 'text/plain' && payload.body?.data) {
      body = decodeBase64Url(payload.body.data)
      return
    }

    // Check parts for text/plain first, then text/html
    if (payload.parts) {
      const plainPart = payload.parts.find((p) => p.mimeType === 'text/plain')
      if (plainPart?.body?.data) {
        body = decodeBase64Url(plainPart.body.data)
        return
      }

      const htmlPart = payload.parts.find((p) => p.mimeType === 'text/html')
      if (htmlPart?.body?.data) {
        body = stripHtmlTags(decodeBase64Url(htmlPart.body.data))
        return
      }

      // Check nested multipart/alternative
      for (const part of payload.parts) {
        if (part.parts) {
          extractBody(part as typeof payload)
          if (body) return
        }
      }
    }

    // Fallback to top-level body
    if (payload.body?.data) {
      const decoded = decodeBase64Url(payload.body.data)
      body = payload.mimeType === 'text/html' ? stripHtmlTags(decoded) : decoded
    }
  }

  extractBody(msg.payload)

  // Truncate at 50K chars
  const maxLen = 50000
  const truncated = body.length > maxLen
  if (truncated) {
    body = body.substring(0, maxLen) + '\n\n[... content truncated]'
  }

  return {
    messageId: msg.id,
    threadId: msg.threadId,
    subject,
    from,
    to,
    date,
    body,
    snippet: msg.snippet ?? '',
    attachmentCount,
    labelIds: msg.labelIds ?? [],
  }
}

// ----- Write Operations -----

async function makeGmailRequestWithBody<T>(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${GMAIL_API_BASE}${path}`
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const responseData = (await response.json()) as { error?: GmailApiError; [key: string]: unknown }

  if (!response.ok) {
    const error = responseData.error
    const apiError = new Error(error?.message ?? 'Gmail API error') as Error & {
      code: number
      statusCode: number
    }
    apiError.code = error?.code ?? response.status
    apiError.statusCode = response.status
    throw apiError
  }

  return responseData as T
}

/**
 * Build an RFC 2822 compliant email message
 */
function buildRawEmail(options: {
  to: string
  subject: string
  body: string
  htmlBody?: string
  inReplyTo?: string
  threadId?: string
  from?: string
}): string {
  const boundary = `boundary_${Date.now()}`
  const headers = [`To: ${options.to}`, `Subject: ${options.subject}`, `MIME-Version: 1.0`]

  if (options.from) headers.push(`From: ${options.from}`)
  if (options.inReplyTo) {
    headers.push(`In-Reply-To: ${options.inReplyTo}`)
    headers.push(`References: ${options.inReplyTo}`)
  }

  if (options.htmlBody) {
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    const email = [
      ...headers,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset=UTF-8',
      '',
      options.body,
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      '',
      options.htmlBody,
      `--${boundary}--`,
    ].join('\r\n')
    return email
  }

  headers.push('Content-Type: text/plain; charset=UTF-8')
  return [...headers, '', options.body].join('\r\n')
}

function encodeBase64Url(str: string): string {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Send a Gmail message
 */
export async function sendGmailMessage(
  uid: string,
  accountId: string,
  options: {
    to: string
    subject: string
    body: string
    htmlBody?: string
    inReplyTo?: string
    threadId?: string
  }
): Promise<{ messageId: string; threadId: string }> {
  const accessToken = await getValidAccessToken(uid, accountId)

  const rawEmail = buildRawEmail(options)
  const encodedEmail = encodeBase64Url(rawEmail)

  const requestBody: { raw: string; threadId?: string } = { raw: encodedEmail }
  if (options.threadId) {
    requestBody.threadId = options.threadId
  }

  const result = await makeGmailRequestWithBody<{ id: string; threadId: string }>(
    accessToken,
    'POST',
    '/users/me/messages/send',
    requestBody
  )

  return { messageId: result.id, threadId: result.threadId }
}

/**
 * Trash a Gmail message (soft delete — recoverable for 30 days)
 */
export async function trashGmailMessage(
  uid: string,
  accountId: string,
  messageId: string
): Promise<boolean> {
  const accessToken = await getValidAccessToken(uid, accountId)

  await makeGmailRequestWithBody(accessToken, 'POST', `/users/me/messages/${messageId}/trash`)

  return true
}

// ----- Helpers -----

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64').toString('utf-8')
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
