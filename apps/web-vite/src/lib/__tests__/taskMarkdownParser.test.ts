/**
 * Tests for Task Markdown Parser
 */

import { describe, it, expect } from 'vitest'
import { parseTaskMarkdown, parseTaskLine, type ParseError } from '../taskMarkdownParser'

describe('taskMarkdownParser', () => {
  describe('parseTaskMarkdown', () => {
    it('should parse simple task with domain', () => {
      const markdown = `- Task title [domain:work] [importance:7]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].title).toBe('Task title')
      expect(result.tasks[0].domain).toBe('work')
      expect(result.tasks[0].importance).toBe(7)
    })

    it('should parse task with all metadata tags', () => {
      const markdown = `- Complete task [domain:life] [importance:10] [urgency:today] [due:2024-12-31] [estimate:120]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0]).toEqual({
        title: 'Complete task',
        domain: 'life',
        importance: 10,
        urgency: 'today',
        due: '2024-12-31',
        estimate: 120,
        lineNumber: 1,
      })
    })

    it('should parse task with project', () => {
      const markdown = `- Task with project [project:My Project] [importance:4]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].title).toBe('Task with project')
      expect(result.tasks[0].project).toBe('My Project')
      expect(result.tasks[0].importance).toBe(4)
    })

    it('should parse task with project and chapter', () => {
      const markdown = `- Task with chapter [project:My Project] [chapter:Chapter One] [importance:7]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].title).toBe('Task with chapter')
      expect(result.tasks[0].project).toBe('My Project')
      expect(result.tasks[0].chapter).toBe('Chapter One')
      expect(result.tasks[0].importance).toBe(7)
    })

    it('should parse task with description on same line', () => {
      const markdown = `- Task title Description: This is the description [domain:work] [importance:7]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].title).toBe('Task title')
      expect(result.tasks[0].description).toBe('This is the description')
    })

    it('should parse task with description on separate line', () => {
      const markdown = `- Task title [domain:work] [importance:7]
  Description: This is the task description`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].title).toBe('Task title')
      expect(result.tasks[0].description).toBe('This is the task description')
    })

    it('should parse task with multi-line description', () => {
      const markdown = `- Task title [domain:work] [importance:7]
  Description: This is line one
  This is line two
  This is line three`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].description).toContain('line one')
      expect(result.tasks[0].description).toContain('line two')
      expect(result.tasks[0].description).toContain('line three')
    })

    it('should parse task with implicit multi-line description', () => {
      const markdown = `- Task title [domain:work] [importance:7]
  This is a description without the Description: prefix
  Continuing on another line`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].description).toContain('description without')
      expect(result.tasks[0].description).toContain('Continuing on another line')
    })

    it('should parse multiple tasks', () => {
      const markdown = `- First task [domain:work] [importance:7]
- Second task [domain:life] [importance:4]
- Third task [project:My Project] [importance:10]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(3)
      expect(result.tasks[0].title).toBe('First task')
      expect(result.tasks[1].title).toBe('Second task')
      expect(result.tasks[2].title).toBe('Third task')
    })

    it('should handle empty lines between tasks', () => {
      const markdown = `- First task [domain:work] [importance:7]

- Second task [domain:life] [importance:4]


- Third task [project:My Project] [importance:10]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(3)
    })

    it('should handle empty task title', () => {
      const markdown = `-  [domain:work] [importance:7]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].title).toBe('Untitled Task')
    })

    it('should handle invalid domain value', () => {
      const markdown = `- Task [domain:invalid] [importance:7]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors.length).toBeGreaterThan(0)
      const domainError = result.errors.find((e) => e.field?.includes('domain'))
      expect(domainError).toBeDefined()
      expect(domainError?.message).toContain('Invalid domain value')
    })

    it('should handle invalid urgency value', () => {
      const markdown = `- Task [domain:work] [urgency:invalid] [importance:7]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors.length).toBeGreaterThan(0)
      const urgencyError = result.errors.find((e) => e.field?.includes('urgency'))
      expect(urgencyError).toBeDefined()
      expect(urgencyError?.message).toContain('Invalid urgency value')
    })

    it('should handle invalid importance value (non-numeric)', () => {
      const markdown = `- Task [domain:work] [importance:invalid]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors.length).toBeGreaterThan(0)
      const importanceError = result.errors.find((e) => e.field?.includes('importance'))
      expect(importanceError).toBeDefined()
      expect(importanceError?.message).toContain('Invalid importance value')
    })

    it('should handle invalid importance value (not in allowed list)', () => {
      const markdown = `- Task [domain:work] [importance:5]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors.length).toBeGreaterThan(0)
      const importanceError = result.errors.find((e) => e.field?.includes('importance'))
      expect(importanceError).toBeDefined()
      expect(importanceError?.message).toContain('Invalid importance value')
    })

    it('should handle invalid date format', () => {
      const markdown = `- Task [domain:work] [due:2024/12/31] [importance:7]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors.length).toBeGreaterThan(0)
      const dueError = result.errors.find((e) => e.field?.includes('due'))
      expect(dueError).toBeDefined()
      expect(dueError?.message).toContain('Invalid date format')
    })

    it('should handle invalid estimate value', () => {
      const markdown = `- Task [domain:work] [estimate:abc] [importance:7]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors.length).toBeGreaterThan(0)
      const estimateError = result.errors.find((e) => e.field?.includes('estimate'))
      expect(estimateError).toBeDefined()
      expect(estimateError?.message).toContain('Invalid estimate value')
    })

    it('should handle negative estimate', () => {
      const markdown = `- Task [domain:work] [estimate:-10] [importance:7]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors.length).toBeGreaterThan(0)
      const estimateError = result.errors.find((e) => e.field?.includes('estimate'))
      expect(estimateError).toBeDefined()
    })

    it('should handle unknown metadata tag', () => {
      const markdown = `- Task [domain:work] [unknown:value] [importance:7]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors.length).toBeGreaterThan(0)
      const unknownError = result.errors.find((e) => e.field?.includes('metadata'))
      expect(unknownError).toBeDefined()
      expect(unknownError?.message).toContain('Unknown metadata tag')
    })

    it('should handle chapter without project', () => {
      const markdown = `- Task [chapter:Chapter One] [importance:7]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors.length).toBeGreaterThan(0)
      const chapterError = result.errors.find((e) => e.field?.includes('chapter'))
      expect(chapterError).toBeDefined()
      expect(chapterError?.message).toContain('Chapter tag requires a project tag')
    })

    it('should handle case-insensitive domain values', () => {
      const markdown = `- Task [domain:WORK] [importance:7]
- Another task [domain:Life] [importance:4]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks[0].domain).toBe('work')
      expect(result.tasks[1].domain).toBe('life')
    })

    it('should handle case-insensitive urgency values', () => {
      const markdown = `- Task [domain:work] [urgency:TODAY] [importance:7]
- Another task [domain:work] [urgency:THIS_WEEK] [importance:4]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks[0].urgency).toBe('today')
      expect(result.tasks[1].urgency).toBe('this_week')
    })

    it('should handle tasks with asterisk bullets', () => {
      const markdown = `* Task with asterisk [domain:work] [importance:7]
* Another task [domain:life] [importance:4]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(2)
    })

    it('should handle special characters in titles', () => {
      const markdown = `- Task with "quotes" & symbols [domain:work] [importance:7]
- Task with (parentheses) and [brackets] [domain:life] [importance:4]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks[0].title).toBe('Task with "quotes" & symbols')
      expect(result.tasks[1].title).toBe('Task with (parentheses) and [brackets]')
    })

    it('should handle empty markdown', () => {
      const markdown = ``

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(0)
    })

    it('should handle markdown with only whitespace', () => {
      const markdown = `   \n  \n   `

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(0)
    })

    it('should handle description with empty lines', () => {
      const markdown = `- Task title [domain:work] [importance:7]
  Description: Line one

  Line three`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(1)
      expect(result.tasks[0].description).toContain('Line one')
      expect(result.tasks[0].description).toContain('Line three')
    })

    it('should handle complex real-world example', () => {
      const markdown = `- Review code changes [domain:work] [importance:7] [urgency:today] [estimate:60]
  Description: Review pull request #123
  Check for security issues and code quality

- Write documentation [domain:projects] [project:Website Redesign] [chapter:Documentation] [importance:4] [estimate:120]

- Exercise [domain:wellbeing] [importance:10] [urgency:this_week] [due:2024-12-31]`

      const result = parseTaskMarkdown(markdown)

      expect(result.errors).toHaveLength(0)
      expect(result.tasks).toHaveLength(3)
      expect(result.tasks[0].title).toBe('Review code changes')
      expect(result.tasks[0].description).toContain('Review pull request')
      expect(result.tasks[1].project).toBe('Website Redesign')
      expect(result.tasks[1].chapter).toBe('Documentation')
      expect(result.tasks[2].due).toBe('2024-12-31')
    })
  })

  describe('parseTaskLine', () => {
    it('should parse minimal task line', () => {
      const errors: ParseError[] = []
      const task = parseTaskLine('Simple task', 1, errors)

      expect(errors).toHaveLength(0)
      expect(task.title).toBe('Simple task')
      expect(task.lineNumber).toBe(1)
    })

    it('should parse task with multiple tags', () => {
      const errors: ParseError[] = []
      const task = parseTaskLine(
        'Task [domain:work] [importance:7] [urgency:today] [due:2024-12-31] [estimate:60]',
        5,
        errors
      )

      expect(errors).toHaveLength(0)
      expect(task.domain).toBe('work')
      expect(task.importance).toBe(7)
      expect(task.urgency).toBe('today')
      expect(task.due).toBe('2024-12-31')
      expect(task.estimate).toBe(60)
      expect(task.lineNumber).toBe(5)
    })
  })
})
