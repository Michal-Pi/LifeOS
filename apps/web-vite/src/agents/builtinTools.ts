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
    toolId: 'tool:analyze_note_paragraphs',
    name: 'analyze_note_paragraphs',
    description: 'Analyze a note and identify key paragraphs/ideas that could be tagged',
  },
  {
    toolId: 'tool:tag_paragraph_with_note',
    name: 'tag_paragraph_with_note',
    description: 'Tag a paragraph in a note with another note or topic',
  },
  {
    toolId: 'tool:web_search',
    name: 'web_search',
    description: 'Search the web via Google Custom Search',
  },
  {
    toolId: 'tool:create_deep_research_request',
    name: 'create_deep_research_request',
    description: 'Create a deep research request for external delegation',
  },
  {
    toolId: 'tool:expert_council_execute',
    name: 'expert_council_execute',
    description: 'Run the Expert Council multi-model consensus pipeline',
  },
  {
    toolId: 'tool:serp_search',
    name: 'serp_search',
    description: 'Fast web search via Serper (SERP results, news, People Also Ask)',
  },
  {
    toolId: 'tool:read_url',
    name: 'read_url',
    description: 'Read any URL and extract clean markdown content (via Jina Reader)',
  },
  {
    toolId: 'tool:scrape_url',
    name: 'scrape_url',
    description: 'Scrape JS-heavy or blocked web pages (via Firecrawl)',
  },
  {
    toolId: 'tool:semantic_search',
    name: 'semantic_search',
    description: 'Neural/semantic search for conceptually related content (via Exa)',
  },
]
