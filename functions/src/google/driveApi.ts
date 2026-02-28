import { getValidAccessToken } from './calendarApi.js'

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  createdTime?: string
  modifiedTime?: string
  webViewLink?: string
  size?: string
}

interface DriveFilesListResponse {
  files?: DriveFile[]
  nextPageToken?: string
}

interface GoogleApiError {
  code: number
  message: string
}

async function makeDriveRequest<T>(
  accessToken: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${DRIVE_API_BASE}${path}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  const options: RequestInit = { method, headers }
  if (body) {
    options.body = JSON.stringify(body)
  }

  const response = await fetch(url, options)
  const responseData = (await response.json()) as { error?: GoogleApiError; [key: string]: unknown }

  if (!response.ok) {
    const error = responseData.error
    const apiError = new Error(error?.message ?? 'Google Drive API error') as Error & {
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
 * Search files in Google Drive
 */
export async function searchDriveFiles(
  uid: string,
  accountId: string,
  query: string,
  options: { mimeType?: string; limit?: number } = {}
): Promise<DriveFile[]> {
  const accessToken = await getValidAccessToken(uid, accountId)
  const limit = Math.min(options.limit ?? 20, 100)

  // Build Drive query
  const escapedQuery = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const queryParts: string[] = [`fullText contains '${escapedQuery}'`]
  if (options.mimeType) {
    queryParts.push(`mimeType = '${options.mimeType}'`)
  }
  queryParts.push('trashed = false')

  const params = new URLSearchParams({
    q: queryParts.join(' and '),
    fields: 'files(id,name,mimeType,createdTime,modifiedTime,webViewLink,size),nextPageToken',
    pageSize: String(limit),
    orderBy: 'modifiedTime desc',
  })

  const response = await makeDriveRequest<DriveFilesListResponse>(
    accessToken,
    'GET',
    `/files?${params.toString()}`
  )

  return response.files ?? []
}

/**
 * Download file content from Google Drive
 */
export async function downloadDriveFile(
  uid: string,
  accountId: string,
  fileId: string,
  maxSizeBytes: number = 5 * 1024 * 1024
): Promise<{ content: string; mimeType: string; fileName: string }> {
  const accessToken = await getValidAccessToken(uid, accountId)

  // First get file metadata
  const metaParams = new URLSearchParams({
    fields: 'id,name,mimeType,size',
  })
  const meta = await makeDriveRequest<{
    id: string
    name: string
    mimeType: string
    size?: string
  }>(accessToken, 'GET', `/files/${encodeURIComponent(fileId)}?${metaParams.toString()}`)

  // Google Workspace files (Docs, Sheets) don't report size — skip check for those
  const isGoogleAppsFile = meta.mimeType.startsWith('application/vnd.google-apps.')
  if (!isGoogleAppsFile && meta.size) {
    const fileSize = parseInt(meta.size, 10)
    if (fileSize > maxSizeBytes) {
      throw new Error(
        `File "${meta.name}" is ${(fileSize / 1024 / 1024).toFixed(1)}MB, exceeding ${(maxSizeBytes / 1024 / 1024).toFixed(1)}MB limit`
      )
    }
  }

  let content: string

  // Google Workspace docs need to be exported
  if (meta.mimeType === 'application/vnd.google-apps.document') {
    const exportUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`
    const response = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) {
      throw new Error(`Failed to export Google Doc: ${response.status}`)
    }
    content = await response.text()
  } else if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
    const exportUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}/export?mimeType=text/csv`
    const response = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) {
      throw new Error(`Failed to export Google Sheet: ${response.status}`)
    }
    content = await response.text()
  } else {
    // Regular file — download content
    const downloadUrl = `${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}?alt=media`
    const response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`)
    }

    // For binary files (PDF), return raw buffer
    if (meta.mimeType === 'application/pdf') {
      const buffer = Buffer.from(await response.arrayBuffer())
      return { content: buffer.toString('base64'), mimeType: meta.mimeType, fileName: meta.name }
    }

    content = await response.text()
  }

  return { content, mimeType: meta.mimeType, fileName: meta.name }
}
