/**
 * Node Detection Utilities
 *
 * Functions to detect and work with top-level nodes in ProseMirror document.
 */

import type { Editor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

export interface TopLevelNodeInfo {
  node: ProseMirrorNode
  position: number
  id: string
}

/**
 * Get all top-level nodes from the editor
 */
export function getTopLevelNodes(editor: Editor): TopLevelNodeInfo[] {
  const { doc } = editor.state
  const nodes: TopLevelNodeInfo[] = []
  const position = 1 // Start after document node

  doc.forEach((node, offset) => {
    nodes.push({
      node,
      position: position + offset,
      id: `node-${position + offset}`, // Generate unique ID
    })
  })

  return nodes
}

/**
 * Get the top-level node at a given position
 */
export function getTopLevelNodeAt(editor: Editor, position: number): TopLevelNodeInfo | null {
  const { doc } = editor.state
  const currentPos = 1

  let foundNode: ProseMirrorNode | null = null
  let foundOffset = 0

  doc.forEach((node, offset) => {
    const nodeStart = currentPos + offset
    const nodeEnd = nodeStart + node.nodeSize

    if (position >= nodeStart && position < nodeEnd) {
      foundNode = node
      foundOffset = nodeStart
    }
  })

  if (!foundNode) return null

  return {
    node: foundNode,
    position: foundOffset,
    id: `node-${foundOffset}`,
  }
}

/**
 * Check if a position is at a top-level node boundary
 */
export function isTopLevelNodeBoundary(editor: Editor, position: number): boolean {
  const { doc } = editor.state
  const currentPos = 1

  let isBoundary = false

  doc.forEach((node, offset) => {
    const nodeStart = currentPos + offset
    const nodeEnd = nodeStart + node.nodeSize

    // Check if position is at the start or end of a top-level node
    if (position === nodeStart || position === nodeEnd) {
      isBoundary = true
    }
  })

  return isBoundary
}
