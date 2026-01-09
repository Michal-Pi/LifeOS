/**
 * MathInlinePanel Component
 *
 * Inline helper panel for inserting LaTeX math.
 * Provides quick helpers and a live preview.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import * as katex from 'katex'
import './MathInlinePanel.css'

export interface MathInlinePanelProps {
  editor: Editor
  isOpen: boolean
  position: { x: number; y: number }
  onClose: () => void
  initialFormula?: string
}

const basicHelpers = [
  { label: 'Fraction', insert: '\\frac{a}{b}', hint: 'a/b' },
  { label: 'Power', insert: 'x^2', hint: 'x^2' },
  { label: 'Root', insert: '\\sqrt{x}', hint: 'sqrt' },
  { label: 'Pi', insert: '\\pi', hint: 'pi' },
  { label: 'Sum', insert: '\\sum_{i=1}^n', hint: 'sum' },
  { label: 'Integral', insert: '\\int_a^b', hint: 'int' },
]

const probabilityHelpers = [
  { label: 'Probability', insert: '\\mathbb{P}(A)', hint: 'P(A)' },
  { label: 'Conditional', insert: '\\mathbb{P}(A\\mid B)', hint: 'P(A|B)' },
  { label: 'Expectation', insert: '\\mathbb{E}[X]', hint: 'E[X]' },
  { label: 'Variance', insert: '\\mathrm{Var}(X)', hint: 'Var(X)' },
  {
    label: 'Bayes',
    insert: '\\mathbb{P}(A\\mid B)=\\frac{\\mathbb{P}(B\\mid A)\\mathbb{P}(A)}{\\mathbb{P}(B)}',
    hint: 'Bayes',
  },
  { label: 'Binomial', insert: '\\binom{n}{k}', hint: 'nCk' },
]

const calculusHelpers = [
  { label: 'Derivative', insert: '\\frac{d}{dx}f(x)', hint: 'd/dx' },
  { label: 'Partial', insert: '\\frac{\\partial}{\\partial x}f(x,y)', hint: '∂/∂x' },
  { label: 'Integral', insert: '\\int_a^b f(x)\\,dx', hint: '∫ f(x) dx' },
  { label: 'Limit', insert: '\\lim_{x\\to 0} f(x)', hint: 'lim' },
  { label: 'Gradient', insert: '\\nabla f', hint: '∇f' },
  { label: 'Series', insert: '\\sum_{n=0}^{\\infty} a_n', hint: 'Σ' },
]

const matrixStyles = [
  { label: '[ ]', value: 'bmatrix' },
  { label: '( )', value: 'pmatrix' },
  { label: '| |', value: 'vmatrix' },
  { label: '{ }', value: 'Bmatrix' },
]

function clampMatrixSize(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(value, 6))
}

function buildMatrixTemplate(rows: number, cols: number, style: string): string {
  const safeRows = Math.max(1, Math.min(rows, 6))
  const safeCols = Math.max(1, Math.min(cols, 6))
  const rowValues = Array.from({ length: safeRows }, (_, rowIndex) => {
    const colValues = Array.from({ length: safeCols }, (_, colIndex) => {
      return `a_{${rowIndex + 1}${colIndex + 1}}`
    })
    return colValues.join(' & ')
  })
  return `\\begin{${style}}${rowValues.join(' \\\\ ')}\\end{${style}}`
}

function insertAtCursor(
  input: HTMLInputElement,
  value: string,
  setValue: (next: string) => void
): void {
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? input.value.length
  const next = `${input.value.slice(0, start)}${value}${input.value.slice(end)}`
  setValue(next)
  const cursor = start + value.length
  requestAnimationFrame(() => {
    input.setSelectionRange(cursor, cursor)
    input.focus()
  })
}

export function MathInlinePanel({
  editor,
  isOpen,
  position,
  onClose,
  initialFormula = '',
}: MathInlinePanelProps) {
  const [formula, setFormula] = useState(initialFormula)
  const [matrixRows, setMatrixRows] = useState(2)
  const [matrixCols, setMatrixCols] = useState(2)
  const [matrixStyle, setMatrixStyle] = useState('bmatrix')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
  }, [isOpen])

  const previewHtml = useMemo(() => {
    if (!formula.trim()) return ''
    try {
      return katex.renderToString(formula, { throwOnError: false, displayMode: false })
    } catch {
      return ''
    }
  }, [formula])

  const handleInsert = () => {
    const trimmed = formula.trim()
    if (!trimmed) {
      onClose()
      return
    }
    editor
      .chain()
      .focus()
      .insertContent({ type: 'mathInline', attrs: { formula: trimmed } })
      .run()
    onClose()
  }

  const handleInsertHelper = (value: string) => {
    const input = inputRef.current
    if (input) {
      insertAtCursor(input, value, setFormula)
      return
    }
    setFormula((prev) => `${prev}${value}`)
  }

  const handleInsertMatrix = () => {
    const template = buildMatrixTemplate(matrixRows, matrixCols, matrixStyle)
    handleInsertHelper(template)
  }

  if (!isOpen) return null

  return (
    <div
      className="math-inline-panel"
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="math-inline-header">
        <span className="math-inline-title">Insert equation</span>
        <button type="button" className="math-inline-close" onClick={onClose} aria-label="Close">
          x
        </button>
      </div>
      <div className="math-inline-body">
        <input
          ref={inputRef}
          className="math-inline-input"
          type="text"
          placeholder="Type LaTeX, e.g. \\frac{a}{b} or x^2"
          value={formula}
          onChange={(event) => setFormula(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              handleInsert()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          }}
        />
        <div className="math-inline-section">
          <div className="math-inline-section-header">Basics</div>
          <div className="math-inline-helpers">
            {basicHelpers.map((helper) => (
              <button
                key={helper.label}
                type="button"
                className="math-inline-helper"
                onClick={() => handleInsertHelper(helper.insert)}
              >
                <span className="math-inline-helper-label">{helper.label}</span>
                <span className="math-inline-helper-hint">{helper.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="math-inline-section">
          <div className="math-inline-section-header">Probability</div>
          <div className="math-inline-helpers">
            {probabilityHelpers.map((helper) => (
              <button
                key={helper.label}
                type="button"
                className="math-inline-helper"
                onClick={() => handleInsertHelper(helper.insert)}
              >
                <span className="math-inline-helper-label">{helper.label}</span>
                <span className="math-inline-helper-hint">{helper.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="math-inline-section">
          <div className="math-inline-section-header">Calculus</div>
          <div className="math-inline-helpers">
            {calculusHelpers.map((helper) => (
              <button
                key={helper.label}
                type="button"
                className="math-inline-helper"
                onClick={() => handleInsertHelper(helper.insert)}
              >
                <span className="math-inline-helper-label">{helper.label}</span>
                <span className="math-inline-helper-hint">{helper.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="math-inline-section">
          <div className="math-inline-section-header">Matrix builder</div>
          <div className="math-inline-matrix-controls">
            <label className="math-inline-field">
              <span>Rows</span>
              <input
                type="number"
                min={1}
                max={6}
                value={matrixRows}
                onChange={(event) =>
                  setMatrixRows(clampMatrixSize(event.target.valueAsNumber, matrixRows))
                }
              />
            </label>
            <label className="math-inline-field">
              <span>Cols</span>
              <input
                type="number"
                min={1}
                max={6}
                value={matrixCols}
                onChange={(event) =>
                  setMatrixCols(clampMatrixSize(event.target.valueAsNumber, matrixCols))
                }
              />
            </label>
            <label className="math-inline-field">
              <span>Brackets</span>
              <select value={matrixStyle} onChange={(event) => setMatrixStyle(event.target.value)}>
                {matrixStyles.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="math-inline-matrix-insert"
              onClick={handleInsertMatrix}
            >
              Insert {matrixRows}×{matrixCols}
            </button>
          </div>
          <div className="math-inline-matrix-hint">
            Generates a template you can edit in place (a_11, a_12, ...).
          </div>
        </div>
        <div className="math-inline-preview">
          <span className="math-inline-preview-label">Preview</span>
          {previewHtml ? (
            <div
              className="math-inline-preview-value"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          ) : (
            <div className="math-inline-preview-placeholder">Type a formula to see it render</div>
          )}
        </div>
      </div>
      <div className="math-inline-footer">
        <button type="button" className="math-inline-cancel" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="math-inline-insert" onClick={handleInsert}>
          Insert
        </button>
      </div>
    </div>
  )
}
