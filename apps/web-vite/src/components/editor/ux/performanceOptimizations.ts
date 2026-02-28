/**
 * Performance Optimizations
 *
 * Utilities for optimizing editor performance with large documents.
 */

/**
 * Debounce function for editor updates
 */
export function debounceUpdate<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number = 100
): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      func(...args)
      timeoutId = null
    }, wait)
  }) as T
}

/**
 * Throttle function for scroll events
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  func: T,
  limit: number = 100
): T {
  let inThrottle: boolean
  return ((...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }) as T
}

/**
 * Measure performance of a function
 */
export function measurePerformance<T>(name: string, fn: () => T): T {
  const start = performance.now()
  const result = fn()
  const end = performance.now()
  const duration = end - start

  if (duration > 16) {
    console.warn(`[Performance] ${name} took ${duration.toFixed(2)}ms`)
  }

  return result
}

/**
 * Check if document is large enough to need optimization
 */
export function isLargeDocument(nodeCount: number): boolean {
  return nodeCount > 1000
}

/**
 * Estimate node height for virtualization
 */
export function estimateNodeHeight(nodeType: string): number {
  const estimates: Record<string, number> = {
    paragraph: 24,
    heading: 40,
    bulletList: 30,
    orderedList: 30,
    taskList: 30,
    table: 100,
    image: 200,
    codeBlock: 150,
    blockquote: 60,
  }

  return estimates[nodeType] || 50
}
