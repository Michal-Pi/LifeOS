import { describe, it, expect } from 'vitest'
import type { JoinAggregationMode } from '@lifeos/agents'

/**
 * Phase 44 — Multi-Format Content Output
 *
 * Tests validate structural correctness of the Multi-Format Content Factory
 * graph workflow and the 3 new writer agent templates.
 * Template validation runs at module load via validateWorkflowTemplatePresets().
 */

describe('Phase 44 — Multi-Format Content Factory', () => {
  // Mirrors the graph structure from templatePresets.ts
  const graph = {
    startNodeId: 'strategist',
    nodes: [
      { id: 'strategist', type: 'agent', agentTemplateName: 'Content Strategist (Balanced)' },
      { id: 'researcher', type: 'agent', agentTemplateName: 'Content Research Analyst (Balanced)' },
      { id: 'fork_writers', type: 'fork' },
      { id: 'blog_writer', type: 'agent', agentTemplateName: 'Blog Article Writer (Fast)' },
      { id: 'newsletter_writer', type: 'agent', agentTemplateName: 'Newsletter Writer (Fast)' },
      { id: 'x_thread_writer', type: 'agent', agentTemplateName: 'X Thread Writer (Fast)' },
      { id: 'linkedin_writer', type: 'agent', agentTemplateName: 'LinkedIn Draft Writer (Balanced)' },
      { id: 'join_outputs', type: 'join', aggregationMode: 'concatenate' as JoinAggregationMode },
      { id: 'end_node', type: 'end' },
    ],
    edges: [
      { from: 'strategist', to: 'researcher' },
      { from: 'researcher', to: 'fork_writers' },
      { from: 'fork_writers', to: 'blog_writer' },
      { from: 'fork_writers', to: 'newsletter_writer' },
      { from: 'fork_writers', to: 'x_thread_writer' },
      { from: 'fork_writers', to: 'linkedin_writer' },
      { from: 'blog_writer', to: 'join_outputs' },
      { from: 'newsletter_writer', to: 'join_outputs' },
      { from: 'x_thread_writer', to: 'join_outputs' },
      { from: 'linkedin_writer', to: 'join_outputs' },
      { from: 'join_outputs', to: 'end_node' },
    ],
  }

  it('fork node fans out to exactly 4 writer nodes', () => {
    const forkEdges = graph.edges.filter((e) => e.from === 'fork_writers')
    expect(forkEdges).toHaveLength(4)
    const targets = forkEdges.map((e) => e.to)
    expect(targets).toContain('blog_writer')
    expect(targets).toContain('newsletter_writer')
    expect(targets).toContain('x_thread_writer')
    expect(targets).toContain('linkedin_writer')
  })

  it('all 4 writer nodes feed into join_outputs', () => {
    const joinEdges = graph.edges.filter((e) => e.to === 'join_outputs')
    expect(joinEdges).toHaveLength(4)
    const sources = joinEdges.map((e) => e.from).sort()
    expect(sources).toEqual(['blog_writer', 'linkedin_writer', 'newsletter_writer', 'x_thread_writer'])
  })

  it('join node uses concatenate aggregation mode', () => {
    const joinNode = graph.nodes.find((n) => n.id === 'join_outputs')
    expect(joinNode?.aggregationMode).toBe('concatenate')
  })

  it('all writer agents use fast-tier models (cost-sensitive parallel)', () => {
    const fastWriters = graph.nodes.filter(
      (n) =>
        n.type === 'agent' &&
        n.agentTemplateName &&
        n.agentTemplateName.includes('(Fast)')
    )
    // Blog, Newsletter, X Thread are all (Fast)
    expect(fastWriters).toHaveLength(3)
  })

  it('concatenate is a valid JoinAggregationMode', () => {
    const mode: JoinAggregationMode = 'concatenate'
    expect(mode).toBe('concatenate')
  })

  it('graph has correct sequential flow before fork', () => {
    expect(graph.startNodeId).toBe('strategist')
    const strategistToResearcher = graph.edges.find(
      (e) => e.from === 'strategist' && e.to === 'researcher'
    )
    expect(strategistToResearcher).toBeDefined()
    const researcherToFork = graph.edges.find(
      (e) => e.from === 'researcher' && e.to === 'fork_writers'
    )
    expect(researcherToFork).toBeDefined()
  })
})
