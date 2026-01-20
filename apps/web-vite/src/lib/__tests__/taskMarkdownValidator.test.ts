/**
 * Tests for Task Markdown Validator
 */

import { describe, it, expect } from 'vitest'
import { validateParsedTasks, getErrorHint } from '../taskMarkdownValidator'
import type { ParsedTask, ParseError } from '../taskMarkdownParser'

describe('taskMarkdownValidator', () => {
  describe('validateParsedTasks', () => {
    it('should validate valid task with domain', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Valid task',
          domain: 'work',
          importance: 7,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should validate valid task with project', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Valid task',
          project: 'My Project',
          importance: 7,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should validate valid task with project and chapter', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Valid task',
          project: 'My Project',
          chapter: 'Chapter One',
          importance: 7,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should reject task without domain or project', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Invalid task',
          importance: 7,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      const domainError = result.errors.find((e) => e.field.includes('domain'))
      expect(domainError).toBeDefined()
      expect(domainError?.message).toContain('domain')
      expect(domainError?.message).toContain('project')
    })

    it('should reject task with chapter but no project', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Invalid task',
          chapter: 'Chapter One',
          importance: 7,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      const chapterError = result.errors.find((e) => e.field.includes('chapter'))
      expect(chapterError).toBeDefined()
      expect(chapterError?.message).toContain('Chapter requires a project')
    })

    it('should reject task with invalid domain', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Invalid task',
          domain: 'invalid' as unknown as string,
          importance: 7,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      const domainError = result.errors.find((e) => e.field.includes('domain'))
      expect(domainError).toBeDefined()
    })

    it('should reject task with invalid urgency', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Invalid task',
          domain: 'work',
          urgency: 'invalid' as unknown as string,
          importance: 7,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      const urgencyError = result.errors.find((e) => e.field.includes('urgency'))
      expect(urgencyError).toBeDefined()
    })

    it('should reject task with invalid importance', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Invalid task',
          domain: 'work',
          importance: 5 as unknown as number,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      const importanceError = result.errors.find((e) => e.field.includes('importance'))
      expect(importanceError).toBeDefined()
    })

    it('should reject task with invalid date format', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Invalid task',
          domain: 'work',
          due: '2024/12/31',
          importance: 7,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      const dueError = result.errors.find((e) => e.field.includes('due'))
      expect(dueError).toBeDefined()
      expect(dueError?.message).toContain('ISO format')
    })

    it('should reject task with invalid estimate', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Invalid task',
          domain: 'work',
          estimate: -10,
          importance: 7,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      const estimateError = result.errors.find((e) => e.field.includes('estimate'))
      expect(estimateError).toBeDefined()
    })

    it('should reject task with empty title', () => {
      const tasks: ParsedTask[] = [
        {
          title: '',
          domain: 'work',
          importance: 7,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      const titleError = result.errors.find((e) => e.field.includes('title'))
      expect(titleError).toBeDefined()
    })

    it('should include parse errors in validation result', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Task',
          domain: 'work',
          importance: 7,
          lineNumber: 1,
        },
      ]

      const parseErrors: ParseError[] = [
        {
          line: 1,
          message: 'Parse error message',
          field: 'task.metadata',
        },
      ]

      const result = validateParsedTasks(tasks, parseErrors)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      const parseError = result.errors.find((e) => e.message === 'Parse error message')
      expect(parseError).toBeDefined()
      expect(parseError?.line).toBe(1)
    })

    it('should validate multiple tasks', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Task 1',
          domain: 'work',
          importance: 7,
          lineNumber: 1,
        },
        {
          title: 'Task 2',
          project: 'My Project',
          importance: 4,
          lineNumber: 2,
        },
        {
          title: 'Task 3',
          domain: 'life',
          chapter: 'Chapter One', // Invalid: chapter without project
          importance: 10,
          lineNumber: 3,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
      // Task 3 should have an error
      const chapterError = result.errors.find(
        (e) => e.field.includes('tasks[2]') && e.field.includes('chapter')
      )
      expect(chapterError).toBeDefined()
    })

    it('should include line numbers in errors', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Task 1',
          domain: 'work',
          importance: 7,
          lineNumber: 5,
        },
        {
          title: 'Task 2',
          importance: 4, // Missing domain/project
          lineNumber: 10,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(false)
      const error = result.errors.find((e) => e.field.includes('tasks[1]'))
      expect(error).toBeDefined()
      expect(error?.line).toBe(10)
    })

    it('should validate all valid importance values', () => {
      const validImportances = [1, 2, 4, 7, 10]

      for (const importance of validImportances) {
        const tasks: ParsedTask[] = [
          {
            title: 'Task',
            domain: 'work',
            importance,
            lineNumber: 1,
          },
        ]

        const result = validateParsedTasks(tasks)
        expect(result.valid).toBe(true)
      }
    })

    it('should validate all valid urgency values', () => {
      const validUrgencies = ['today', 'next_3_days', 'this_week', 'this_month', 'next_month', 'later']

      for (const urgency of validUrgencies) {
        const tasks: ParsedTask[] = [
          {
            title: 'Task',
            domain: 'work',
            urgency,
            importance: 7,
            lineNumber: 1,
          },
        ]

        const result = validateParsedTasks(tasks)
        expect(result.valid).toBe(true)
      }
    })

    it('should validate all valid domain values', () => {
      const validDomains = ['work', 'projects', 'life', 'learning', 'wellbeing']

      for (const domain of validDomains) {
        const tasks: ParsedTask[] = [
          {
            title: 'Task',
            domain,
            importance: 7,
            lineNumber: 1,
          },
        ]

        const result = validateParsedTasks(tasks)
        expect(result.valid).toBe(true)
      }
    })

    it('should validate task with valid date', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Task',
          domain: 'work',
          due: '2024-12-31',
          importance: 7,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should validate task with valid estimate', () => {
      const tasks: ParsedTask[] = [
        {
          title: 'Task',
          domain: 'work',
          estimate: 120,
          importance: 7,
          lineNumber: 1,
        },
      ]

      const result = validateParsedTasks(tasks)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })
  })

  describe('getErrorHint', () => {
    it('should return hint for domain error', () => {
      const error = {
        field: 'tasks[0].domain',
        message: 'Invalid domain',
      }

      const hint = getErrorHint(error)

      expect(hint).toContain('work, projects, life, learning, wellbeing')
    })

    it('should return hint for urgency error', () => {
      const error = {
        field: 'tasks[0].urgency',
        message: 'Invalid urgency',
      }

      const hint = getErrorHint(error)

      expect(hint).toContain('today, next_3_days')
    })

    it('should return hint for importance error', () => {
      const error = {
        field: 'tasks[0].importance',
        message: 'Invalid importance',
      }

      const hint = getErrorHint(error)

      expect(hint).toContain('1, 2, 4, 7, 10')
    })

    it('should return hint for due date error', () => {
      const error = {
        field: 'tasks[0].due',
        message: 'Invalid date',
      }

      const hint = getErrorHint(error)

      expect(hint).toContain('YYYY-MM-DD')
    })

    it('should return hint for estimate error', () => {
      const error = {
        field: 'tasks[0].estimate',
        message: 'Invalid estimate',
      }

      const hint = getErrorHint(error)

      expect(hint).toContain('positive number')
    })

    it('should return hint for project error', () => {
      const error = {
        field: 'tasks[0].project',
        message: 'Invalid project',
      }

      const hint = getErrorHint(error)

      expect(hint).toContain('existing project')
    })

    it('should return hint for chapter error', () => {
      const error = {
        field: 'tasks[0].chapter',
        message: 'Invalid chapter',
      }

      const hint = getErrorHint(error)

      expect(hint).toContain('existing chapter')
    })

    it('should return original message for unknown error', () => {
      const error = {
        field: 'tasks[0].unknown',
        message: 'Custom error message',
      }

      const hint = getErrorHint(error)

      expect(hint).toBe('Custom error message')
    })
  })
})
