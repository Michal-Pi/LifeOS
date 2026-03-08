import { describe, it, expect } from 'vitest'
import {
  updateTodoToolConfig,
  deleteTodoToolConfig,
  memoryRecallToolConfig,
  generateChartToolConfig,
  codeInterpreterToolConfig,
  webhookCallToolConfig,
} from '@lifeos/agents'

describe('Tool Definitions (Phases 31-34)', () => {
  describe('update_todo (Phase 31)', () => {
    it('has correct tool ID and name', () => {
      expect(updateTodoToolConfig.toolId).toBe('tool:update_todo')
      expect(updateTodoToolConfig.name).toBe('update_todo')
    })

    it('requires todoId and updates', () => {
      expect(updateTodoToolConfig.parameters.required).toContain('todoId')
      expect(updateTodoToolConfig.parameters.required).toContain('updates')
    })

    it('supports status, title, urgency, importance, and dueDate updates', () => {
      const props = updateTodoToolConfig.parameters.properties.updates.properties
      expect(props).toHaveProperty('title')
      expect(props).toHaveProperty('status')
      expect(props).toHaveProperty('urgency')
      expect(props).toHaveProperty('importance')
      expect(props).toHaveProperty('dueDate')
    })
  })

  describe('delete_todo (Phase 31)', () => {
    it('has correct tool ID', () => {
      expect(deleteTodoToolConfig.toolId).toBe('tool:delete_todo')
    })

    it('requires todoId', () => {
      expect(deleteTodoToolConfig.parameters.required).toContain('todoId')
    })
  })

  describe('memory_recall (Phase 32)', () => {
    it('has correct tool ID', () => {
      expect(memoryRecallToolConfig.toolId).toBe('tool:memory_recall')
    })

    it('requires query parameter', () => {
      expect(memoryRecallToolConfig.parameters.required).toContain('query')
    })

    it('supports optional timeRange filter', () => {
      expect(memoryRecallToolConfig.parameters.properties).toHaveProperty('timeRange')
    })

    it('supports optional runType filter', () => {
      expect(memoryRecallToolConfig.parameters.properties).toHaveProperty('runType')
    })
  })

  describe('generate_chart (Phase 33)', () => {
    it('has correct tool ID', () => {
      expect(generateChartToolConfig.toolId).toBe('tool:generate_chart')
    })

    it('supports bar, line, pie, scatter chart types', () => {
      const chartTypes = generateChartToolConfig.parameters.properties.chartType.enum
      expect(chartTypes).toContain('bar')
      expect(chartTypes).toContain('line')
      expect(chartTypes).toContain('pie')
      expect(chartTypes).toContain('scatter')
    })

    it('requires chartType, data, and title', () => {
      expect(generateChartToolConfig.parameters.required).toEqual(['chartType', 'data', 'title'])
    })
  })

  describe('code_interpreter (Phase 34)', () => {
    it('has correct tool ID', () => {
      expect(codeInterpreterToolConfig.toolId).toBe('tool:code_interpreter')
    })

    it('only supports javascript', () => {
      expect(codeInterpreterToolConfig.parameters.properties.language.enum).toEqual(['javascript'])
    })

    it('requires language and code', () => {
      expect(codeInterpreterToolConfig.parameters.required).toEqual(['language', 'code'])
    })
  })

  describe('webhook_call (Phase 34)', () => {
    it('has correct tool ID', () => {
      expect(webhookCallToolConfig.toolId).toBe('tool:webhook_call')
    })

    it('supports GET, POST, PUT, DELETE', () => {
      const methods = webhookCallToolConfig.parameters.properties.method.enum
      expect(methods).toEqual(['GET', 'POST', 'PUT', 'DELETE'])
    })

    it('requires url and method', () => {
      expect(webhookCallToolConfig.parameters.required).toEqual(['url', 'method'])
    })
  })
})
