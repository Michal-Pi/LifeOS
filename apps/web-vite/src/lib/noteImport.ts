/**
 * Note Import Utilities
 *
 * Provides functionality to import documents into notes:
 * - Markdown (.md)
 * - PDF (.pdf)
 * - Plain text (.txt)
 */

import type { JSONContent } from '@tiptap/core'
import { marked, type Tokens } from 'marked'
import * as pdfjsLib from 'pdfjs-dist'

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

/**
 * File reading utilities
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}

export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

/**
 * Extract YAML frontmatter from markdown
 * Returns extracted metadata and the content without frontmatter
 */
export function extractMarkdownFrontmatter(markdown: string): {
  title?: string
  tags?: string[]
  content: string
} {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/
  const match = markdown.match(frontmatterRegex)

  if (!match) {
    return { content: markdown }
  }

  const frontmatter = match[1]
  const content = markdown.slice(match[0].length)

  // Simple YAML parsing for common fields
  const result: { title?: string; tags?: string[]; content: string } = { content }

  // Extract title
  const titleMatch = frontmatter.match(/^title:\s*["']?(.+?)["']?\s*$/m)
  if (titleMatch) {
    result.title = titleMatch[1]
  }

  // Extract tags (supports both array and comma-separated)
  const tagsMatch = frontmatter.match(/^tags:\s*\[(.+?)\]/m)
  if (tagsMatch) {
    result.tags = tagsMatch[1].split(',').map((t) => t.trim().replace(/["']/g, ''))
  } else {
    const tagsLineMatch = frontmatter.match(/^tags:\s*(.+)$/m)
    if (tagsLineMatch) {
      result.tags = tagsLineMatch[1].split(',').map((t) => t.trim().replace(/["']/g, ''))
    }
  }

  return result
}

/**
 * Convert markdown text marks to ProseMirror marks
 */
function parseInlineMarks(text: string): JSONContent[] {
  // Use marked's lexer to parse inline content
  const tokens = marked.lexer(text)
  const result: JSONContent[] = []

  function processToken(token: Tokens.Generic): JSONContent[] {
    const nodes: JSONContent[] = []

    if (token.type === 'text' || token.type === 'escape') {
      if (token.text) {
        nodes.push({ type: 'text', text: token.text })
      }
    } else if (token.type === 'strong') {
      const children = processTokens(token.tokens || [])
      for (const child of children) {
        nodes.push({
          ...child,
          marks: [...(child.marks || []), { type: 'bold' }],
        })
      }
    } else if (token.type === 'em') {
      const children = processTokens(token.tokens || [])
      for (const child of children) {
        nodes.push({
          ...child,
          marks: [...(child.marks || []), { type: 'italic' }],
        })
      }
    } else if (token.type === 'codespan') {
      nodes.push({
        type: 'text',
        text: token.text,
        marks: [{ type: 'code' }],
      })
    } else if (token.type === 'link') {
      const children = processTokens(token.tokens || [])
      for (const child of children) {
        nodes.push({
          ...child,
          marks: [...(child.marks || []), { type: 'link', attrs: { href: token.href } }],
        })
      }
    } else if (token.type === 'del') {
      const children = processTokens(token.tokens || [])
      for (const child of children) {
        nodes.push({
          ...child,
          marks: [...(child.marks || []), { type: 'strike' }],
        })
      }
    } else if (token.type === 'br') {
      nodes.push({ type: 'hardBreak' })
    } else if (token.type === 'image') {
      nodes.push({
        type: 'image',
        attrs: {
          src: token.href,
          alt: token.text || '',
          title: token.title || null,
        },
      })
    } else if ('tokens' in token && token.tokens) {
      nodes.push(...processTokens(token.tokens as Tokens.Generic[]))
    } else if ('text' in token && token.text) {
      nodes.push({ type: 'text', text: token.text })
    }

    return nodes
  }

  function processTokens(tokens: Tokens.Generic[]): JSONContent[] {
    const nodes: JSONContent[] = []
    for (const token of tokens) {
      nodes.push(...processToken(token))
    }
    return nodes
  }

  // Process paragraph tokens to extract inline content
  for (const token of tokens) {
    if (token.type === 'paragraph' && token.tokens) {
      result.push(...processTokens(token.tokens as Tokens.Generic[]))
    } else {
      result.push(...processToken(token as Tokens.Generic))
    }
  }

  return result.length > 0 ? result : [{ type: 'text', text: text }]
}

/**
 * Convert Markdown to ProseMirror JSONContent
 */
export function markdownToJsonContent(markdown: string): JSONContent {
  const tokens = marked.lexer(markdown)
  const content: JSONContent[] = []

  function processToken(token: Tokens.Generic): JSONContent | JSONContent[] | null {
    switch (token.type) {
      case 'heading': {
        const headingToken = token as Tokens.Heading
        return {
          type: 'heading',
          attrs: { level: headingToken.depth },
          content: parseInlineMarks(headingToken.text),
        }
      }

      case 'paragraph': {
        const paragraphToken = token as Tokens.Paragraph
        return {
          type: 'paragraph',
          content: parseInlineMarks(paragraphToken.text),
        }
      }

      case 'list': {
        const listToken = token as Tokens.List
        const listType = listToken.ordered ? 'orderedList' : 'bulletList'
        const listItems: JSONContent[] = []

        for (const item of listToken.items) {
          // Check if it's a task list item
          if (item.task) {
            const taskListItem: JSONContent = {
              type: 'taskItem',
              attrs: { checked: item.checked },
              content: [
                {
                  type: 'paragraph',
                  content: parseInlineMarks(item.text),
                },
              ],
            }
            listItems.push(taskListItem)
          } else {
            // Regular list item
            const listItemContent: JSONContent[] = []

            // Process item tokens for nested content
            if (item.tokens) {
              for (const subToken of item.tokens) {
                if (subToken.type === 'text' && subToken.text) {
                  listItemContent.push({
                    type: 'paragraph',
                    content: parseInlineMarks(subToken.text),
                  })
                } else if (subToken.type === 'list') {
                  const nested = processToken(subToken as Tokens.Generic)
                  if (nested) {
                    if (Array.isArray(nested)) {
                      listItemContent.push(...nested)
                    } else {
                      listItemContent.push(nested)
                    }
                  }
                }
              }
            }

            if (listItemContent.length === 0) {
              listItemContent.push({
                type: 'paragraph',
                content: parseInlineMarks(item.text),
              })
            }

            listItems.push({
              type: 'listItem',
              content: listItemContent,
            })
          }
        }

        // If all items are task items, wrap in taskList
        const allTasks = listItems.every((item) => item.type === 'taskItem')
        if (allTasks) {
          return {
            type: 'taskList',
            content: listItems,
          }
        }

        return {
          type: listType,
          attrs: listToken.ordered ? { start: listToken.start || 1 } : undefined,
          content: listItems,
        }
      }

      case 'blockquote': {
        const blockquoteToken = token as Tokens.Blockquote
        const blockquoteContent: JSONContent[] = []

        if (blockquoteToken.tokens) {
          for (const subToken of blockquoteToken.tokens) {
            const processed = processToken(subToken as Tokens.Generic)
            if (processed) {
              if (Array.isArray(processed)) {
                blockquoteContent.push(...processed)
              } else {
                blockquoteContent.push(processed)
              }
            }
          }
        }

        return {
          type: 'blockquote',
          content:
            blockquoteContent.length > 0
              ? blockquoteContent
              : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
        }
      }

      case 'code': {
        const codeToken = token as Tokens.Code
        return {
          type: 'codeBlock',
          attrs: { language: codeToken.lang || null },
          content: [{ type: 'text', text: codeToken.text }],
        }
      }

      case 'hr':
        return { type: 'horizontalRule' }

      case 'space':
        return null

      case 'html': {
        // Try to preserve HTML as paragraph text
        const htmlToken = token as Tokens.HTML
        if (htmlToken.text.trim()) {
          return {
            type: 'paragraph',
            content: [{ type: 'text', text: htmlToken.text }],
          }
        }
        return null
      }

      case 'table': {
        const tableToken = token as Tokens.Table
        const rows: JSONContent[] = []

        // Header row
        const headerCells: JSONContent[] = tableToken.header.map((cell) => ({
          type: 'tableHeader',
          attrs: { colspan: 1, rowspan: 1 },
          content: [
            {
              type: 'paragraph',
              content: parseInlineMarks(cell.text),
            },
          ],
        }))
        rows.push({ type: 'tableRow', content: headerCells })

        // Body rows
        for (const row of tableToken.rows) {
          const cells: JSONContent[] = row.map((cell) => ({
            type: 'tableCell',
            attrs: { colspan: 1, rowspan: 1 },
            content: [
              {
                type: 'paragraph',
                content: parseInlineMarks(cell.text),
              },
            ],
          }))
          rows.push({ type: 'tableRow', content: cells })
        }

        return {
          type: 'table',
          content: rows,
        }
      }

      default:
        // For unknown tokens, try to extract text
        if ('text' in token && token.text) {
          return {
            type: 'paragraph',
            content: [{ type: 'text', text: token.text }],
          }
        }
        return null
    }
  }

  for (const token of tokens) {
    const processed = processToken(token as Tokens.Generic)
    if (processed) {
      if (Array.isArray(processed)) {
        content.push(...processed)
      } else {
        content.push(processed)
      }
    }
  }

  // Ensure we have at least one paragraph
  if (content.length === 0) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: '' }],
    })
  }

  return {
    type: 'doc',
    content,
  }
}

/**
 * Convert plain text to ProseMirror JSONContent
 */
export function plainTextToJsonContent(text: string): JSONContent {
  const lines = text.split(/\n\n+/)
  const content: JSONContent[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: trimmed.replace(/\n/g, ' ') }],
      })
    }
  }

  if (content.length === 0) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: '' }],
    })
  }

  return {
    type: 'doc',
    content,
  }
}

