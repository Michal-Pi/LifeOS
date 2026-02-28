/**
 * Custom Tools
 *
 * Loads user-defined tools from Firestore and executes them in a sandbox.
 */

import vm from 'node:vm'
import type { ToolDefinition as DomainToolDefinition, ToolParameter } from '@lifeos/agents'
import { getFirestore } from 'firebase-admin/firestore'
import { createLogger } from '../lib/logger.js'

import type { ToolDefinition as ExecutorToolDefinition } from './toolExecutor.js'

const log = createLogger('CustomTools')

type CustomToolRecord = DomainToolDefinition

const BUILTIN_NAMES = new Set([
  'get_current_time',
  'query_firestore',
  'calculate',
  'list_calendar_events',
  'create_calendar_event',
  'list_notes',
  'create_note',
  'read_note',
  'analyze_note_paragraphs',
  'tag_paragraph_with_note',
  'create_deep_research_request',
  'expert_council_execute',
  'serp_search',
  'read_url',
  'scrape_url',
  'semantic_search',
  'parse_pdf',
  'create_topic',
  'create_todo',
  'list_todos',
  'search_google_drive',
  'download_google_drive_file',
  'list_gmail_messages',
  'read_gmail_message',
  'search_images',
  'search_videos',
  'search_scholar',
  'search_places',
  'find_similar',
  'extract_structured_data',
  'crawl_website',
  'map_website',
  'search_web',
])

export async function loadCustomTools(userId: string): Promise<ExecutorToolDefinition[]> {
  const db = getFirestore()
  const snapshot = await db.collection(`users/${userId}/tools`).orderBy('updatedAtMs', 'desc').get()

  if (snapshot.empty) {
    return []
  }

  const tools: ExecutorToolDefinition[] = []

  for (const doc of snapshot.docs) {
    const data = doc.data() as CustomToolRecord
    if (!data.name || !data.description) {
      continue
    }
    if (BUILTIN_NAMES.has(data.name)) {
      log.warn('Custom tool name conflicts with built-in tool, skipping', { toolName: data.name })
      continue
    }
    if (!data.implementation || data.implementation.type !== 'javascript') {
      log.warn('Custom tool missing JavaScript implementation, skipping', { toolName: data.name })
      continue
    }

    tools.push({
      toolId: data.toolId,
      name: data.name,
      description: data.description,
      parameters: toJsonSchema(data.parameters ?? {}),
      execute: async (params, context) => {
        const sandbox = {
          params,
          context: {
            userId: context.userId,
            runId: context.runId,
            workflowId: context.workflowId,
            agentId: context.agentId,
          },
          fetch: globalThis.fetch,
          console,
          Date,
          Math,
        }

        const wrapper = `(async (params, context) => { ${data.implementation!.code} })`
        const script = new vm.Script(wrapper)
        const fn = script.runInNewContext(sandbox)
        if (typeof fn !== 'function') {
          throw new Error(`Tool ${data.name} did not export a function`)
        }
        return await fn(params, sandbox.context)
      },
    })
  }

  return tools
}

function toJsonSchema(
  parameters: Record<string, ToolParameter>
): ExecutorToolDefinition['parameters'] {
  const required = Object.entries(parameters)
    .filter(([, value]) => value.required)
    .map(([key]) => key)

  const properties = mapProperties(parameters)

  return {
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
  }
}

function mapProperties(
  parameters: Record<string, ToolParameter>
): Record<string, ExecutorToolDefinition['parameters']['properties'][string]> {
  const properties: Record<string, ExecutorToolDefinition['parameters']['properties'][string]> = {}

  for (const [key, value] of Object.entries(parameters)) {
    properties[key] = {
      type: value.type,
      description: value.description,
      required: value.required,
      ...(value.properties ? { properties: mapProperties(value.properties) } : {}),
    }
  }

  return properties
}
