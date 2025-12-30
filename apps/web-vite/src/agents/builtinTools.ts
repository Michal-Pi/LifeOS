export type BuiltinToolMeta = {
  toolId: string
  name: string
  description: string
}

export const builtinTools: BuiltinToolMeta[] = [
  {
    toolId: 'tool:get_current_time',
    name: 'get_current_time',
    description: 'Get the current date and time in ISO format',
  },
  {
    toolId: 'tool:query_firestore',
    name: 'query_firestore',
    description: 'Query Firestore for user data',
  },
  {
    toolId: 'tool:calculate',
    name: 'calculate',
    description: 'Perform math calculations',
  },
  {
    toolId: 'tool:list_calendar_events',
    name: 'list_calendar_events',
    description: 'List upcoming calendar events',
  },
  {
    toolId: 'tool:create_calendar_event',
    name: 'create_calendar_event',
    description: 'Create a new calendar event',
  },
  {
    toolId: 'tool:list_notes',
    name: 'list_notes',
    description: 'List notes for the user',
  },
  {
    toolId: 'tool:create_note',
    name: 'create_note',
    description: 'Create a new note',
  },
  {
    toolId: 'tool:read_note',
    name: 'read_note',
    description: 'Read a note by id',
  },
  {
    toolId: 'tool:web_search',
    name: 'web_search',
    description: 'Search the web via Google Custom Search',
  },
]
