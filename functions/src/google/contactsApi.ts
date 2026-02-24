/**
 * Google People API client for fetching user's Google Contacts.
 *
 * Reuses the OAuth token management from calendarApi.ts.
 */

import { getValidAccessToken } from './calendarApi.js'
import { createLogger } from '../lib/logger.js'

const log = createLogger('ContactsApi')

const PEOPLE_API_BASE = 'https://people.googleapis.com/v1'

/** Fields we request from the People API */
const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,photos,organizations,biographies'

/** Maximum page size for people.connections.list */
const PAGE_SIZE = 1000

// ----------------------------------------------------------------
// Types matching the Google People API response shape
// ----------------------------------------------------------------

export interface GooglePerson {
  resourceName: string // e.g. "people/c12345"
  etag?: string
  names?: Array<{
    displayName?: string
    givenName?: string
    familyName?: string
    metadata?: { primary?: boolean }
  }>
  emailAddresses?: Array<{
    value: string
    type?: string
    metadata?: { primary?: boolean }
  }>
  phoneNumbers?: Array<{
    value: string
    type?: string
    canonicalForm?: string // E.164 format if available
  }>
  photos?: Array<{
    url: string
    default?: boolean
    metadata?: { primary?: boolean }
  }>
  organizations?: Array<{
    name?: string
    title?: string
    metadata?: { primary?: boolean }
  }>
  biographies?: Array<{
    value: string
    contentType?: string
  }>
}

interface PeopleConnectionsResponse {
  connections?: GooglePerson[]
  nextPageToken?: string
  totalPeople?: number
  totalItems?: number
}

interface GoogleApiError {
  code: number
  message: string
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

async function makePeopleRequest<T>(accessToken: string, path: string): Promise<T> {
  const url = `${PEOPLE_API_BASE}${path}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  const responseData = (await response.json()) as { error?: GoogleApiError; [key: string]: unknown }

  if (!response.ok) {
    const error = responseData.error
    const apiError = new Error(error?.message ?? 'Google People API error') as Error & {
      code: number
      statusCode: number
    }
    apiError.code = error?.code ?? response.status
    apiError.statusCode = response.status
    throw apiError
  }

  return responseData as T
}

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Fetch all Google Contacts for a user account.
 * Handles pagination automatically.
 *
 * Note: The People API does NOT support sync tokens for connections.list,
 * so every call is effectively a full sync.
 */
export async function fetchAllGoogleContacts(
  uid: string,
  accountId: string
): Promise<GooglePerson[]> {
  const accessToken = await getValidAccessToken(uid, accountId)
  const allContacts: GooglePerson[] = []
  let pageToken: string | undefined

  do {
    const params = new URLSearchParams({
      personFields: PERSON_FIELDS,
      pageSize: String(PAGE_SIZE),
      sortOrder: 'LAST_MODIFIED_DESCENDING',
    })
    if (pageToken) {
      params.set('pageToken', pageToken)
    }

    const response = await makePeopleRequest<PeopleConnectionsResponse>(
      accessToken,
      `/people/me/connections?${params.toString()}`
    )

    if (response.connections) {
      allContacts.push(...response.connections)
    }

    pageToken = response.nextPageToken
  } while (pageToken)

  log.info('Fetched Google Contacts', { uid, count: allContacts.length })
  return allContacts
}

/**
 * Fetch a batch of Google Contacts by their resource names.
 * Used for targeted lookups. Max 200 per call (People API limit).
 */
export async function batchGetGoogleContacts(
  uid: string,
  accountId: string,
  resourceNames: string[]
): Promise<GooglePerson[]> {
  if (resourceNames.length === 0) return []
  if (resourceNames.length > 200) {
    throw new Error('batchGetGoogleContacts: max 200 resource names per call')
  }

  const accessToken = await getValidAccessToken(uid, accountId)
  const params = new URLSearchParams({ personFields: PERSON_FIELDS })
  for (const name of resourceNames) {
    params.append('resourceNames', name)
  }

  const response = await makePeopleRequest<{ responses?: Array<{ person: GooglePerson }> }>(
    accessToken,
    `/people:batchGet?${params.toString()}`
  )

  return (response.responses ?? []).map((r) => r.person).filter(Boolean)
}
