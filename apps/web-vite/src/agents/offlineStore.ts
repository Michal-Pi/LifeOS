/**
 * Offline Storage for Agents & Workflows
 *
 * Read-only IndexedDB cache for agent configs, workflows, runs, templates, and tools.
 * Data is written through Firestore and cached locally for offline access.
 */

import { openDB, type IDBPDatabase } from 'idb'
import type {
  AgentConfig,
  AgentId,
  Workflow,
  WorkflowId,
  Run,
  RunId,
  WorkflowTemplate,
  WorkflowTemplateId,
  AgentTemplate,
  AgentTemplateId,
  ToolDefinition,
  ToolId,
} from '@lifeos/agents'

const DB_NAME = 'lifeos-agents'
const DB_VERSION = 1

const WORKFLOWS_STORE = 'workflows'
const WORKFLOW_TEMPLATES_STORE = 'workflowTemplates'
const AGENTS_STORE = 'agents'
const AGENT_TEMPLATES_STORE = 'agentTemplates'
const TOOLS_STORE = 'tools'
const RUNS_STORE = 'runs'

let dbPromise: Promise<IDBPDatabase> | null = null

async function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(WORKFLOWS_STORE)) {
          const store = db.createObjectStore(WORKFLOWS_STORE, { keyPath: 'workflowId' })
          store.createIndex('userId', 'userId')
          store.createIndex('archived', 'archived')
        }

        if (!db.objectStoreNames.contains(WORKFLOW_TEMPLATES_STORE)) {
          const store = db.createObjectStore(WORKFLOW_TEMPLATES_STORE, { keyPath: 'templateId' })
          store.createIndex('userId', 'userId')
        }

        if (!db.objectStoreNames.contains(AGENTS_STORE)) {
          const store = db.createObjectStore(AGENTS_STORE, { keyPath: 'agentId' })
          store.createIndex('userId', 'userId')
          store.createIndex('role', 'role')
          store.createIndex('archived', 'archived')
        }

        if (!db.objectStoreNames.contains(AGENT_TEMPLATES_STORE)) {
          const store = db.createObjectStore(AGENT_TEMPLATES_STORE, { keyPath: 'templateId' })
          store.createIndex('userId', 'userId')
        }

        if (!db.objectStoreNames.contains(TOOLS_STORE)) {
          const store = db.createObjectStore(TOOLS_STORE, { keyPath: 'toolId' })
          store.createIndex('userId', 'userId')
        }

        if (!db.objectStoreNames.contains(RUNS_STORE)) {
          const store = db.createObjectStore(RUNS_STORE, { keyPath: 'runId' })
          store.createIndex('userId', 'userId')
          store.createIndex('workflowId', 'workflowId')
          store.createIndex('status', 'status')
          store.createIndex('startedAtMs', 'startedAtMs')
        }
      },
    })
  }
  return dbPromise
}

// ============================================================================
// Workflows
// ============================================================================

export async function saveWorkflowLocally(workflow: Workflow): Promise<void> {
  const db = await getDb()
  await db.put(WORKFLOWS_STORE, workflow)
}

export async function getWorkflowLocally(workflowId: WorkflowId): Promise<Workflow | undefined> {
  const db = await getDb()
  return db.get(WORKFLOWS_STORE, workflowId)
}

export async function deleteWorkflowLocally(workflowId: WorkflowId): Promise<void> {
  const db = await getDb()
  await db.delete(WORKFLOWS_STORE, workflowId)
}

export async function listWorkflowsLocally(userId: string): Promise<Workflow[]> {
  if (!userId) return []
  const db = await getDb()
  const index = db.transaction(WORKFLOWS_STORE).store.index('userId')
  return index.getAll(userId)
}

export async function bulkSaveWorkflowsLocally(workflows: Workflow[]): Promise<void> {
  if (workflows.length === 0) return
  const db = await getDb()
  const tx = db.transaction(WORKFLOWS_STORE, 'readwrite')
  await Promise.all(workflows.map((w) => tx.store.put(w)))
  await tx.done
}

// ============================================================================
// Workflow Templates
// ============================================================================

export async function saveWorkflowTemplateLocally(template: WorkflowTemplate): Promise<void> {
  const db = await getDb()
  await db.put(WORKFLOW_TEMPLATES_STORE, template)
}

export async function deleteWorkflowTemplateLocally(templateId: WorkflowTemplateId): Promise<void> {
  const db = await getDb()
  await db.delete(WORKFLOW_TEMPLATES_STORE, templateId)
}

export async function listWorkflowTemplatesLocally(userId: string): Promise<WorkflowTemplate[]> {
  if (!userId) return []
  const db = await getDb()
  const index = db.transaction(WORKFLOW_TEMPLATES_STORE).store.index('userId')
  return index.getAll(userId)
}

