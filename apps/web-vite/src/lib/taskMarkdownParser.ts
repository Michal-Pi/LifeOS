/**
 * Task Markdown Parser
 *
 * Parses Markdown text into structured Tasks for bulk import.
 * Supports the following format:
 *
 * - Task Title [domain:work] [importance:7] [urgency:today] [due:2024-01-20] [estimate:60]
 *   Description: Optional task description
 *
 * - Task with Project [project:My Project] [chapter:Chapter Name] [importance:4]
 *
 * - Multi-line task description
 *   This is a continuation of the description
 *   spanning multiple lines
 */

export interface ParsedTask {
  title: string
  description?: string
  domain?: string
  project?: string // Project title (case-insensitive match)
  chapter?: string // Chapter title (requires project)
  urgency?: string
  importance?: number
  due?: string
  estimate?: number
  lineNumber: number // Line number where task starts
}

export interface ParseError {
  line: number
  message: string
  field?: string
}

export interface ParseResult {
  tasks: ParsedTask[]
  errors: ParseError[]
}

/**
 * Parse markdown text into structured tasks
 */
export function parseTaskMarkdown(markdown: string): ParseResult {
  const errors: ParseError[] = []
  const tasks: ParsedTask[] = []
  const lines = markdown.split('\n')

  let currentTask: ParsedTask | null = null
  let inDescription = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()

    // Skip empty lines (but continue description if we're in one)
    if (!trimmedLine) {
      if (inDescription && currentTask) {
        // Empty line in description - add it as a line break
        currentTask.description = (currentTask.description || '') + '\n'
      }
      continue
    }

    // Task item (bullet point)
    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      // Save previous task if exists
      if (currentTask) {
        // Clean up description
        if (currentTask.description) {
          currentTask.description = currentTask.description.trim()
        }
        tasks.push(currentTask)
      }

      const taskLine = trimmedLine.substring(2).trim()
      currentTask = parseTaskLine(taskLine, i + 1, errors)
      inDescription = false
      continue
    }

    // Task description continuation
    if (currentTask) {
      // Check if this line starts a description
      if (trimmedLine.startsWith('Description:')) {
        currentTask.description = trimmedLine.substring(12).trim() // "Description:" is 12 characters
        inDescription = true
        continue
      }

      // Multi-line description (any line that doesn't start with bullet, heading, or metadata)
      if (
        !trimmedLine.startsWith('- ') &&
        !trimmedLine.startsWith('* ') &&
        !trimmedLine.startsWith('#') &&
        !trimmedLine.startsWith('[') &&
        !trimmedLine.match(/^\*\*.*\*\*:/) // Not a markdown metadata field
      ) {
        if (currentTask.description !== undefined || inDescription) {
          inDescription = true
          currentTask.description = (currentTask.description || '') + '\n' + trimmedLine
        } else {
          // First line after task without "Description:" prefix - treat as description
          inDescription = true
          currentTask.description = trimmedLine
        }
        continue
      }
    }

    // Unrecognized line
    if (trimmedLine && !currentTask) {
      errors.push({
        line: i + 1,
        message: `Unexpected line: "${trimmedLine}". Expected a task bullet point starting with "-" or "*".`,
      })
    }
  }

  // Save last task
  if (currentTask) {
    // Clean up description
    if (currentTask.description) {
      currentTask.description = currentTask.description.trim()
    }
    tasks.push(currentTask)
  }

  return {
    tasks,
    errors,
  }
}

/**
 * Parse a task line with metadata tags
 * Format: Task Title [domain:value] [project:name] [chapter:name] [urgency:value] [importance:value] [due:YYYY-MM-DD] [estimate:minutes]
 */
export function parseTaskLine(
  line: string,
  lineNumber: number,
  errors: ParseError[]
): ParsedTask {
  const task: ParsedTask = {
    title: '',
    lineNumber,
  }

  // Extract metadata tags [key:value]
  const tagPattern = /\[(\w+):([^\]]+)\]/g
  const tags: Array<{ key: string; value: string }> = []
  let match

  while ((match = tagPattern.exec(line)) !== null) {
    tags.push({ key: match[1], value: match[2] })
  }

  // Remove tags from title
  let title = line.replace(/\[(\w+):([^\]]+)\]/g, '').trim()

  // Extract description if present inline (before tags)
  if (title.includes('Description:')) {
    const descMatch = title.match(/Description:\s*(.+)/)
    if (descMatch) {
      task.description = descMatch[1].trim()
      title = title.replace(/Description:.*/, '').trim()
    }
  }

  // Keep title empty if missing - validation will catch it
  task.title = title

  // Parse tags
  for (const tag of tags) {
    const { key, value } = tag
    const lowerKey = key.toLowerCase()

    switch (lowerKey) {
      case 'domain': {
        const validDomains = ['work', 'projects', 'life', 'learning', 'wellbeing']
        const lowerValue = value.toLowerCase()
        if (validDomains.includes(lowerValue)) {
          task.domain = lowerValue as typeof task.domain
        } else {
          errors.push({
            line: lineNumber,
            message: `Invalid domain value: "${value}". Must be one of: ${validDomains.join(', ')}`,
            field: 'task.domain',
          })
        }
        break
      }
      case 'project':
        task.project = value.trim()
        break
      case 'chapter':
        task.chapter = value.trim()
        break
      case 'urgency': {
        const validUrgencies = [
          'today',
          'next_3_days',
          'this_week',
          'this_month',
          'next_month',
          'later',
        ]
        const lowerValue = value.toLowerCase()
        if (validUrgencies.includes(lowerValue)) {
          task.urgency = lowerValue
        } else {
          errors.push({
            line: lineNumber,
            message: `Invalid urgency value: "${value}". Must be one of: ${validUrgencies.join(', ')}`,
            field: 'task.urgency',
          })
        }
        break
      }
      case 'importance': {
        const importance = parseInt(value, 10)
        const validImportances = [1, 2, 4, 7, 10]
        if (isNaN(importance)) {
          errors.push({
            line: lineNumber,
            message: `Invalid importance value: "${value}". Must be a number.`,
            field: 'task.importance',
          })
        } else if (!validImportances.includes(importance)) {
          errors.push({
            line: lineNumber,
            message: `Invalid importance value: "${value}". Must be one of: ${validImportances.join(', ')}`,
            field: 'task.importance',
          })
        } else {
          task.importance = importance
        }
        break
      }
      case 'due': {
        // Validate date format (YYYY-MM-DD)
        const datePattern = /^\d{4}-\d{2}-\d{2}$/
        if (datePattern.test(value)) {
          task.due = value
        } else {
          errors.push({
            line: lineNumber,
            message: `Invalid date format: "${value}". Must be in ISO format (YYYY-MM-DD).`,
            field: 'task.due',
          })
        }
        break
      }
      case 'estimate': {
        const estimate = parseInt(value, 10)
        if (isNaN(estimate) || estimate < 0) {
          errors.push({
            line: lineNumber,
            message: `Invalid estimate value: "${value}". Must be a positive integer.`,
            field: 'task.estimate',
          })
        } else {
          task.estimate = estimate
        }
        break
      }
      default:
        errors.push({
          line: lineNumber,
          message: `Unknown metadata tag: "${key}". Supported tags: domain, project, chapter, urgency, importance, due, estimate.`,
          field: 'task.metadata',
        })
    }
  }

  // Validate chapter requires project
  if (task.chapter && !task.project) {
    errors.push({
      line: lineNumber,
      message: 'Chapter tag requires a project tag. Please specify [project:name] before [chapter:name].',
      field: 'task.chapter',
    })
  }

  return task
}