/**
 * Extract text from PDF and convert to ProseMirror JSONContent
 */
export async function pdfToJsonContent(pdfArrayBuffer: ArrayBuffer): Promise<JSONContent> {
  const pdf = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise
  const content: JSONContent[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()

    // Group text items into lines/paragraphs
    let currentParagraph = ''
    let lastY: number | null = null

    for (const item of textContent.items) {
      if ('str' in item) {
        const textItem = item as { str: string; transform: number[] }
        const y = textItem.transform[5]

        // Detect paragraph breaks based on Y position changes
        if (lastY !== null && Math.abs(y - lastY) > 20) {
          if (currentParagraph.trim()) {
            content.push({
              type: 'paragraph',
              content: [{ type: 'text', text: currentParagraph.trim() }],
            })
          }
          currentParagraph = ''
        }

        currentParagraph += textItem.str + ' '
        lastY = y
      }
    }

    // Add remaining paragraph
    if (currentParagraph.trim()) {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: currentParagraph.trim() }],
      })
    }

    // Add page break indicator for multi-page PDFs (except last page)
    if (pageNum < pdf.numPages) {
      content.push({ type: 'horizontalRule' })
    }
  }

  if (content.length === 0) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: '' }],
    })
  }

  return {
    type: 'doc',
    content,
  }
}

