const CACHE_NAME = 'lifeos-shell-v1'
const RUNTIME_CACHE = 'lifeos-runtime-v1'
const SHELL_ASSETS = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => {
        // Clear runtime cache on activation to ensure fresh chunks
        return caches.delete(RUNTIME_CACHE)
      })
  )
  self.clients.claim()
})

// Listen for skip waiting message from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Check if a URL is a JavaScript chunk (has hash in filename)
function isJavaScriptChunk(url) {
  return /\.js$/.test(url.pathname) && /-[a-f0-9]{8,}\.js$/.test(url.pathname)
}

// Check if a URL is a static asset (images, fonts, etc.)
function isStaticAsset(url) {
  return /\.(jpg|jpeg|png|gif|svg|webp|ico|woff|woff2|ttf|eot)$/i.test(url.pathname)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigation requests - network first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy))
          return response
        })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // JavaScript chunks - network first (they're versioned by hash, so cache can be stale)
  if (isJavaScriptChunk(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only cache if response is OK (don't cache 404s)
          if (response.ok) {
            const copy = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch((error) => {
          // If network fails, try cache, but don't fail silently
          return caches.match(request).then((cached) => {
            if (cached) {
              return cached
            }
            // If both fail, throw to trigger error boundary
            throw error
          })
        })
    )
    return
  }

  // Static assets - cache first, network fallback
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
      })
    )
    return
  }

  // Other assets (CSS, etc.) - network first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(() => caches.match(request))
  )
})