export async function bulkSaveWorkflowTemplatesLocally(
  templates: WorkflowTemplate[]
): Promise<void> {
  if (templates.length === 0) return
  const db = await getDb()
  const tx = db.transaction(WORKFLOW_TEMPLATES_STORE, 'readwrite')
  await Promise.all(templates.map((t) => tx.store.put(t)))
  await tx.done
}

// ============================================================================
// Agents
// ============================================================================

export async function saveAgentLocally(agent: AgentConfig): Promise<void> {
  const db = await getDb()
  await db.put(AGENTS_STORE, agent)
}

export async function getAgentLocally(agentId: AgentId): Promise<AgentConfig | undefined> {
  const db = await getDb()
  return db.get(AGENTS_STORE, agentId)
}

export async function deleteAgentLocally(agentId: AgentId): Promise<void> {
  const db = await getDb()
  await db.delete(AGENTS_STORE, agentId)
}

export async function listAgentsLocally(userId: string): Promise<AgentConfig[]> {
  if (!userId) return []
  const db = await getDb()
  const index = db.transaction(AGENTS_STORE).store.index('userId')
  return index.getAll(userId)
}

export async function bulkSaveAgentsLocally(agents: AgentConfig[]): Promise<void> {
  if (agents.length === 0) return
  const db = await getDb()
  const tx = db.transaction(AGENTS_STORE, 'readwrite')
  await Promise.all(agents.map((a) => tx.store.put(a)))
  await tx.done
}

// ============================================================================
// Agent Templates
// ============================================================================

export async function saveAgentTemplateLocally(template: AgentTemplate): Promise<void> {
  const db = await getDb()
  await db.put(AGENT_TEMPLATES_STORE, template)
}

export async function deleteAgentTemplateLocally(templateId: AgentTemplateId): Promise<void> {
  const db = await getDb()
  await db.delete(AGENT_TEMPLATES_STORE, templateId)
}

export async function listAgentTemplatesLocally(userId: string): Promise<AgentTemplate[]> {
  if (!userId) return []
  const db = await getDb()
  const index = db.transaction(AGENT_TEMPLATES_STORE).store.index('userId')
  return index.getAll(userId)
}

export async function bulkSaveAgentTemplatesLocally(templates: AgentTemplate[]): Promise<void> {
  if (templates.length === 0) return
  const db = await getDb()
  const tx = db.transaction(AGENT_TEMPLATES_STORE, 'readwrite')
  await Promise.all(templates.map((t) => tx.store.put(t)))
  await tx.done
}

// ============================================================================
// Tools
// ============================================================================

export async function saveToolLocally(tool: ToolDefinition): Promise<void> {
  const db = await getDb()
  await db.put(TOOLS_STORE, tool)
}

export async function deleteToolLocally(toolId: ToolId): Promise<void> {
  const db = await getDb()
  await db.delete(TOOLS_STORE, toolId)
}

export async function listToolsLocally(userId: string): Promise<ToolDefinition[]> {
  if (!userId) return []
  const db = await getDb()
  const index = db.transaction(TOOLS_STORE).store.index('userId')
  return index.getAll(userId)
}

export async function bulkSaveToolsLocally(tools: ToolDefinition[]): Promise<void> {
  if (tools.length === 0) return
  const db = await getDb()
  const tx = db.transaction(TOOLS_STORE, 'readwrite')
  await Promise.all(tools.map((t) => tx.store.put(t)))
  await tx.done
}

// ============================================================================
// Runs
// ============================================================================

export async function saveRunLocally(run: Run): Promise<void> {
  const db = await getDb()
  await db.put(RUNS_STORE, run)
}

export async function getRunLocally(runId: RunId): Promise<Run | undefined> {
  const db = await getDb()
  return db.get(RUNS_STORE, runId)
}

export async function deleteRunLocally(runId: RunId): Promise<void> {
  const db = await getDb()
  await db.delete(RUNS_STORE, runId)
}

export async function listRunsLocally(userId: string): Promise<Run[]> {
  if (!userId) return []
  const db = await getDb()
  const index = db.transaction(RUNS_STORE).store.index('userId')
  return index.getAll(userId)
}

export async function listRunsByWorkflowLocally(workflowId: WorkflowId): Promise<Run[]> {
  const db = await getDb()
  const index = db.transaction(RUNS_STORE).store.index('workflowId')
  return index.getAll(workflowId)
}

export async function bulkSaveRunsLocally(runs: Run[]): Promise<void> {
  if (runs.length === 0) return
  const db = await getDb()
  const tx = db.transaction(RUNS_STORE, 'readwrite')
  await Promise.all(runs.map((r) => tx.store.put(r)))
  await tx.done
}
