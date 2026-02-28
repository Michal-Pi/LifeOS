import { describe, it, expect, vi } from 'vitest'
import {
  createWorkflowUsecase,
  updateWorkflowUsecase,
  deleteWorkflowUsecase,
  getWorkflowUsecase,
  listWorkflowsUsecase,
} from '../workflowUsecases'
import type { WorkflowRepository } from '../../ports/workflowRepository'
import type { CreateWorkflowInput, Workflow } from '../../domain/models'

describe('workflowUsecases', () => {
  describe('createWorkflowUsecase', () => {
    it('validates workflow name is not empty', async () => {
      const mockRepo: WorkflowRepository = {
        create: vi.fn(),
      } as any

      const usecase = createWorkflowUsecase(mockRepo)

      const input: CreateWorkflowInput = {
        name: '   ', // Empty!
        agentIds: ['agent:123' as any],
        workflowType: 'sequential',
      }

      await expect(usecase('user123', input)).rejects.toThrow('Workflow name is required')
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates workflow has at least one agent', async () => {
      const mockRepo: WorkflowRepository = {
        create: vi.fn(),
      } as any

      const usecase = createWorkflowUsecase(mockRepo)

      const input: CreateWorkflowInput = {
        name: 'My Workflow',
        agentIds: [], // Empty!
        workflowType: 'sequential',
      }

      await expect(usecase('user123', input)).rejects.toThrow(
        'Workflow must have at least one agent'
      )
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates default agent is in agent list', async () => {
      const mockRepo: WorkflowRepository = {
        create: vi.fn(),
      } as any

      const usecase = createWorkflowUsecase(mockRepo)

      const input: CreateWorkflowInput = {
        name: 'My Workflow',
        agentIds: ['agent:123' as any],
        defaultAgentId: 'agent:999' as any, // Not in list!
        workflowType: 'sequential',
      }

      await expect(usecase('user123', input)).rejects.toThrow(
        'Default agent must be in the workflow agent list'
      )
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates max iterations range', async () => {
      const mockRepo: WorkflowRepository = {
        create: vi.fn(),
      } as any

      const usecase = createWorkflowUsecase(mockRepo)

      const input: CreateWorkflowInput = {
        name: 'My Workflow',
        agentIds: ['agent:123' as any],
        workflowType: 'sequential',
        maxIterations: 300, // Too high!
      }

      await expect(usecase('user123', input)).rejects.toThrow(
        'Max iterations must be between 1 and 200'
      )
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('creates workflow when valid', async () => {
      const mockWorkflow: Workflow = {
        workflowId: 'workflow:123' as any,
        userId: 'user123',
        name: 'My Workflow',
        agentIds: ['agent:123' as any],
        workflowType: 'sequential',
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const mockRepo: WorkflowRepository = {
        create: vi.fn().mockResolvedValue(mockWorkflow),
      } as any

      const usecase = createWorkflowUsecase(mockRepo)

      const input: CreateWorkflowInput = {
        name: 'My Workflow',
        agentIds: ['agent:123' as any],
        workflowType: 'sequential',
      }

      const result = await usecase('user123', input)

      expect(result).toEqual(mockWorkflow)
      expect(mockRepo.create).toHaveBeenCalledWith('user123', input)
    })
  })

  describe('updateWorkflowUsecase', () => {
    it('validates name when updating', async () => {
      const mockRepo: WorkflowRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateWorkflowUsecase(mockRepo)

      await expect(usecase('user123', 'workflow:123' as any, { name: '  ' })).rejects.toThrow(
        'Workflow name cannot be empty'
      )

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('validates at least one agent when updating', async () => {
      const mockRepo: WorkflowRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateWorkflowUsecase(mockRepo)

      await expect(usecase('user123', 'workflow:123' as any, { agentIds: [] })).rejects.toThrow(
        'Workflow must have at least one agent'
      )

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('updates workflow when valid', async () => {
      const mockWorkflow: Workflow = {
        workflowId: 'workflow:123' as any,
        userId: 'user123',
        name: 'Updated Workflow',
        agentIds: ['agent:123' as any],
        workflowType: 'sequential',
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 2,
      }

      const mockRepo: WorkflowRepository = {
        update: vi.fn().mockResolvedValue(mockWorkflow),
      } as any

      const usecase = updateWorkflowUsecase(mockRepo)

      const result = await usecase('user123', 'workflow:123' as any, {
        name: 'Updated Workflow',
      })

      expect(result).toEqual(mockWorkflow)
      expect(mockRepo.update).toHaveBeenCalledWith('user123', 'workflow:123', {
        name: 'Updated Workflow',
      })
    })
  })

  describe('deleteWorkflowUsecase', () => {
    it('calls repository delete', async () => {
      const mockRepo: WorkflowRepository = {
        delete: vi.fn().mockResolvedValue(undefined),
      } as any

      const usecase = deleteWorkflowUsecase(mockRepo)

      await usecase('user123', 'workflow:123' as any)

      expect(mockRepo.delete).toHaveBeenCalledWith('user123', 'workflow:123')
    })
  })

  describe('getWorkflowUsecase', () => {
    it('returns workflow from repository', async () => {
      const mockWorkflow: Workflow = {
        workflowId: 'workflow:123' as any,
        userId: 'user123',
        name: 'My Workflow',
        agentIds: ['agent:123' as any],
        workflowType: 'sequential',
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const mockRepo: WorkflowRepository = {
        get: vi.fn().mockResolvedValue(mockWorkflow),
      } as any

      const usecase = getWorkflowUsecase(mockRepo)

      const result = await usecase('user123', 'workflow:123' as any)

      expect(result).toEqual(mockWorkflow)
      expect(mockRepo.get).toHaveBeenCalledWith('user123', 'workflow:123')
    })
  })

  describe('listWorkflowsUsecase', () => {
    it('returns workflows from repository', async () => {
      const mockWorkflows: Workflow[] = [
        {
          workflowId: 'workflow:123' as any,
          userId: 'user123',
          name: 'My Workflow',
          agentIds: ['agent:123' as any],
          workflowType: 'sequential',
          archived: false,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          syncState: 'synced',
          version: 1,
        },
      ]

      const mockRepo: WorkflowRepository = {
        list: vi.fn().mockResolvedValue(mockWorkflows),
      } as any

      const usecase = listWorkflowsUsecase(mockRepo)

      const result = await usecase('user123', { activeOnly: true })

      expect(result).toEqual(mockWorkflows)
      expect(mockRepo.list).toHaveBeenCalledWith('user123', { activeOnly: true })
    })
  })
})
