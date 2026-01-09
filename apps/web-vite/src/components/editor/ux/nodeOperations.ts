/**
 * Node Operations
 *
 * Functions to perform operations on nodes using ProseMirror transactions.
 */

import type { Editor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/**
 * Move a node from one position to another
 */
export function moveNode(editor: Editor, fromPosition: number, toPosition: number): boolean {
  const { state, view } = editor
  const { doc } = state

  // Validate positions
  if (fromPosition < 1 || fromPosition >= doc.content.size) return false
  if (toPosition < 1 || toPosition >= doc.content.size) return false

  // Get the node at fromPosition
  let fromNode: { node: ProseMirrorNode; start: number; end: number } | null = null
  let currentPos = 1

  doc.forEach((node) => {
    const nodeStart = currentPos
    const nodeEnd = nodeStart + node.nodeSize

    if (fromPosition >= nodeStart && fromPosition < nodeEnd) {
      fromNode = { node, start: nodeStart, end: nodeEnd }
    }
    // Move to next position
    currentPos += node.nodeSize
  })

  if (!fromNode) return false

  // Don't move if already at target position
  if (toPosition >= fromNode.start && toPosition <= fromNode.end) {
    return false
  }

  // Perform the move using TipTap commands
  try {
    // First, delete the node
    const tr1 = state.tr.delete(fromNode.start, fromNode.end)
    const newState = state.apply(tr1)

    // Calculate new position after deletion
    let adjustedToPosition = toPosition
    if (toPosition > fromNode.end) {
      // Moving down - adjust for deleted node
      adjustedToPosition = toPosition - fromNode.node.nodeSize
    } else if (toPosition > fromNode.start) {
      // Target is within the node being moved - use start position
      adjustedToPosition = fromNode.start
    }

    // Ensure position is valid
    if (adjustedToPosition < 1 || adjustedToPosition >= newState.doc.content.size) {
      adjustedToPosition = newState.doc.content.size - 1
    }

    // Insert the node at new position
    const tr2 = newState.tr.insert(adjustedToPosition, fromNode.node)
    view.dispatch(tr2)

    return true
  } catch (error) {
    console.error('Failed to move node:', error)
    return false
  }
}

/**
 * Duplicate a node
 */
export function duplicateNode(editor: Editor, position: number): boolean {
  const { state, view } = editor
  const { tr, doc } = state

  // Find the node at position
  let targetNode: { node: ProseMirrorNode; start: number; end: number } | null = null
  let currentPos = 1

  doc.forEach((node) => {
    const nodeStart = currentPos
    const nodeEnd = nodeStart + node.nodeSize

    if (position >= nodeStart && position < nodeEnd) {
      targetNode = { node, start: nodeStart, end: nodeEnd }
    }
    // Move to next position
    currentPos += node.nodeSize
  })

  if (!targetNode) return false

  try {
    // Insert duplicate after the original node
    tr.insert(targetNode.end, targetNode.node)
    view.dispatch(tr)
    return true
  } catch (error) {
    console.error('Failed to duplicate node:', error)
    return false
  }
}

/**
 * Delete a node
 */
export function deleteNode(editor: Editor, position: number): boolean {
  const { state, view } = editor
  const { tr, doc } = state

  // Find the node at position
  let targetNode: { node: ProseMirrorNode; start: number; end: number } | null = null
  let currentPos = 1

  doc.forEach((node) => {
    const nodeStart = currentPos
    const nodeEnd = nodeStart + node.nodeSize

    if (position >= nodeStart && position < nodeEnd) {
      targetNode = { node, start: nodeStart, end: nodeEnd }
    }
    // Move to next position
    currentPos += node.nodeSize
  })

  if (!targetNode) return false

  try {
    // Delete the node directly
    tr.delete(targetNode.start, targetNode.end)
    view.dispatch(tr)
    return true
  } catch (error) {
    console.error('Failed to delete node:', error)
    return false
  }
}

/**
 * Insert a new block at a specific position
 */
export function insertBlockAt(
  editor: Editor,
  position: number,
  blockType:
    | 'paragraph'
    | 'heading'
    | 'bulletList'
    | 'orderedList'
    | 'codeBlock'
    | 'blockquote' = 'paragraph'
): boolean {
  const { state, view } = editor
  const { tr, doc } = state

  // Validate position
  if (position < 1 || position > doc.content.size) {
    // If position is out of range, append at the end
    position = doc.content.size
  }

  try {
    // Create the appropriate node type
    let newNode: ProseMirrorNode
    const schema = state.schema

    switch (blockType) {
      case 'heading':
        newNode = schema.nodes.heading.create({ level: 1 })
        break
      case 'bulletList':
        newNode = schema.nodes.bulletList.create()
        break
      case 'orderedList':
        newNode = schema.nodes.orderedList.create()
        break
      case 'codeBlock':
        newNode = schema.nodes.codeBlock.create()
        break
      case 'blockquote':
        newNode = schema.nodes.blockquote.create()
        break
      default:
        newNode = schema.nodes.paragraph.create()
    }

    // Insert the node
    tr.insert(position, newNode)
    view.dispatch(tr)

    // Focus and position cursor in the new node
    const newPos = position + 1
    editor.chain().focus().setTextSelection(newPos).run()

    return true
  } catch (error) {
    console.error('Failed to insert block:', error)
    return false
  }
}
