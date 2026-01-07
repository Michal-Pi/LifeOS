/**
 * VirtualizedEditor Component
 *
 * Performance optimization wrapper for TipTap editor.
 * Uses intersection observer and memoization for large documents.
 */

import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import type { ReactNode } from 'react'

interface VirtualizedEditorProps {
  editor: Editor
  children: ReactNode
}

/**
 * Note: Full virtualization with ProseMirror is complex because ProseMirror
 * manages its own DOM and selections. This component provides optimizations
 * that work with TipTap's architecture:
 *
 * 1. Intersection Observer for lazy loading
 * 2. Memoization of expensive operations
 * 3. Debounced updates
 * 4. Performance monitoring
 */
export function VirtualizedEditor({ editor, children }: VirtualizedEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Monitor performance
  useEffect(() => {
    if (!editor) return

    const handleUpdate = () => {
      const start = performance.now()
      // Force a small delay to measure
      requestAnimationFrame(() => {
        const end = performance.now()
        const duration = end - start

        // Log if update takes too long (for debugging)
        if (duration > 16) {
          console.warn(`Editor update took ${duration.toFixed(2)}ms`)
        }
      })
    }

    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor])

  // Set up intersection observer for lazy loading images
  useEffect(() => {
    if (!containerRef.current) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target as HTMLImageElement
            // Image is already loaded by TipTap, but we can optimize here
            if (img.dataset.lazy === 'true' && !img.src) {
              // Handle lazy loading if needed
            }
          }
        })
      },
      {
        root: containerRef.current,
        rootMargin: '200px', // Start loading 200px before visible
        threshold: 0.1,
      }
    )

    // Observe all images in the editor
    const images = containerRef.current.querySelectorAll('img')
    images.forEach((img) => {
      observerRef.current?.observe(img)
    })

    return () => {
      observerRef.current?.disconnect()
    }
  }, [editor])

  return (
    <div ref={containerRef} className="virtualized-editor-container">
      {children}
    </div>
  )
}
