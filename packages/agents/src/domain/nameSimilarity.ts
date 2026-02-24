/**
 * Name Similarity — deterministic string comparison for contact dedup.
 *
 * Implements Jaro-Winkler distance for name comparison,
 * plus phone normalization and compound matching heuristics.
 */

import { normalizeEmail } from './contacts'

// ----- Types -----

/** Minimal contact shape needed for dedup comparison */
export interface ContactForDedup {
  contactId: string
  displayName: string
  firstName?: string
  lastName?: string
  company?: string
  identifiers: {
    emails: string[]
    phones: string[]
    linkedinSlug?: string
    telegramUsername?: string
  }
}

export type DedupReason =
  | { type: 'email_exact'; email: string }
  | { type: 'phone_exact'; phone: string }
  | { type: 'name_similar'; similarity: number; name1: string; name2: string }
  | { type: 'name_and_company'; nameSimilarity: number; company: string }
  | { type: 'linkedin_match'; slug: string }
  | { type: 'telegram_match'; username: string }

export interface DedupMatchResult {
  score: number // 0-100
  reasons: DedupReason[]
}

// ----- String Normalization -----

/** Normalize a name for comparison: lowercase, trim, collapse whitespace */
export function normalizeName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ')
}

/** Normalize a phone number: strip all non-digit chars except leading + */
export function normalizePhone(phone: string): string {
  const hasPlus = phone.startsWith('+')
  const digits = phone.replace(/\D/g, '')
  return hasPlus ? `+${digits}` : digits
}

// ----- Jaro Similarity -----

/** Jaro similarity: 0.0 (no match) to 1.0 (identical) */
export function jaroSimilarity(s1: string, s2: string): number {
  if (s1 === s2) return 1.0
  if (s1.length === 0 || s2.length === 0) return 0.0

  const matchWindow = Math.max(Math.floor(Math.max(s1.length, s2.length) / 2) - 1, 0)

  const s1Matches = new Array<boolean>(s1.length).fill(false)
  const s2Matches = new Array<boolean>(s2.length).fill(false)

  let matches = 0
  let transpositions = 0

  // Find matching characters
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow)
    const end = Math.min(i + matchWindow + 1, s2.length)

    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue
      s1Matches[i] = true
      s2Matches[j] = true
      matches++
      break
    }
  }

  if (matches === 0) return 0.0

  // Count transpositions
  let k = 0
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue
    while (!s2Matches[k]) k++
    if (s1[i] !== s2[k]) transpositions++
    k++
  }

  return (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3
}

// ----- Jaro-Winkler Similarity -----

/** Jaro-Winkler: boosts Jaro for common prefixes (up to 4 chars) */
export function jaroWinklerSimilarity(s1: string, s2: string, prefixScale = 0.1): number {
  const jaro = jaroSimilarity(s1, s2)

  // Common prefix length (max 4)
  let commonPrefix = 0
  const maxPrefix = Math.min(4, s1.length, s2.length)
  for (let i = 0; i < maxPrefix; i++) {
    if (s1[i] === s2[i]) {
      commonPrefix++
    } else {
      break
    }
  }

  return jaro + commonPrefix * prefixScale * (1 - jaro)
}

// ----- Contact Comparison -----

const MIN_SCORE_THRESHOLD = 60

/**
 * Compare two contacts for duplicate likelihood.
 * Returns a match result with score (0-100) and reasons, or null if below threshold.
 */
export function compareContacts(
  a: ContactForDedup,
  b: ContactForDedup
): DedupMatchResult | null {
  // Never match a contact with itself
  if (a.contactId === b.contactId) return null

  const reasons: DedupReason[] = []
  let bestScore = 0

  // 1. Email exact overlap
  const aEmails = new Set(a.identifiers.emails.map(normalizeEmail))
  for (const email of b.identifiers.emails) {
    const normalized = normalizeEmail(email)
    if (aEmails.has(normalized)) {
      reasons.push({ type: 'email_exact', email: normalized })
      bestScore = Math.max(bestScore, 95)
      break // One email match is enough
    }
  }

  // 2. Phone exact overlap
  const aPhones = new Set(a.identifiers.phones.map(normalizePhone))
  for (const phone of b.identifiers.phones) {
    const normalized = normalizePhone(phone)
    if (aPhones.has(normalized)) {
      reasons.push({ type: 'phone_exact', phone: normalized })
      bestScore = Math.max(bestScore, 90)
      break
    }
  }

  // 3. LinkedIn match
  if (
    a.identifiers.linkedinSlug &&
    b.identifiers.linkedinSlug &&
    a.identifiers.linkedinSlug === b.identifiers.linkedinSlug
  ) {
    reasons.push({ type: 'linkedin_match', slug: a.identifiers.linkedinSlug })
    bestScore = Math.max(bestScore, 95)
  }

  // 4. Telegram match
  if (
    a.identifiers.telegramUsername &&
    b.identifiers.telegramUsername &&
    a.identifiers.telegramUsername.toLowerCase() === b.identifiers.telegramUsername.toLowerCase()
  ) {
    reasons.push({ type: 'telegram_match', username: a.identifiers.telegramUsername })
    bestScore = Math.max(bestScore, 90)
  }

  // 5. Name similarity (only compute if no identifier match yet, or to add as extra reason)
  const nameA = normalizeName(a.displayName)
  const nameB = normalizeName(b.displayName)

  if (nameA && nameB) {
    const nameSimilarity = jaroWinklerSimilarity(nameA, nameB)

    // 5a. Name + company compound match
    if (
      nameSimilarity >= 0.85 &&
      a.company &&
      b.company &&
      a.company.toLowerCase().trim() === b.company.toLowerCase().trim()
    ) {
      reasons.push({
        type: 'name_and_company',
        nameSimilarity,
        company: a.company,
      })
      bestScore = Math.max(bestScore, 85)
    }

    // 5b. High name similarity alone
    if (nameSimilarity >= 0.92) {
      reasons.push({
        type: 'name_similar',
        similarity: nameSimilarity,
        name1: a.displayName,
        name2: b.displayName,
      })
      bestScore = Math.max(bestScore, 70)
    }

    // 5c. First+Last name independent comparison
    if (
      a.firstName &&
      b.firstName &&
      a.lastName &&
      b.lastName &&
      !reasons.some((r) => r.type === 'name_similar')
    ) {
      const firstSim = jaroWinklerSimilarity(
        normalizeName(a.firstName),
        normalizeName(b.firstName)
      )
      const lastSim = jaroWinklerSimilarity(
        normalizeName(a.lastName),
        normalizeName(b.lastName)
      )
      if (firstSim >= 0.9 && lastSim >= 0.9) {
        reasons.push({
          type: 'name_similar',
          similarity: (firstSim + lastSim) / 2,
          name1: `${a.firstName} ${a.lastName}`,
          name2: `${b.firstName} ${b.lastName}`,
        })
        bestScore = Math.max(bestScore, 75)
      }
    }
  }

  if (reasons.length === 0) return null

  // Stack bonus: +5 for each additional reason beyond the first (cap 100)
  const finalScore = Math.min(100, bestScore + (reasons.length - 1) * 5)

  if (finalScore < MIN_SCORE_THRESHOLD) return null

  return { score: finalScore, reasons }
}
