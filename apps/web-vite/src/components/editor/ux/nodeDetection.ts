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
  let currentPos = 1 // Start after document node

  doc.forEach((node) => {
    nodes.push({
      node,
      position: currentPos,
      id: `node-${currentPos}`, // Generate unique ID
    })
    // Move to next position (accounting for current node size)
    currentPos += node.nodeSize
  })

  return nodes
}

/**
 * Get the top-level node at a given position
 */
export function getTopLevelNodeAt(editor: Editor, position: number): TopLevelNodeInfo | null {
  const { doc } = editor.state
  let currentPos = 1

  let foundNode: ProseMirrorNode | null = null
  let foundOffset = 0

  doc.forEach((node) => {
    const nodeStart = currentPos
    const nodeEnd = nodeStart + node.nodeSize

    if (position >= nodeStart && position < nodeEnd) {
      foundNode = node
      foundOffset = nodeStart
    }
    // Move to next position
    currentPos += node.nodeSize
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
  let currentPos = 1

  let isBoundary = false

  doc.forEach((node) => {
    const nodeStart = currentPos
    const nodeEnd = nodeStart + node.nodeSize

    // Check if position is at the start or end of a top-level node
    if (position === nodeStart || position === nodeEnd) {
      isBoundary = true
    }
    // Move to next position
    currentPos += node.nodeSize
  })

  return isBoundary
}
