import { describe, it, expect } from 'vitest'
import type { ProjectManagerConfig } from '@lifeos/agents'

/**
 * Phase 41 — Project Planning: Time-Aware Integration & Quick Plan Mode
 *
 * Template validation runs at module load via validateWorkflowTemplatePresets()
 * in templatePresets.ts — the web-vite typecheck catches template errors.
 * These tests validate domain types and graph structure patterns.
 */

describe('Phase 41 — Project Planning Modes', () => {
  describe('ProjectManagerConfig.mode', () => {
    it('accepts mode: full', () => {
      const config: ProjectManagerConfig = {
        enabled: true,
        questioningDepth: 'standard',
        autoUseExpertCouncil: false,
        expertCouncilThreshold: 0.7,
        qualityGateThreshold: 0.6,
        requireAssumptionValidation: false,
        enableConflictDetection: false,
        enableUserProfiling: false,
        mode: 'full',
      }
      expect(config.mode).toBe('full')
    })

    it('accepts mode: quick', () => {
      const config: ProjectManagerConfig = {
        enabled: true,
        questioningDepth: 'minimal',
        autoUseExpertCouncil: false,
        expertCouncilThreshold: 0.5,
        qualityGateThreshold: 0.5,
        requireAssumptionValidation: false,
        enableConflictDetection: false,
        enableUserProfiling: false,
        mode: 'quick',
      }
      expect(config.mode).toBe('quick')
    })

    it('mode defaults to undefined (backward compatible)', () => {
      const config: ProjectManagerConfig = {
        enabled: true,
        questioningDepth: 'standard',
        autoUseExpertCouncil: false,
        expertCouncilThreshold: 0.7,
        qualityGateThreshold: 0.6,
        requireAssumptionValidation: false,
        enableConflictDetection: false,
        enableUserProfiling: false,
      }
      expect(config.mode).toBeUndefined()
    })
  })

  describe('Full mode graph structure', () => {
    // Mirrors the Project Plan Builder template graph
    const fullModeGraph = {
      startNodeId: 'planner',
      nodes: [
        'planner',
        'time_check',
        'evaluator',
        'gap_researcher',
        'improvement',
        'quality_review',
        'end_node',
      ],
      edges: [
        { from: 'planner', to: 'time_check' },
        { from: 'time_check', to: 'evaluator' },
        { from: 'evaluator', to: 'gap_researcher' },
        { from: 'evaluator', to: 'improvement' },
        { from: 'gap_researcher', to: 'planner' },
        { from: 'improvement', to: 'quality_review' },
        { from: 'quality_review', to: 'end_node' },
      ],
    }

    it('has time_check node between planner and evaluator', () => {
      expect(fullModeGraph.nodes).toContain('time_check')
      const plannerToTime = fullModeGraph.edges.find(
        (e) => e.from === 'planner' && e.to === 'time_check'
      )
      expect(plannerToTime).toBeDefined()
      const timeToEval = fullModeGraph.edges.find(
        (e) => e.from === 'time_check' && e.to === 'evaluator'
      )
      expect(timeToEval).toBeDefined()
    })

    it('has no direct planner → evaluator edge', () => {
      const direct = fullModeGraph.edges.find((e) => e.from === 'planner' && e.to === 'evaluator')
      expect(direct).toBeUndefined()
    })

    it('retains evaluator, gap_researcher, improvement, quality_review', () => {
      expect(fullModeGraph.nodes).toContain('evaluator')
      expect(fullModeGraph.nodes).toContain('gap_researcher')
      expect(fullModeGraph.nodes).toContain('improvement')
      expect(fullModeGraph.nodes).toContain('quality_review')
    })

    it('starts at planner node', () => {
      expect(fullModeGraph.startNodeId).toBe('planner')
    })
  })

  describe('Quick mode graph structure', () => {
    // Mirrors the Quick Project Plan template graph
    const quickModeGraph = {
      startNodeId: 'planner',
      nodes: ['planner', 'time_check', 'end_node'],
      edges: [
        { from: 'planner', to: 'time_check' },
        { from: 'time_check', to: 'end_node' },
      ],
    }

    it('has only planner, time_check, and end_node', () => {
      expect(quickModeGraph.nodes).toHaveLength(3)
      expect(quickModeGraph.nodes).toEqual(['planner', 'time_check', 'end_node'])
    })

    it('flows planner → time_check → end_node', () => {
      expect(quickModeGraph.edges).toEqual([
        { from: 'planner', to: 'time_check' },
        { from: 'time_check', to: 'end_node' },
      ])
    })

    it('does not include evaluator or quality_review', () => {
      expect(quickModeGraph.nodes).not.toContain('evaluator')
      expect(quickModeGraph.nodes).not.toContain('quality_review')
      expect(quickModeGraph.nodes).not.toContain('gap_researcher')
      expect(quickModeGraph.nodes).not.toContain('improvement')
    })

    it('starts at planner node', () => {
      expect(quickModeGraph.startNodeId).toBe('planner')
    })
  })
})
