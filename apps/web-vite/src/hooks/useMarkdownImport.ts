/**
 * Hook for Markdown Import functionality
 *
 * Handles parsing, validation, and state management for markdown project imports.
 */

import { useState, useCallback } from 'react'
import { parseMarkdown } from '@/lib/markdownParser'
import { validateParsedProject, type ValidationError } from '@/lib/markdownValidator'
import type { ParsedProject } from '@/lib/markdownParser'

export type ImportState =
  | 'input' // Default state - user can input markdown
  | 'validating' // Parsing markdown
  | 'error' // Validation failed
  | 'preview' // Parsed successfully, showing preview
  | 'creating' // Writing to Firestore
  | 'success' // Done

export interface UseMarkdownImportReturn {
  state: ImportState
  markdown: string
  parsedProject: ParsedProject | null
  errors: ValidationError[]
  setMarkdown: (markdown: string) => void
  parseAndValidate: () => void
  reset: () => void
  setState: (state: ImportState) => void
}

export function useMarkdownImport(): UseMarkdownImportReturn {
  const [state, setState] = useState<ImportState>('input')
  const [markdown, setMarkdown] = useState('')
  const [parsedProject, setParsedProject] = useState<ParsedProject | null>(null)
  const [errors, setErrors] = useState<ValidationError[]>([])

  const parseAndValidate = useCallback(() => {
    if (!markdown.trim()) {
      setErrors([
        {
          field: 'markdown',
          message: 'Please provide markdown content',
        },
      ])
      setState('error')
      return
    }

    setState('validating')
    setErrors([])

    // Parse markdown
    const parseResult = parseMarkdown(markdown)

    if (!parseResult.project) {
      // Convert parse errors to validation errors
      const validationErrors: ValidationError[] = parseResult.errors.map((err) => ({
        field: err.field || 'unknown',
        message: err.message,
        line: err.line,
      }))
      setErrors(validationErrors)
      setState('error')
      return
    }

    // Validate parsed project
    const validationResult = validateParsedProject(parseResult.project, parseResult.errors)

    if (!validationResult.valid) {
      setErrors(validationResult.errors)
      setState('error')
      return
    }

    // Success - show preview
    setParsedProject(parseResult.project)
    setErrors([])
    setState('preview')
  }, [markdown])

  const reset = useCallback(() => {
    setState('input')
    setMarkdown('')
    setParsedProject(null)
    setErrors([])
  }, [])

  return {
    state,
    markdown,
    parsedProject,
    errors,
    setMarkdown,
    parseAndValidate,
    reset,
    setState,
  }
}
