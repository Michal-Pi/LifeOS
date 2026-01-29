# Offline/Online Management Patterns

## Current State Analysis

Your codebase currently has **multiple independent online state checks**:

1. **Direct `navigator.onLine` checks** scattered throughout:
   - `useTodoSync`, `useNoteSync`, `useOutbox`, `SystemStatus` all independently listen to online/offline events
   - `training/utils.ts` has `isOnline()` utility but it's not consistently used
   - Services check `navigator.onLine` directly in sync workers

2. **Issues with current approach:**
   - Duplicate event listeners (multiple `addEventListener('online')` calls)
   - Inconsistent state (one hook might think online while another thinks offline)
   - No centralized "online" state source of truth
   - Services can't easily subscribe to online state changes
   - Hard to test (can't mock online state globally)

## Industry Patterns: Google Docs, Gmail, Notion

### 1. **Centralized Network Status Service** (Google Docs Pattern)

**Single source of truth** for network state:

```typescript
// Single service that all components/services check
class NetworkStatusService {
  private isOnline: boolean = navigator.onLine
  private listeners: Set<(isOnline: boolean) => void> = new Set()

  constructor() {
    window.addEventListener('online', () => this.setOnline(true))
    window.addEventListener('offline', () => this.setOnline(false))

    // Also do periodic connectivity checks (navigator.onLine can be unreliable)
    this.startConnectivityChecks()
  }

  subscribe(callback: (isOnline: boolean) => void): () => void {
    this.listeners.add(callback)
    callback(this.isOnline) // Immediate callback with current state
    return () => this.listeners.delete(callback)
  }

  getIsOnline(): boolean {
    return this.isOnline
  }

  private setOnline(value: boolean) {
    if (this.isOnline !== value) {
      this.isOnline = value
      this.listeners.forEach((cb) => cb(value))
    }
  }

  private async startConnectivityChecks() {
    // Periodic HEAD request to verify actual connectivity
    // navigator.onLine can be true but network unreachable
    setInterval(async () => {
      try {
        await fetch('/ping', { method: 'HEAD', cache: 'no-store' })
        if (!this.isOnline) this.setOnline(true)
      } catch {
        if (this.isOnline) this.setOnline(false)
      }
    }, 30000)
  }
}

export const networkStatus = new NetworkStatusService()
```

**Usage in services:**

```typescript
// All services check the same source
if (networkStatus.getIsOnline()) {
  await syncToServer()
} else {
  await queueLocally()
}
```

### 2. **React Context Pattern** (Gmail Pattern)

**React Context** for UI components, **Service** for non-React code:

```typescript
// Context for React components
const NetworkContext = createContext<{
  isOnline: boolean
  isSlowConnection: boolean
  latency: number | null
}>()

export function NetworkProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [latency, setLatency] = useState<number | null>(null)

  useEffect(() => {
    const unsubscribe = networkStatus.subscribe(setIsOnline)
    return unsubscribe
  }, [])

  return (
    <NetworkContext.Provider value={{ isOnline, latency, isSlowConnection: latency > 1000 }}>
      {children}
    </NetworkContext.Provider>
  )
}

export function useNetwork() {
  return useContext(NetworkContext)
}
```

**Usage:**

```typescript
function MyComponent() {
  const { isOnline } = useNetwork()
  return <div>{isOnline ? 'Online' : 'Offline'}</div>
}
```

### 3. **Offline-First with Optimistic Updates** (Notion Pattern)

**Always write locally first**, sync in background:

```typescript
class DataService {
  async createItem(data: Item): Promise<Item> {
    // 1. Always write to local storage first (optimistic)
    const localItem = await localStore.create(data)

    // 2. Queue for sync (works offline)
    await outbox.enqueue('create', localItem)

    // 3. Try immediate sync if online (non-blocking)
    if (networkStatus.getIsOnline()) {
      this.syncInBackground().catch(console.error)
    }

    return localItem // Return immediately
  }

  private async syncInBackground() {
    // Process outbox queue
    await outbox.process()
  }
}
```

### 4. **Service Worker + Cache API** (Progressive Web App Pattern)

**Service Worker** intercepts network requests, serves from cache when offline:

```typescript
// sw.js
self.addEventListener('fetch', (event) => {
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((response) => response || fetch(event.request))
    )
  }
})
```

## Recommended Pattern for Your Codebase

### **Hybrid Approach: Service + React Context**

**1. Create centralized Network Status Service:**

```typescript
// apps/web-vite/src/lib/networkStatus.ts
class NetworkStatusService {
  private isOnline: boolean
  private listeners: Set<(isOnline: boolean) => void> = new Set()
  private connectivityCheckInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
      this.startConnectivityChecks()
    }
  }

  private handleOnline = () => {
    this.setOnline(true)
  }

  private handleOffline = () => {
    this.setOnline(false)
  }

  private setOnline(value: boolean) {
    if (this.isOnline !== value) {
      this.isOnline = value
      this.listeners.forEach((callback) => callback(value))
    }
  }

  getIsOnline(): boolean {
    return this.isOnline
  }

  subscribe(callback: (isOnline: boolean) => void): () => void {
    this.listeners.add(callback)
    callback(this.isOnline) // Immediate callback
    return () => this.listeners.delete(callback)
  }

  private startConnectivityChecks() {
    // Check actual connectivity every 30s (navigator.onLine can be unreliable)
    this.connectivityCheckInterval = setInterval(async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        await fetch(window.location.origin + '/ping', {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller.signal,
        })
        clearTimeout(timeoutId)
        if (!this.isOnline) this.setOnline(true)
      } catch {
        if (this.isOnline) this.setOnline(false)
      }
    }, 30000)
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
    }
    if (this.connectivityCheckInterval) {
      clearInterval(this.connectivityCheckInterval)
    }
    this.listeners.clear()
  }
}

export const networkStatus = new NetworkStatusService()
```

**2. Create React Context:**

```typescript
// apps/web-vite/src/contexts/NetworkContext.tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { networkStatus } from '@/lib/networkStatus'

interface NetworkContextValue {
  isOnline: boolean
  latency: number | null
}

const NetworkContext = createContext<NetworkContextValue | undefined>(undefined)

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(networkStatus.getIsOnline())
  const [latency, setLatency] = useState<number | null>(null)

  useEffect(() => {
    const unsubscribe = networkStatus.subscribe(setIsOnline)
    return unsubscribe
  }, [])

  // Optional: Measure latency
  useEffect(() => {
    const checkLatency = async () => {
      const start = performance.now()
      try {
        await fetch(window.location.origin + '/ping', {
          method: 'HEAD',
          cache: 'no-store'
        })
        setLatency(Math.round(performance.now() - start))
      } catch {
        setLatency(null)
      }
    }

    checkLatency()
    const interval = setInterval(checkLatency, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <NetworkContext.Provider value={{ isOnline, latency }}>
      {children}
    </NetworkContext.Provider>
  )
}

export function useNetwork() {
  const context = useContext(NetworkContext)
  if (!context) {
    throw new Error('useNetwork must be used within NetworkProvider')
  }
  return context
}
```

**3. Update all services to use the centralized service:**

```typescript
// Before (scattered checks):
if (navigator.onLine) { ... }
if (isOnline()) { ... }

// After (centralized):
import { networkStatus } from '@/lib/networkStatus'

if (networkStatus.getIsOnline()) {
  await syncToServer()
} else {
  await queueLocally()
}
```

**4. Update hooks to use context:**

```typescript
// Before:
const [isOnline, setIsOnline] = useState(navigator.onLine)
useEffect(() => {
  window.addEventListener('online', () => setIsOnline(true))
  window.addEventListener('offline', () => setIsOnline(false))
}, [])

// After:
const { isOnline } = useNetwork()
```

## Benefits of This Pattern

1. **Single source of truth** - One place manages online state
2. **Consistent state** - All components/services see the same state
3. **Easy testing** - Mock `networkStatus` service
4. **Better reliability** - Connectivity checks verify actual network access
5. **Performance** - Single event listener instead of many
6. **Type safety** - TypeScript ensures correct usage

## Migration Strategy

1. **Phase 1:** Create `networkStatus` service and `NetworkContext`
2. **Phase 2:** Replace direct `navigator.onLine` checks in services
3. **Phase 3:** Replace hook-level online state with `useNetwork()`
4. **Phase 4:** Remove duplicate event listeners
5. **Phase 5:** Add connectivity checks for reliability

## Additional Patterns Used by Google Docs/Gmail/Notion

### **Connection Quality Detection**

```typescript
interface ConnectionQuality {
  isOnline: boolean
  isSlow: boolean // > 1s latency
  isUnstable: boolean // Frequent disconnects
  bandwidth: 'high' | 'medium' | 'low'
}

// Detect slow/unstable connections
// Adjust sync frequency based on quality
```

### **Exponential Backoff on Reconnect**

```typescript
// When coming back online, don't sync everything at once
// Stagger sync operations to avoid overwhelming server
```

### **Conflict Resolution UI**

```typescript
// When offline edits conflict with server changes
// Show UI to let user choose which version to keep
```

### **Offline Indicator**

```typescript
// Always show user when offline
// Google Docs: "Offline - Changes will sync when online"
// Gmail: "No connection - Working offline"
```

## References

- [Google Docs Offline](https://support.google.com/docs/answer/6388102)
- [Gmail Offline](https://support.google.com/mail/answer/1308159)
- [Notion Offline Mode](https://www.notion.so/help/offline-mode)
- [MDN: Online/Offline Events](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)
- [Workbox: Offline Strategies](https://developers.google.com/web/tools/workbox/modules/workbox-strategies)
