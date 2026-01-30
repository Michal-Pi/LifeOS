/**
 * MarkdownRenderer Component
 *
 * Renders markdown content with basic formatting support.
 * Created to avoid adding react-markdown as a dependency.
 */

import { useMemo } from 'react'

interface MarkdownRendererProps {
  content: string
  className?: string
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const renderedContent = useMemo(() => {
    if (!content) return ''

    // Simple markdown to HTML conversion
    let html = content

    // Code blocks
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code class="language-${lang || 'text'}">${escapeHtml(code.trim())}</code></pre>`
    })

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')

    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')

    // Headers (H1-H3)
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

    // Unordered lists
    html = html.replace(/^\* (.+)$/gm, '<li>$1</li>')
    html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>')

    // Line breaks (preserve double line breaks as paragraphs)
    html = html.replace(/\n\n/g, '</p><p>')
    html = html.replace(/\n/g, '<br />')

    // Wrap in paragraph if not already wrapped
    if (!html.startsWith('<')) {
      html = `<p>${html}</p>`
    }

    return html
  }, [content])

  return (
    <div
      className={`markdown-content ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  )
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }
  return text.replace(/[&<>"']/g, (char) => map[char] || char)
}
