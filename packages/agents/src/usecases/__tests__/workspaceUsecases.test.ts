import { describe, it, expect, vi } from 'vitest'
import {
  createWorkspaceUsecase,
  updateWorkspaceUsecase,
  deleteWorkspaceUsecase,
  getWorkspaceUsecase,
  listWorkspacesUsecase,
} from '../workspaceUsecases'
import type { WorkspaceRepository } from '../../ports/workspaceRepository'
import type { CreateWorkspaceInput, Workspace } from '../../domain/models'

describe('workspaceUsecases', () => {
  describe('createWorkspaceUsecase', () => {
    it('validates workspace name is not empty', async () => {
      const mockRepo: WorkspaceRepository = {
        create: vi.fn(),
      } as any

      const usecase = createWorkspaceUsecase(mockRepo)

      const input: CreateWorkspaceInput = {
        name: '   ', // Empty!
        agentIds: ['agent:123' as any],
        workflowType: 'sequential',
      }

      await expect(usecase('user123', input)).rejects.toThrow('Workspace name is required')
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates workspace has at least one agent', async () => {
      const mockRepo: WorkspaceRepository = {
        create: vi.fn(),
      } as any

      const usecase = createWorkspaceUsecase(mockRepo)

      const input: CreateWorkspaceInput = {
        name: 'My Workspace',
        agentIds: [], // Empty!
        workflowType: 'sequential',
      }

      await expect(usecase('user123', input)).rejects.toThrow(
        'Workspace must have at least one agent'
      )
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates default agent is in agent list', async () => {
      const mockRepo: WorkspaceRepository = {
        create: vi.fn(),
      } as any

      const usecase = createWorkspaceUsecase(mockRepo)

      const input: CreateWorkspaceInput = {
        name: 'My Workspace',
        agentIds: ['agent:123' as any],
        defaultAgentId: 'agent:999' as any, // Not in list!
        workflowType: 'sequential',
      }

      await expect(usecase('user123', input)).rejects.toThrow(
        'Default agent must be in the workspace agent list'
      )
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('validates max iterations range', async () => {
      const mockRepo: WorkspaceRepository = {
        create: vi.fn(),
      } as any

      const usecase = createWorkspaceUsecase(mockRepo)

      const input: CreateWorkspaceInput = {
        name: 'My Workspace',
        agentIds: ['agent:123' as any],
        workflowType: 'sequential',
        maxIterations: 100, // Too high!
      }

      await expect(usecase('user123', input)).rejects.toThrow(
        'Max iterations must be between 1 and 50'
      )
      expect(mockRepo.create).not.toHaveBeenCalled()
    })

    it('creates workspace when valid', async () => {
      const mockWorkspace: Workspace = {
        workspaceId: 'workspace:123' as any,
        userId: 'user123',
        name: 'My Workspace',
        agentIds: ['agent:123' as any],
        workflowType: 'sequential',
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const mockRepo: WorkspaceRepository = {
        create: vi.fn().mockResolvedValue(mockWorkspace),
      } as any

      const usecase = createWorkspaceUsecase(mockRepo)

      const input: CreateWorkspaceInput = {
        name: 'My Workspace',
        agentIds: ['agent:123' as any],
        workflowType: 'sequential',
      }

      const result = await usecase('user123', input)

      expect(result).toEqual(mockWorkspace)
      expect(mockRepo.create).toHaveBeenCalledWith('user123', input)
    })
  })

  describe('updateWorkspaceUsecase', () => {
    it('validates name when updating', async () => {
      const mockRepo: WorkspaceRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateWorkspaceUsecase(mockRepo)

      await expect(
        usecase('user123', 'workspace:123' as any, { name: '  ' })
      ).rejects.toThrow('Workspace name cannot be empty')

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('validates at least one agent when updating', async () => {
      const mockRepo: WorkspaceRepository = {
        update: vi.fn(),
      } as any

      const usecase = updateWorkspaceUsecase(mockRepo)

      await expect(
        usecase('user123', 'workspace:123' as any, { agentIds: [] })
      ).rejects.toThrow('Workspace must have at least one agent')

      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('updates workspace when valid', async () => {
      const mockWorkspace: Workspace = {
        workspaceId: 'workspace:123' as any,
        userId: 'user123',
        name: 'Updated Workspace',
        agentIds: ['agent:123' as any],
        workflowType: 'sequential',
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 2,
      }

      const mockRepo: WorkspaceRepository = {
        update: vi.fn().mockResolvedValue(mockWorkspace),
      } as any

      const usecase = updateWorkspaceUsecase(mockRepo)

      const result = await usecase('user123', 'workspace:123' as any, {
        name: 'Updated Workspace',
      })

      expect(result).toEqual(mockWorkspace)
      expect(mockRepo.update).toHaveBeenCalledWith('user123', 'workspace:123', {
        name: 'Updated Workspace',
      })
    })
  })

  describe('deleteWorkspaceUsecase', () => {
    it('calls repository delete', async () => {
      const mockRepo: WorkspaceRepository = {
        delete: vi.fn().mockResolvedValue(undefined),
      } as any

      const usecase = deleteWorkspaceUsecase(mockRepo)

      await usecase('user123', 'workspace:123' as any)

      expect(mockRepo.delete).toHaveBeenCalledWith('user123', 'workspace:123')
    })
  })

  describe('getWorkspaceUsecase', () => {
    it('returns workspace from repository', async () => {
      const mockWorkspace: Workspace = {
        workspaceId: 'workspace:123' as any,
        userId: 'user123',
        name: 'My Workspace',
        agentIds: ['agent:123' as any],
        workflowType: 'sequential',
        archived: false,
        createdAtMs: Date.now(),
        updatedAtMs: Date.now(),
        syncState: 'synced',
        version: 1,
      }

      const mockRepo: WorkspaceRepository = {
        get: vi.fn().mockResolvedValue(mockWorkspace),
      } as any

      const usecase = getWorkspaceUsecase(mockRepo)

      const result = await usecase('user123', 'workspace:123' as any)

      expect(result).toEqual(mockWorkspace)
      expect(mockRepo.get).toHaveBeenCalledWith('user123', 'workspace:123')
    })
  })

  describe('listWorkspacesUsecase', () => {
    it('returns workspaces from repository', async () => {
      const mockWorkspaces: Workspace[] = [
        {
          workspaceId: 'workspace:123' as any,
          userId: 'user123',
          name: 'My Workspace',
          agentIds: ['agent:123' as any],
          workflowType: 'sequential',
          archived: false,
          createdAtMs: Date.now(),
          updatedAtMs: Date.now(),
          syncState: 'synced',
          version: 1,
        },
      ]

      const mockRepo: WorkspaceRepository = {
        list: vi.fn().mockResolvedValue(mockWorkspaces),
      } as any

      const usecase = listWorkspacesUsecase(mockRepo)

      const result = await usecase('user123', { activeOnly: true })

      expect(result).toEqual(mockWorkspaces)
      expect(mockRepo.list).toHaveBeenCalledWith('user123', { activeOnly: true })
    })
  })
})
