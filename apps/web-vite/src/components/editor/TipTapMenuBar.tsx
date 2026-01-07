/**
 * TipTap Menu Bar Component
 *
 * Toolbar for TipTap editor with formatting options:
 * - Headings (H1-H6)
 * - Text formatting (Bold, Italic, Strike, Code)
 * - Lists (Bullet, Numbered, Task List)
 * - Insert options (Table, Math, Code Block, Blockquote, Horizontal Rule)
 */

import type { Editor } from '@tiptap/react'
import { useState, useRef, useEffect } from 'react'
import './TipTapMenuBar.css'

interface TipTapMenuBarProps {
  editor: Editor | null
}

export function TipTapMenuBar({ editor }: TipTapMenuBarProps) {
  const [showHeadingMenu, setShowHeadingMenu] = useState(false)
  const [showInsertMenu, setShowInsertMenu] = useState(false)
  const [showFontFamilyMenu, setShowFontFamilyMenu] = useState(false)
  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false)
  const headingMenuRef = useRef<HTMLDivElement>(null)
  const insertMenuRef = useRef<HTMLDivElement>(null)
  const fontFamilyMenuRef = useRef<HTMLDivElement>(null)
  const fontSizeMenuRef = useRef<HTMLDivElement>(null)

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (headingMenuRef.current && !headingMenuRef.current.contains(event.target as Node)) {
        setShowHeadingMenu(false)
      }
      if (insertMenuRef.current && !insertMenuRef.current.contains(event.target as Node)) {
        setShowInsertMenu(false)
      }
      if (fontFamilyMenuRef.current && !fontFamilyMenuRef.current.contains(event.target as Node)) {
        setShowFontFamilyMenu(false)
      }
      if (fontSizeMenuRef.current && !fontSizeMenuRef.current.contains(event.target as Node)) {
        setShowFontSizeMenu(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  if (!editor) {
    return null
  }

  const setHeading = (level: 1 | 2 | 3 | 4 | 5 | 6) => {
    editor.chain().focus().toggleHeading({ level }).run()
    setShowHeadingMenu(false)
  }

  const insertTable = () => {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    setShowInsertMenu(false)
  }

  const insertMath = () => {
    // Insert inline math - user can type the formula
    const formula = prompt('Enter LaTeX formula:')
    if (formula !== null) {
      editor.chain().focus().insertContent({ type: 'mathInline', attrs: { formula } }).run()
    }
    setShowInsertMenu(false)
  }

  const insertCodeBlock = () => {
    editor.chain().focus().toggleCodeBlock().run()
    setShowInsertMenu(false)
  }

  const insertBlockquote = () => {
    editor.chain().focus().toggleBlockquote().run()
    setShowInsertMenu(false)
  }

  const insertHorizontalRule = () => {
    editor.chain().focus().setHorizontalRule().run()
    setShowInsertMenu(false)
  }

  const insertTaskList = () => {
    editor.chain().focus().toggleTaskList().run()
    setShowInsertMenu(false)
  }

  return (
    <div className="tiptap-menu-bar">
      {/* Text Formatting */}
      <div className="menu-group">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={`menu-button ${editor.isActive('bold') ? 'is-active' : ''}`}
          title="Bold (Ctrl+B)"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={`menu-button ${editor.isActive('italic') ? 'is-active' : ''}`}
          title="Italic (Ctrl+I)"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          className={`menu-button ${editor.isActive('strike') ? 'is-active' : ''}`}
          title="Strikethrough"
        >
          <s>S</s>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleCode().run()}
          disabled={!editor.can().chain().focus().toggleCode().run()}
          className={`menu-button ${editor.isActive('code') ? 'is-active' : ''}`}
          title="Inline Code"
        >
          <code>&lt;/&gt;</code>
        </button>
      </div>

      <div className="menu-divider" />

      {/* Headings */}
      <div className="menu-group" ref={headingMenuRef}>
        <div className="menu-dropdown">
          <button
            type="button"
            onClick={() => setShowHeadingMenu(!showHeadingMenu)}
            className={`menu-button ${editor.isActive('heading') ? 'is-active' : ''}`}
            title="Headings"
          >
            H<span className="menu-button-subscript">1-6</span>
            <span className="menu-arrow">▼</span>
          </button>
          {showHeadingMenu && (
            <div className="menu-dropdown-content">
              <button
                type="button"
                onClick={() => setHeading(1)}
                className={`menu-dropdown-item ${editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}`}
              >
                <span className="menu-item-heading">Heading 1</span>
                <span className="menu-item-preview">H1</span>
              </button>
              <button
                type="button"
                onClick={() => setHeading(2)}
                className={`menu-dropdown-item ${editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}`}
              >
                <span className="menu-item-heading">Heading 2</span>
                <span className="menu-item-preview">H2</span>
              </button>
              <button
                type="button"
                onClick={() => setHeading(3)}
                className={`menu-dropdown-item ${editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}`}
              >
                <span className="menu-item-heading">Heading 3</span>
                <span className="menu-item-preview">H3</span>
              </button>
              <button
                type="button"
                onClick={() => setHeading(4)}
                className={`menu-dropdown-item ${editor.isActive('heading', { level: 4 }) ? 'is-active' : ''}`}
              >
                <span className="menu-item-heading">Heading 4</span>
                <span className="menu-item-preview">H4</span>
              </button>
              <button
                type="button"
                onClick={() => setHeading(5)}
                className={`menu-dropdown-item ${editor.isActive('heading', { level: 5 }) ? 'is-active' : ''}`}
              >
                <span className="menu-item-heading">Heading 5</span>
                <span className="menu-item-preview">H5</span>
              </button>
              <button
                type="button"
                onClick={() => setHeading(6)}
                className={`menu-dropdown-item ${editor.isActive('heading', { level: 6 }) ? 'is-active' : ''}`}
              >
                <span className="menu-item-heading">Heading 6</span>
                <span className="menu-item-preview">H6</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().setParagraph().run()
                  setShowHeadingMenu(false)
                }}
                className={`menu-dropdown-item ${editor.isActive('paragraph') ? 'is-active' : ''}`}
              >
                <span className="menu-item-heading">Paragraph</span>
                <span className="menu-item-preview">P</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="menu-divider" />

      {/* Lists */}
      <div className="menu-group">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`menu-button ${editor.isActive('bulletList') ? 'is-active' : ''}`}
          title="Bullet List"
        >
          <span className="menu-icon">•</span>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`menu-button ${editor.isActive('orderedList') ? 'is-active' : ''}`}
          title="Numbered List"
        >
          <span className="menu-icon">1.</span>
        </button>
        <button
          type="button"
          onClick={insertTaskList}
          className={`menu-button ${editor.isActive('taskList') ? 'is-active' : ''}`}
          title="Task List"
        >
          <span className="menu-icon">☑</span>
        </button>
      </div>

      <div className="menu-divider" />

      {/* Insert Menu */}
      <div className="menu-group" ref={insertMenuRef}>
        <div className="menu-dropdown">
          <button
            type="button"
            onClick={() => setShowInsertMenu(!showInsertMenu)}
            className="menu-button"
            title="Insert"
          >
            <span className="menu-icon">+</span>
            <span className="menu-arrow">▼</span>
          </button>
          {showInsertMenu && (
            <div className="menu-dropdown-content">
              <button type="button" onClick={insertTable} className="menu-dropdown-item">
                <span className="menu-item-heading">Table</span>
                <span className="menu-item-icon">⊞</span>
              </button>
              <button type="button" onClick={insertMath} className="menu-dropdown-item">
                <span className="menu-item-heading">Math Equation</span>
                <span className="menu-item-icon">∑</span>
              </button>
              <button type="button" onClick={insertCodeBlock} className="menu-dropdown-item">
                <span className="menu-item-heading">Code Block</span>
                <span className="menu-item-icon">{'</>'}</span>
              </button>
              <button type="button" onClick={insertBlockquote} className="menu-dropdown-item">
                <span className="menu-item-heading">Quote</span>
                <span className="menu-item-icon">"</span>
              </button>
              <button type="button" onClick={insertHorizontalRule} className="menu-dropdown-item">
                <span className="menu-item-heading">Divider</span>
                <span className="menu-item-icon">—</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="menu-divider" />

      {/* Additional Formatting */}
      <div className="menu-group">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          className={`menu-button ${editor.isActive('highlight') ? 'is-active' : ''}`}
          title="Highlight"
        >
          <span className="menu-icon">🖍</span>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          disabled={!editor.can().chain().focus().toggleSuperscript().run()}
          className={`menu-button ${editor.isActive('superscript') ? 'is-active' : ''}`}
          title="Superscript (Cmd+.)"
        >
          <span className="menu-icon">x²</span>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          disabled={!editor.can().chain().focus().toggleSubscript().run()}
          className={`menu-button ${editor.isActive('subscript') ? 'is-active' : ''}`}
          title="Subscript (Cmd+,)"
        >
          <span className="menu-icon">x₂</span>
        </button>
      </div>

      <div className="menu-divider" />

      {/* Font Family */}
      <div className="menu-group" ref={fontFamilyMenuRef}>
        <div className="menu-dropdown">
          <button
            type="button"
            className="menu-button"
            title="Font Family"
            onClick={() => setShowFontFamilyMenu(!showFontFamilyMenu)}
          >
            <span className="menu-icon">Aa</span>
            <span className="menu-arrow">▼</span>
          </button>
          {showFontFamilyMenu && (
            <div className="menu-dropdown-content">
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  editor.chain().focus().setFontFamily('Inter, sans-serif').run()
                  setShowFontFamilyMenu(false)
                }}
              >
                <span className="menu-item-heading">Inter</span>
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  editor.chain().focus().setFontFamily('Georgia, serif').run()
                  setShowFontFamilyMenu(false)
                }}
              >
                <span className="menu-item-heading">Georgia</span>
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  editor.chain().focus().setFontFamily('Monaco, monospace').run()
                  setShowFontFamilyMenu(false)
                }}
              >
                <span className="menu-item-heading">Monaco</span>
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  editor.chain().focus().unsetFontFamily().run()
                  setShowFontFamilyMenu(false)
                }}
              >
                <span className="menu-item-heading">Default</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="menu-divider" />

      {/* Font Size */}
      <div className="menu-group" ref={fontSizeMenuRef}>
        <div className="menu-dropdown">
          <button
            type="button"
            className="menu-button"
            title="Font Size"
            onClick={() => setShowFontSizeMenu(!showFontSizeMenu)}
          >
            <span className="menu-icon">12</span>
            <span className="menu-arrow">▼</span>
          </button>
          {showFontSizeMenu && (
            <div className="menu-dropdown-content">
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  editor.chain().focus().setFontSize('12px').run()
                  setShowFontSizeMenu(false)
                }}
              >
                <span className="menu-item-heading">12px</span>
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  editor.chain().focus().setFontSize('14px').run()
                  setShowFontSizeMenu(false)
                }}
              >
                <span className="menu-item-heading">14px</span>
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  editor.chain().focus().setFontSize('16px').run()
                  setShowFontSizeMenu(false)
                }}
              >
                <span className="menu-item-heading">16px</span>
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  editor.chain().focus().setFontSize('18px').run()
                  setShowFontSizeMenu(false)
                }}
              >
                <span className="menu-item-heading">18px</span>
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  editor.chain().focus().setFontSize('20px').run()
                  setShowFontSizeMenu(false)
                }}
              >
                <span className="menu-item-heading">20px</span>
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  editor.chain().focus().setFontSize('24px').run()
                  setShowFontSizeMenu(false)
                }}
              >
                <span className="menu-item-heading">24px</span>
              </button>
              <button
                type="button"
                className="menu-dropdown-item"
                onClick={() => {
                  editor.chain().focus().unsetFontSize().run()
                  setShowFontSizeMenu(false)
                }}
              >
                <span className="menu-item-heading">Default</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
