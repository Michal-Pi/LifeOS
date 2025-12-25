export const storageKeyPrefix = 'lifeos.';

function getLocalStorage() {
  if (typeof globalThis === 'undefined') {
    return null
  }
  return globalThis.localStorage ?? null
}

export function readFromStorage(key: string): string | null {
  const storage = getLocalStorage()
  if (!storage) {
    return null
  }
  return storage.getItem(storageKeyPrefix + key)
}

export function writeToStorage(key: string, value: string) {
  const storage = getLocalStorage()
  if (!storage) {
    return
  }
  storage.setItem(storageKeyPrefix + key, value)
}
