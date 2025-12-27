// Use Web Crypto API (browser) or Node crypto (server)
function getRandomUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older browsers or Node.js without crypto
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

/**
 * Generate a random UUID without namespace
 * For backward compatibility with existing code
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

type Brand<T extends string> = { readonly __brand: T }

export type Id<T extends string> = `${T}:${string}` & Brand<T>

export function asId<T extends string>(value: string | Id<T>): Id<T> {
  return value as Id<T>
}

export function newId<T extends string>(namespace: T): Id<T> {
  const uuid = getRandomUUID()
  return `${namespace}:${uuid}` as Id<T>
}