/**
 * Merge two JSONContent documents (append second to first)
 */
export function mergeJsonContent(existing: JSONContent, imported: JSONContent): JSONContent {
  const existingContent = existing.content || []
  const importedContent = imported.content || []

  // Add a separator between existing and imported content
  const separator: JSONContent = { type: 'horizontalRule' }

  return {
    type: 'doc',
    content: [...existingContent, separator, ...importedContent],
  }
}

/**
 * Detect file type from file extension
 */
export function detectFileType(file: File): 'markdown' | 'pdf' | 'text' | 'unknown' {
  const name = file.name.toLowerCase()
  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    return 'markdown'
  }
  if (name.endsWith('.pdf')) {
    return 'pdf'
  }
  if (name.endsWith('.txt')) {
    return 'text'
  }
  return 'unknown'
}

/**
 * Extract title from filename (remove extension and clean up)
 */
export function titleFromFilename(filename: string): string {
  // Remove extension
  const withoutExt = filename.replace(/\.(md|markdown|pdf|txt)$/i, '')
  // Replace underscores and hyphens with spaces
  const cleaned = withoutExt.replace(/[_-]/g, ' ')
  // Capitalize first letter
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
}

/**
 * Import a file and return parsed content with metadata
 */
export async function importFile(file: File): Promise<{
  content: JSONContent
  title: string
  tags?: string[]
  format: 'markdown' | 'pdf' | 'text'
}> {
  const fileType = detectFileType(file)

  if (fileType === 'unknown') {
    throw new Error(`Unsupported file format: ${file.name}`)
  }

  let content: JSONContent
  let title = titleFromFilename(file.name)
  let tags: string[] | undefined

  if (fileType === 'markdown') {
    const text = await readFileAsText(file)
    const { title: frontmatterTitle, tags: frontmatterTags, content: markdownContent } = extractMarkdownFrontmatter(text)

    if (frontmatterTitle) {
      title = frontmatterTitle
    }
    if (frontmatterTags) {
      tags = frontmatterTags
    }

    content = markdownToJsonContent(markdownContent)
  } else if (fileType === 'pdf') {
    const arrayBuffer = await readFileAsArrayBuffer(file)
    content = await pdfToJsonContent(arrayBuffer)
  } else {
    const text = await readFileAsText(file)
    content = plainTextToJsonContent(text)
  }

  return {
    content,
    title,
    tags,
    format: fileType,
  }
}
