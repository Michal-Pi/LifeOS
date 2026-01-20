/**
 * Hook for Task Markdown Import functionality
 *
 * Handles parsing, validation, and state management for task markdown imports.
 */

import { useState, useCallback } from 'react'
import { parseTaskMarkdown, type ParsedTask } from '@/lib/taskMarkdownParser'
import { validateParsedTasks, type ValidationError } from '@/lib/taskMarkdownValidator'
import { importTasks, type ImportResult } from '@/lib/taskImportService'
import type { CanonicalProject, CanonicalChapter, CanonicalTask } from '@/types/todo'

export type TaskImportState =
  | 'input' // Default state - user can input markdown
  | 'validating' // Parsing markdown
  | 'error' // Validation failed
  | 'preview' // Parsed successfully, showing preview
  | 'creating' // Writing to Firestore
  | 'success' // Done

export interface UseTaskMarkdownImportReturn {
  state: TaskImportState
  markdown: string
  parsedTasks: ParsedTask[]
  errors: ValidationError[]
  importResult: ImportResult | null
  setMarkdown: (markdown: string) => void
  parseAndValidate: () => void
  createTasks: (
    userId: string,
    projects: CanonicalProject[],
    chapters: CanonicalChapter[],
    createTaskFn: (
      task: Omit<CanonicalTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
    ) => Promise<CanonicalTask>
  ) => Promise<void>
  reset: () => void
  setState: (state: TaskImportState) => void
}

export function useTaskMarkdownImport(): UseTaskMarkdownImportReturn {
  const [state, setState] = useState<TaskImportState>('input')
  const [markdown, setMarkdown] = useState('')
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([])
  const [errors, setErrors] = useState<ValidationError[]>([])
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

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
    const parseResult = parseTaskMarkdown(markdown)

    // Validate parsed tasks
    const validationResult = validateParsedTasks(parseResult.tasks, parseResult.errors)

    if (!validationResult.valid) {
      setErrors(validationResult.errors)
      setState('error')
      return
    }

    // Success - show preview
    setParsedTasks(parseResult.tasks)
    setErrors([])
    setState('preview')
  }, [markdown])

  const createTasks = useCallback(
    async (
      userId: string,
      projects: CanonicalProject[],
      chapters: CanonicalChapter[],
      createTaskFn: (
        task: Omit<CanonicalTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
      ) => Promise<CanonicalTask>
    ) => {
      if (!parsedTasks || parsedTasks.length === 0) {
        setErrors([
          {
            field: 'tasks',
            message: 'No tasks to create. Please parse markdown first.',
          },
        ])
        setState('error')
        return
      }

      setState('creating')
      setErrors([])

      try {
        const result = await importTasks(
          userId,
          parsedTasks,
          projects,
          chapters,
          createTaskFn
        )

        setImportResult(result)

        if (result.failureCount > 0 && result.successCount === 0) {
          // All failed
          const validationErrors: ValidationError[] = result.errors.map((err) => ({
            field: `tasks[${err.taskIndex}].import`,
            message: err.error,
            line: parsedTasks[err.taskIndex]?.lineNumber,
          }))
          setErrors(validationErrors)
          setState('error')
        } else if (result.failureCount > 0) {
          // Partial success - show success but with warnings
          setState('success')
        } else {
          // All succeeded
          setState('success')
        }
      } catch (error) {
        setErrors([
          {
            field: 'import',
            message:
              error instanceof Error
                ? error.message
                : 'Failed to create tasks. Please try again.',
          },
        ])
        setState('error')
      }
    },
    [parsedTasks]
  )

  const reset = useCallback(() => {
    setState('input')
    setMarkdown('')
    setParsedTasks([])
    setErrors([])
    setImportResult(null)
  }, [])

  return {
    state,
    markdown,
    parsedTasks,
    errors,
    importResult,
    setMarkdown,
    parseAndValidate,
    createTasks,
    reset,
    setState,
  }
}
