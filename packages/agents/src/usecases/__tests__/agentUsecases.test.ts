import { describe, it, expect, vi } from 'vitest'
import {
  createAgentUsecase,
  updateAgentUsecase,
  deleteAgentUsecase,
  getAgentUsecase,
  listAgentsUsecase,
} from '../agentUsecases'
import type { AgentRepository } from '../../ports/agentRepository'
import type { CreateAgentInput, AgentConfig } from '../../domain/models'

describe('agentUsecases', () => {
  describe('createAgentUsecase', () => {
    it('validates agent name is not empty', async () => {
      const mockRepo: AgentRepository = {
        create: vi.fn(),
      } as any

      const usecase = createAgentUsecase(mockRepo)

      const input: CreateAgentInput = {
        name: '   ', // Empty!
        role: 'planner',
        systemPrompt: 'You are a helpful planning agent',
        modelProvider: 'openai',
        modelName: 'gpt-4',
      }

      await expect(usecase('user123', input)).rejects.toThrow('Agent name is required')
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates system prompt is not empty', async () => {
      const mockRepo: AgentRepository = {
        create: vi.fn(),
      } as any

      const usecase = createAgentUsecase(mockRepo)

      const input: CreateAgentInput = {
        name: 'Planner',
        role: 'planner',
        systemPrompt: '  ', // Empty!
        modelProvider: 'openai',
        modelName: 'gpt-4',
      }

      await expect(usecase('user123', input)).rejects.toThrow('System prompt is required')
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates model name is not empty', async () => {
      const mockRepo: AgentRepository = {
        create: vi.fn(),
      } as any

      const usecase = createAgentUsecase(mockRepo)

      const input: CreateAgentInput = {
        name: 'Planner',
        role: 'planner',
        systemPrompt: 'You are a helpful planning agent',
        modelProvider: 'openai',
        modelName: '  ', // Empty!
      }

      await expect(usecase('user123', input)).rejects.toThrow('Model name is required')
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates temperature range', async () => {
      const mockRepo: AgentRepository = {
        create: vi.fn(),
      } as any

      const usecase = createAgentUsecase(mockRepo)

      const input: CreateAgentInput = {
        name: 'Planner',
        role: 'planner',
        systemPrompt: 'You are a helpful planning agent',
        modelProvider: 'openai',
        modelName: 'gpt-4',
        temperature: 3.0, // Invalid!
      }

      await expect(usecase('user123', input)).rejects.toThrow('Temperature must be between 0 and 2')
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates max tokens is positive', async () => {
      const mockRepo: AgentRepository = {
        create: vi.fn(),
      } as any

      const usecase = createAgentUsecase(mockRepo)

      const input: CreateAgentInput = {
        name: 'Planner',
        role: 'planner',
        systemPrompt: 'You are a helpful planning agent',
        modelProvider: 'openai',
        modelName: 'gpt-4',
        maxTokens: -100, // Invalid!
      }

      await expect(usecase('user123', input)).rejects.toThrow('Max tokens must be positive')
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('creates agent when valid', async () => {
      const mockAgent: AgentConfig = {
        agentId: 'agent:123' as any,
        userId: 'user123',
        name: 'Planner',
        role: 'planner',
        systemPrompt: 'You are a helpful planning agent',
        modelProvider: 'openai',
        modelName: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const mockRepo: AgentRepository = {
        create: vi.fn().mockResolvedValue(mockAgent),
      } as any

      const usecase = createAgentUsecase(mockRepo)

      const input: CreateAgentInput = {
        name: 'Planner',
        role: 'planner',
        systemPrompt: 'You are a helpful planning agent',
        modelProvider: 'openai',
        modelName: 'gpt-4',
        temperature: 0.7,
        maxTokens: 1000,
      }

      const result = await usecase('user123', input)

      expect(result).toEqual(mockAgent)
      expect(mockRepo.create).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({
          ...input,
          configHash: expect.any(String),
        })
      )
    })
  })

  describe('updateAgentUsecase', () => {
    it('validates name when updating', async () => {
      const mockRepo: AgentRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateAgentUsecase(mockRepo)

      await expect(usecase('user123', 'agent:123' as any, { name: '  ' })).rejects.toThrow(
        'Agent name cannot be empty'
      )

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('validates system prompt when updating', async () => {
      const mockRepo: AgentRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateAgentUsecase(mockRepo)

      await expect(usecase('user123', 'agent:123' as any, { systemPrompt: '  ' })).rejects.toThrow(
        'System prompt cannot be empty'
      )

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('validates temperature when updating', async () => {
      const mockRepo: AgentRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateAgentUsecase(mockRepo)

      await expect(usecase('user123', 'agent:123' as any, { temperature: 5.0 })).rejects.toThrow(
        'Temperature must be between 0 and 2'
      )

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('updates agent when valid', async () => {
      const mockAgent: AgentConfig = {
        agentId: 'agent:123' as any,
        userId: 'user123',
        name: 'Advanced Planner',
        role: 'planner',
        systemPrompt: 'You are a helpful planning agent',
        modelProvider: 'openai',
        modelName: 'gpt-4',
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 2,
      }

      const mockRepo: AgentRepository = {
        update: vi.fn().mockResolvedValue(mockAgent),
      } as any

      const usecase = updateAgentUsecase(mockRepo)

      const result = await usecase('user123', 'agent:123' as any, {
        name: 'Advanced Planner',
      })

      expect(result).toEqual(mockAgent)
      expect(mockRepo.update).toHaveBeenCalledWith('user123', 'agent:123', {
        name: 'Advanced Planner',
      })
    })
  })

  describe('deleteAgentUsecase', () => {
    it('calls repository delete', async () => {
      const mockRepo: AgentRepository = {
        delete: vi.fn().mockResolvedValue(undefined),
      } as any

      const usecase = deleteAgentUsecase(mockRepo)

      await usecase('user123', 'agent:123' as any)

      expect(mockRepo.delete).toHaveBeenCalledWith('user123', 'agent:123')
    })
  })

  describe('getAgentUsecase', () => {
    it('returns agent from repository', async () => {
      const mockAgent: AgentConfig = {
        agentId: 'agent:123' as any,
        userId: 'user123',
        name: 'Planner',
        role: 'planner',
        systemPrompt: 'You are a helpful planning agent',
        modelProvider: 'openai',
        modelName: 'gpt-4',
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const mockRepo: AgentRepository = {
        get: vi.fn().mockResolvedValue(mockAgent),
      } as any

      const usecase = getAgentUsecase(mockRepo)

      const result = await usecase('user123', 'agent:123' as any)

      expect(result).toEqual(mockAgent)
      expect(mockRepo.get).toHaveBeenCalledWith('user123', 'agent:123')
    })
  })

  describe('listAgentsUsecase', () => {
    it('returns agents from repository', async () => {
      const mockAgents: AgentConfig[] = [
        {
          agentId: 'agent:123' as any,
          userId: 'user123',
          name: 'Planner',
          role: 'planner',
          systemPrompt: 'You are a helpful planning agent',
          modelProvider: 'openai',
          modelName: 'gpt-4',
          archived: false,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          syncState: 'synced',
          version: 1,
        },
      ]

      const mockRepo: AgentRepository = {
        list: vi.fn().mockResolvedValue(mockAgents),
      } as any

      const usecase = listAgentsUsecase(mockRepo)

      const result = await usecase('user123', { role: 'planner', activeOnly: true })

      expect(result).toEqual(mockAgents)
      expect(mockRepo.list).toHaveBeenCalledWith('user123', { role: 'planner', activeOnly: true })
    })
  })
})
