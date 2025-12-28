import { describe, it, expect } from 'vitest'
import {
  AgentConfigSchema,
  CreateAgentInputSchema,
  WorkspaceSchema,
  CreateWorkspaceInputSchema,
  RunSchema,
  MessageSchema,
  ToolDefinitionSchema,
} from '../validation'

describe('validation schemas', () => {
  describe('AgentConfigSchema', () => {
    it('validates valid agent config', () => {
      const validAgent = {
        agentId: 'agent:123',
        userId: 'user123',
        name: 'Test Agent',
        role: 'planner',
        systemPrompt: 'You are a helpful agent',
        modelProvider: 'openai',
        modelName: 'gpt-4',
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const result = AgentConfigSchema.safeParse(validAgent)
      expect(result.success).toBe(true)
    })

    it('rejects agent with invalid temperature', () => {
      const invalidAgent = {
        agentId: 'agent:123',
        userId: 'user123',
        name: 'Test Agent',
        role: 'planner',
        systemPrompt: 'You are a helpful agent',
        modelProvider: 'openai',
        modelName: 'gpt-4',
        temperature: 5.0, // Invalid!
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const result = AgentConfigSchema.safeParse(invalidAgent)
      expect(result.success).toBe(false)
    })

    it('rejects agent with empty name', () => {
      const invalidAgent = {
        agentId: 'agent:123',
        userId: 'user123',
        name: '', // Empty!
        role: 'planner',
        systemPrompt: 'You are a helpful agent',
        modelProvider: 'openai',
        modelName: 'gpt-4',
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const result = AgentConfigSchema.safeParse(invalidAgent)
      expect(result.success).toBe(false)
    })
  })

  describe('CreateAgentInputSchema', () => {
    it('validates valid create input', () => {
      const validInput = {
        name: 'Test Agent',
        role: 'planner',
        systemPrompt: 'You are a helpful agent',
        modelProvider: 'openai',
        modelName: 'gpt-4',
      }

      const result = CreateAgentInputSchema.safeParse(validInput)
      expect(result.success).toBe(true)
    })

    it('allows optional fields', () => {
      const validInput = {
        name: 'Test Agent',
        role: 'planner',
        systemPrompt: 'You are a helpful agent',
        modelProvider: 'openai',
        modelName: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
        description: 'A planning agent',
        toolIds: ['tool:123'],
      }

      const result = CreateAgentInputSchema.safeParse(validInput)
      expect(result.success).toBe(true)
    })
  })

  describe('WorkspaceSchema', () => {
    it('validates valid workspace', () => {
      const validWorkspace = {
        workspaceId: 'workspace:123',
        userId: 'user123',
        name: 'Test Workspace',
        agentIds: ['agent:123'],
        workflowType: 'sequential',
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const result = WorkspaceSchema.safeParse(validWorkspace)
      expect(result.success).toBe(true)
    })

    it('rejects workspace with invalid max iterations', () => {
      const invalidWorkspace = {
        workspaceId: 'workspace:123',
        userId: 'user123',
        name: 'Test Workspace',
        agentIds: ['agent:123'],
        workflowType: 'sequential',
        maxIterations: 100, // Too high!
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const result = WorkspaceSchema.safeParse(invalidWorkspace)
      expect(result.success).toBe(false)
    })
  })

  describe('RunSchema', () => {
    it('validates valid run', () => {
      const validRun = {
        runId: 'run:123',
        workspaceId: 'workspace:123',
        userId: 'user123',
        goal: 'Create a workout plan',
        status: 'completed',
        currentStep: 5,
        totalSteps: 5,
        output: 'Here is your workout plan...',
        startedAtMs: Date.now(),
        completedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const result = RunSchema.safeParse(validRun)
      expect(result.success).toBe(true)
    })

    it('rejects run with empty goal', () => {
      const invalidRun = {
        runId: 'run:123',
        workspaceId: 'workspace:123',
        userId: 'user123',
        goal: '', // Empty!
        status: 'completed',
        currentStep: 0,
        startedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const result = RunSchema.safeParse(invalidRun)
      expect(result.success).toBe(false)
    })
  })

  describe('MessageSchema', () => {
    it('validates valid message', () => {
      const validMessage = {
        messageId: 'message:123',
        runId: 'run:123',
        agentId: 'agent:123',
        role: 'assistant',
        content: 'Hello, how can I help?',
        timestampMs: Date.now(),
      }

      const result = MessageSchema.safeParse(validMessage)
      expect(result.success).toBe(true)
    })

    it('validates message with tool calls', () => {
      const validMessage = {
        messageId: 'message:123',
        runId: 'run:123',
        agentId: 'agent:123',
        role: 'assistant',
        content: 'Creating workout...',
        toolCalls: [
          {
            toolCallId: 'call:123',
            toolId: 'tool:create_workout',
            toolName: 'create_workout',
            parameters: { name: 'Monday Workout' },
          },
        ],
        timestampMs: Date.now(),
      }

      const result = MessageSchema.safeParse(validMessage)
      expect(result.success).toBe(true)
    })
  })

  describe('ToolDefinitionSchema', () => {
    it('validates valid tool definition', () => {
      const validTool = {
        toolId: 'tool:123',
        name: 'create_workout',
        description: 'Creates a new workout plan',
        parameters: {
          name: {
            type: 'string',
            description: 'Name of the workout',
            required: true,
          },
        },
        requiresAuth: true,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
      }

      const result = ToolDefinitionSchema.safeParse(validTool)
      expect(result.success).toBe(true)
    })
  })
})
