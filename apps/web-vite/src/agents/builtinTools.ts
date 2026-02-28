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
    description:
      'Fast web search via Serper with locale support (SERP results, news, People Also Ask)',
  },
  {
    toolId: 'tool:read_url',
    name: 'read_url',
    description:
      'Read any URL and extract clean content with optional CSS targeting, links and images summary',
  },
  {
    toolId: 'tool:scrape_url',
    name: 'scrape_url',
    description:
      'Scrape JS-heavy or blocked web pages with multiple output formats (via Firecrawl)',
  },
  {
    toolId: 'tool:semantic_search',
    name: 'semantic_search',
    description:
      'Neural/semantic search with category, date, and domain filtering for conceptually related content (via Exa)',
  },
  {
    toolId: 'tool:parse_pdf',
    name: 'parse_pdf',
    description: 'Parse a PDF file and extract text content',
  },
  {
    toolId: 'tool:create_topic',
    name: 'create_topic',
    description: 'Create a new topic/folder to organize notes',
  },
  {
    toolId: 'tool:create_todo',
    name: 'create_todo',
    description: 'Create a new todo/task with urgency and importance',
  },
  {
    toolId: 'tool:list_todos',
    name: 'list_todos',
    description: 'List and filter todos by status, due date, and priority',
  },
  {
    toolId: 'tool:search_google_drive',
    name: 'search_google_drive',
    description: 'Search files in Google Drive',
  },
  {
    toolId: 'tool:download_google_drive_file',
    name: 'download_google_drive_file',
    description: 'Download and read content from a Google Drive file',
  },
  {
    toolId: 'tool:list_gmail_messages',
    name: 'list_gmail_messages',
    description: 'List Gmail messages with metadata (subject, from, date)',
  },
  {
    toolId: 'tool:read_gmail_message',
    name: 'read_gmail_message',
    description: 'Read the full body of a specific Gmail message',
  },
  {
    toolId: 'tool:search_images',
    name: 'search_images',
    description: 'Search for images by query (via Serper)',
  },
  {
    toolId: 'tool:search_videos',
    name: 'search_videos',
    description: 'Search for videos on YouTube and other platforms (via Serper)',
  },
  {
    toolId: 'tool:search_scholar',
    name: 'search_scholar',
    description: 'Search academic papers on Google Scholar (via Serper)',
  },
  {
    toolId: 'tool:search_places',
    name: 'search_places',
    description: 'Search local businesses and places (via Serper)',
  },
  {
    toolId: 'tool:find_similar',
    name: 'find_similar',
    description: 'Find pages similar to a URL for competitive analysis (via Exa)',
  },
  {
    toolId: 'tool:extract_structured_data',
    name: 'extract_structured_data',
    description: 'Extract structured data from web pages with prompts (via Firecrawl)',
  },
  {
    toolId: 'tool:crawl_website',
    name: 'crawl_website',
    description: 'Crawl an entire website and extract content (via Firecrawl)',
  },
  {
    toolId: 'tool:map_website',
    name: 'map_website',
    description: 'Get all URLs from a website without scraping (via Firecrawl)',
  },
  {
    toolId: 'tool:search_web',
    name: 'search_web',
    description: 'Search the web with full content extraction (via Jina)',
  },
]
