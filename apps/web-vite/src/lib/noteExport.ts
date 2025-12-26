/**
 * Note Export Utilities
 *
 * Provides functionality to export notes to various formats:
 * - Markdown
 * - Plain text
 * - Clipboard
 */

import type { JSONContent } from '@tiptap/core'
import type { Note } from '@lifeos/notes'

/**
 * Convert ProseMirror JSONContent to Markdown
 */
export function jsonContentToMarkdown(content: JSONContent): string {
  if (!content) return ''

  const processNode = (node: JSONContent): string => {
    const { type, content: children, marks, text, attrs } = node

    // Handle text nodes with marks
    if (type === 'text' && text) {
      let result = text

      if (marks && marks.length > 0) {
        marks.forEach((mark) => {
          switch (mark.type) {
            case 'bold':
              result = `**${result}**`
              break
            case 'italic':
              result = `*${result}*`
              break
            case 'code':
              result = `\`${result}\``
              break
            case 'link':
              result = `[${result}](${mark.attrs?.href || ''})`
              break
            case 'strike':
              result = `~~${result}~~`
              break
          }
        })
      }

      return result
    }

    // Handle block and inline nodes
    switch (type) {
      case 'doc':
        return children?.map(processNode).join('\n\n') || ''

      case 'paragraph':
        return children?.map(processNode).join('') || ''

      case 'heading': {
        const level = attrs?.level || 1
        const heading = '#'.repeat(level)
        const text = children?.map(processNode).join('') || ''
        return `${heading} ${text}`
      }

      case 'bulletList':
        return (
          children
            ?.map((item) => {
              const itemText = processNode(item)
              return itemText
                .split('\n')
                .map((line, i) => (i === 0 ? `- ${line}` : `  ${line}`))
                .join('\n')
            })
            .join('\n') || ''
        )

      case 'orderedList': {
        const start = attrs?.start || 1
        return (
          children
            ?.map((item, index) => {
              const itemText = processNode(item)
              return itemText
                .split('\n')
                .map((line, i) => (i === 0 ? `${start + index}. ${line}` : `   ${line}`))
                .join('\n')
            })
            .join('\n') || ''
        )
      }

      case 'listItem':
        return children?.map(processNode).join('\n') || ''

      case 'blockquote': {
        const text = children?.map(processNode).join('\n') || ''
        return text
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')
      }

      case 'codeBlock': {
        const language = attrs?.language || ''
        const code = children?.map(processNode).join('') || ''
        return `\`\`\`${language}\n${code}\n\`\`\``
      }

      case 'hardBreak':
        return '  \n'

      case 'horizontalRule':
        return '---'

      case 'image':
        return `![${attrs?.alt || ''}](${attrs?.src || ''})`

      case 'taskList':
        return children?.map(processNode).join('\n') || ''

      case 'taskItem': {
        const checked = attrs?.checked ? 'x' : ' '
        const text = children?.map(processNode).join('') || ''
        return `- [${checked}] ${text}`
      }

      default:
        return children?.map(processNode).join('') || ''
    }
  }

  return processNode(content)
}

/**
 * Convert ProseMirror JSONContent to plain text
 */
export function jsonContentToPlainText(content: JSONContent): string {
  if (!content) return ''

  const processNode = (node: JSONContent): string => {
    const { type, content: children, text } = node

    if (type === 'text' && text) {
      return text
    }

    switch (type) {
      case 'doc':
        return children?.map(processNode).join('\n\n') || ''

      case 'paragraph':
        return children?.map(processNode).join('') || ''

      case 'heading':
        return children?.map(processNode).join('') || ''

      case 'bulletList':
      case 'orderedList':
        return children?.map((item) => `• ${processNode(item)}`).join('\n') || ''

      case 'listItem':
        return children?.map(processNode).join(' ') || ''

      case 'blockquote':
        return children?.map(processNode).join('\n') || ''

      case 'codeBlock':
        return children?.map(processNode).join('') || ''

      case 'hardBreak':
        return '\n'

      case 'horizontalRule':
        return '---'

      case 'taskList':
        return children?.map(processNode).join('\n') || ''

      case 'taskItem':
        return children?.map(processNode).join('') || ''

      default:
        return children?.map(processNode).join('') || ''
    }
  }

  return processNode(content)
}

/**
 * Export note to Markdown format
 */
export function exportNoteToMarkdown(note: Note): string {
  const parts: string[] = []

  // Title
  parts.push(`# ${note.title}`)
  parts.push('')

  // Metadata
  const createdDate = new Date(note.createdAtMs).toLocaleDateString()
  const updatedDate = new Date(note.updatedAtMs).toLocaleDateString()
  parts.push(`_Created: ${createdDate} | Updated: ${updatedDate}_`)
  parts.push('')

  // Tags
  if (note.tags && note.tags.length > 0) {
    parts.push(`Tags: ${note.tags.map((tag) => `#${tag}`).join(' ')}`)
    parts.push('')
  }

  // Content
  const contentMarkdown = jsonContentToMarkdown(note.content)
  parts.push(contentMarkdown)

  return parts.join('\n')
}

/**
 * Export note to plain text format
 */
export function exportNoteToPlainText(note: Note): string {
  const parts: string[] = []

  // Title
  parts.push(note.title)
  parts.push('='.repeat(note.title.length))
  parts.push('')

  // Metadata
  const createdDate = new Date(note.createdAtMs).toLocaleDateString()
  const updatedDate = new Date(note.updatedAtMs).toLocaleDateString()
  parts.push(`Created: ${createdDate}`)
  parts.push(`Updated: ${updatedDate}`)
  parts.push('')

  // Tags
  if (note.tags && note.tags.length > 0) {
    parts.push(`Tags: ${note.tags.join(', ')}`)
    parts.push('')
  }

  // Content
  const contentText = jsonContentToPlainText(note.content)
  parts.push(contentText)

  return parts.join('\n')
}

/**
 * Download note as a file
 */
export function downloadNote(note: Note, format: 'markdown' | 'text') {
  const content = format === 'markdown' ? exportNoteToMarkdown(note) : exportNoteToPlainText(note)
  const extension = format === 'markdown' ? 'md' : 'txt'
  const filename = `${note.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${extension}`

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  URL.revokeObjectURL(url)
}

/**
 * Copy note content to clipboard
 */
export async function copyNoteToClipboard(note: Note, format: 'markdown' | 'text'): Promise<void> {
  const content = format === 'markdown' ? exportNoteToMarkdown(note) : exportNoteToPlainText(note)

  try {
    await navigator.clipboard.writeText(content)
  } catch {
    // Fallback for browsers that don't support clipboard API
    const textarea = document.createElement('textarea')
    textarea.value = content
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  }
}
