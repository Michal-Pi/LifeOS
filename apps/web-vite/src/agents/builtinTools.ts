export type BuiltinToolMeta = {
  toolId: string
  name: string
  description: string
  parameters?: {
    type: 'object'
    properties: Record<string, { type: string; description: string }>
    required?: string[]
  }
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
    parameters: {
      type: 'object',
      properties: {
        collection: {
          type: 'string',
          description: 'Collection to query (e.g., "todos", "events", "notes")',
        },
        filters: { type: 'object', description: 'Optional filters to apply to the query' },
        limit: { type: 'number', description: 'Maximum number of results to return (default: 10)' },
      },
      required: ['collection'],
    },
  },
  {
    toolId: 'tool:calculate',
    name: 'calculate',
    description: 'Perform math calculations',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'Mathematical expression to evaluate (e.g., "2 + 2", "sqrt(16)")',
        },
      },
      required: ['expression'],
    },
  },
  {
    toolId: 'tool:list_calendar_events',
    name: 'list_calendar_events',
    description: 'List upcoming calendar events',
    parameters: {
      type: 'object',
      properties: {
        startMs: {
          type: 'number',
          description: 'Filter events starting after this timestamp (default: now)',
        },
        endMs: {
          type: 'number',
          description: 'Filter events ending before this timestamp (optional)',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to return (default: 10, max: 50)',
        },
      },
    },
  },
  {
    toolId: 'tool:create_calendar_event',
    name: 'create_calendar_event',
    description: 'Create a new calendar event',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        startMs: { type: 'number', description: 'Event start time in milliseconds since epoch' },
        endMs: { type: 'number', description: 'Event end time in milliseconds since epoch' },
        description: { type: 'string', description: 'Event description (optional)' },
        location: { type: 'string', description: 'Event location (optional)' },
      },
      required: ['title', 'startMs', 'endMs'],
    },
  },
  {
    toolId: 'tool:list_notes',
    name: 'list_notes',
    description: 'List notes for the user',
    parameters: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: 'Filter notes by project/topic ID (optional)' },
        limit: {
          type: 'number',
          description: 'Maximum number of notes to return (default: 10, max: 50)',
        },
      },
    },
  },
  {
    toolId: 'tool:create_note',
    name: 'create_note',
    description: 'Create a new note',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Note title' },
        content: {
          type: 'string',
          description: 'Note content as plain text (will be converted to ProseMirror JSON)',
        },
        projectId: {
          type: 'string',
          description: 'Topic/folder ID to organize the note (optional)',
        },
      },
      required: ['title'],
    },
  },
  {
    toolId: 'tool:read_note',
    name: 'read_note',
    description: 'Read a note by id',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: 'The ID of the note to read' },
      },
      required: ['noteId'],
    },
  },
  {
    toolId: 'tool:analyze_note_paragraphs',
    name: 'analyze_note_paragraphs',
    description: 'Analyze a note and identify key paragraphs/ideas that could be tagged',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: 'The ID of the note to analyze' },
      },
      required: ['noteId'],
    },
  },
  {
    toolId: 'tool:tag_paragraph_with_note',
    name: 'tag_paragraph_with_note',
    description: 'Tag a paragraph in a note with another note or topic',
    parameters: {
      type: 'object',
      properties: {
        noteId: { type: 'string', description: 'The ID of the note containing the paragraph' },
        paragraphIndex: { type: 'number', description: 'The index of the paragraph to tag' },
        tag: { type: 'string', description: 'The tag or target note/topic ID to apply' },
      },
      required: ['noteId', 'paragraphIndex', 'tag'],
    },
  },
  {
    toolId: 'tool:create_deep_research_request',
    name: 'create_deep_research_request',
    description: 'Create a deep research request for external delegation',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Research topic' },
        questions: {
          type: 'string',
          description: 'List of research questions (JSON array of strings)',
        },
        maxBudget: { type: 'number', description: 'Maximum budget for the research (optional)' },
      },
      required: ['topic', 'questions'],
    },
  },
  {
    toolId: 'tool:expert_council_execute',
    name: 'expert_council_execute',
    description: 'Run the Expert Council multi-model consensus pipeline',
    parameters: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'The goal or prompt to run through the Expert Council pipeline',
        },
      },
      required: ['goal'],
    },
  },
  {
    toolId: 'tool:serp_search',
    name: 'serp_search',
    description:
      'Fast web search via Serper with locale support (SERP results, news, People Also Ask)',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5, max: 10)',
        },
        searchType: {
          type: 'string',
          description: 'Type of search: "search" for web, "news" for news (default: "search")',
        },
        gl: {
          type: 'string',
          description: 'Country code for localized results (e.g. "us", "uk", "de")',
        },
        hl: { type: 'string', description: 'Language code for results (e.g. "en", "es", "de")' },
      },
      required: ['query'],
    },
  },
  {
    toolId: 'tool:read_url',
    name: 'read_url',
    description:
      'Read any URL and extract clean content with optional CSS targeting, links and images summary',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to read' },
      },
      required: ['url'],
    },
  },
  {
    toolId: 'tool:scrape_url',
    name: 'scrape_url',
    description:
      'Scrape JS-heavy or blocked web pages with multiple output formats (via Firecrawl)',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to scrape' },
        formats: {
          type: 'string',
          description:
            'Output formats: "markdown", "html", "links", "screenshot" (JSON array of strings)',
        },
      },
      required: ['url'],
    },
  },
  {
    toolId: 'tool:semantic_search',
    name: 'semantic_search',
    description:
      'Neural/semantic search with category, date, and domain filtering for conceptually related content (via Exa)',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Semantic search query' },
        numResults: { type: 'number', description: 'Number of results to return (default: 5)' },
        category: { type: 'string', description: 'Category filter (optional)' },
        searchType: {
          type: 'string',
          description: 'Search type: "neural" or "keyword" (default: "neural")',
        },
      },
      required: ['query'],
    },
  },
  {
    toolId: 'tool:parse_pdf',
    name: 'parse_pdf',
    description: 'Parse a PDF file and extract text content',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL of the PDF file to parse' },
      },
      required: ['url'],
    },
  },
  {
    toolId: 'tool:create_topic',
    name: 'create_topic',
    description: 'Create a new topic/folder to organize notes',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Topic name' },
        description: { type: 'string', description: 'Topic description (optional)' },
      },
      required: ['name'],
    },
  },
  {
    toolId: 'tool:create_todo',
    name: 'create_todo',
    description: 'Create a new todo/task with urgency and importance',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Todo title' },
        urgency: { type: 'string', description: 'Urgency level (low, medium, high, critical)' },
        importance: { type: 'number', description: 'Importance score 1-10' },
        status: {
          type: 'string',
          description: 'Initial status: inbox, next_action, scheduled, waiting, someday, done',
        },
      },
      required: ['title'],
    },
  },
  {
    toolId: 'tool:list_todos',
    name: 'list_todos',
    description: 'List and filter todos by status, due date, and priority',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status: inbox, next_action, scheduled, waiting, someday, done',
        },
        limit: { type: 'number', description: 'Maximum number of todos to return (default: 20)' },
      },
    },
  },
  {
    toolId: 'tool:search_google_drive',
    name: 'search_google_drive',
    description: 'Search files in Google Drive',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for Google Drive files' },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    toolId: 'tool:download_google_drive_file',
    name: 'download_google_drive_file',
    description: 'Download and read content from a Google Drive file',
    parameters: {
      type: 'object',
      properties: {
        fileId: { type: 'string', description: 'The Google Drive file ID to download' },
      },
      required: ['fileId'],
    },
  },
  {
    toolId: 'tool:list_gmail_messages',
    name: 'list_gmail_messages',
    description: 'List Gmail messages with metadata (subject, from, date)',
    parameters: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 10)',
        },
        query: { type: 'string', description: 'Gmail search query (optional)' },
      },
    },
  },
  {
    toolId: 'tool:read_gmail_message',
    name: 'read_gmail_message',
    description: 'Read the full body of a specific Gmail message',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The Gmail message ID to read' },
      },
      required: ['messageId'],
    },
  },
  {
    toolId: 'tool:list_gmail_labels',
    name: 'list_gmail_labels',
    description: 'List all user-created Gmail labels',
  },
  {
    toolId: 'tool:label_gmail_message',
    name: 'label_gmail_message',
    description: 'Apply or remove Gmail labels on a message (without archiving)',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The Gmail message ID' },
        labelId: { type: 'string', description: 'The Gmail label ID to apply' },
      },
      required: ['messageId', 'labelId'],
    },
  },
  {
    toolId: 'tool:archive_gmail_message',
    name: 'archive_gmail_message',
    description: 'Archive a Gmail message (remove from inbox, without labeling)',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'The Gmail message ID to archive' },
      },
      required: ['messageId'],
    },
  },
  {
    toolId: 'tool:search_images',
    name: 'search_images',
    description: 'Search for images by query (via Serper)',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Image search query' },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    toolId: 'tool:search_videos',
    name: 'search_videos',
    description: 'Search for videos on YouTube and other platforms (via Serper)',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Video search query' },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    toolId: 'tool:search_scholar',
    name: 'search_scholar',
    description: 'Search academic papers on Google Scholar (via Serper)',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Academic search query' },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
        },
        yearFrom: {
          type: 'number',
          description: 'Filter papers published from this year (optional)',
        },
        yearTo: {
          type: 'number',
          description: 'Filter papers published up to this year (optional)',
        },
      },
      required: ['query'],
    },
  },
  {
    toolId: 'tool:search_places',
    name: 'search_places',
    description: 'Search local businesses and places (via Serper)',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Places search query' },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    toolId: 'tool:find_similar',
    name: 'find_similar',
    description: 'Find pages similar to a URL for competitive analysis (via Exa)',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to find similar pages for' },
        numResults: {
          type: 'number',
          description: 'Number of similar results to return (default: 5)',
        },
      },
      required: ['url'],
    },
  },
  {
    toolId: 'tool:extract_structured_data',
    name: 'extract_structured_data',
    description: 'Extract structured data from web pages with prompts (via Firecrawl)',
    parameters: {
      type: 'object',
      properties: {
        urls: { type: 'string', description: 'URLs to extract data from (JSON array of strings)' },
        prompt: {
          type: 'string',
          description: 'Prompt describing what data to extract (optional)',
        },
      },
      required: ['urls'],
    },
  },
  {
    toolId: 'tool:crawl_website',
    name: 'crawl_website',
    description: 'Crawl an entire website and extract content (via Firecrawl)',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The starting URL to crawl' },
        limit: { type: 'number', description: 'Maximum number of pages to crawl (default: 10)' },
      },
      required: ['url'],
    },
  },
  {
    toolId: 'tool:map_website',
    name: 'map_website',
    description: 'Get all URLs from a website without scraping (via Firecrawl)',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The website URL to map' },
      },
      required: ['url'],
    },
  },
  {
    toolId: 'tool:search_web',
    name: 'search_web',
    description: 'Search the web with full content extraction (via Jina)',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Web search query' },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    toolId: 'tool:update_todo',
    name: 'update_todo',
    description: 'Update an existing todo item (status, urgency, importance, estimatedMinutes)',
    parameters: {
      type: 'object',
      properties: {
        todoId: { type: 'string', description: 'The ID of the todo to update' },
        status: {
          type: 'string',
          description: 'New status: inbox, next_action, scheduled, waiting, someday, done',
        },
        urgency: { type: 'string', description: 'Urgency level (low, medium, high, critical)' },
        importance: { type: 'number', description: 'Importance score 1-10' },
        estimatedMinutes: { type: 'number', description: 'Estimated time in minutes' },
      },
      required: ['todoId'],
    },
  },
  {
    toolId: 'tool:delete_todo',
    name: 'delete_todo',
    description: 'Delete a todo item by ID',
    parameters: {
      type: 'object',
      properties: {
        todoId: { type: 'string', description: 'The ID of the todo to delete' },
      },
      required: ['todoId'],
    },
  },
  {
    toolId: 'tool:memory_recall',
    name: 'memory_recall',
    description: 'Recall information from past conversations and stored memories',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for memory recall' },
        limit: { type: 'number', description: 'Maximum memories to return (default: 5)' },
      },
      required: ['query'],
    },
  },
  {
    toolId: 'tool:generate_chart',
    name: 'generate_chart',
    description: 'Generate a chart/visualization from data (returns chart specification)',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Chart type: bar, line, pie, scatter' },
        data: { type: 'string', description: 'JSON data for the chart' },
        title: { type: 'string', description: 'Chart title' },
      },
      required: ['type', 'data'],
    },
  },
  {
    toolId: 'tool:code_interpreter',
    name: 'code_interpreter',
    description:
      'Execute JavaScript code in a sandboxed environment for calculations and data processing',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute' },
      },
      required: ['code'],
    },
  },
  {
    toolId: 'tool:webhook_call',
    name: 'webhook_call',
    description:
      'Call an external webhook URL with a JSON payload (limited to user-whitelisted HTTPS URLs)',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Webhook URL (must be HTTPS and whitelisted)' },
        method: { type: 'string', description: 'HTTP method: GET or POST (default: POST)' },
        payload: { type: 'string', description: 'JSON payload to send' },
      },
      required: ['url'],
    },
  },
  {
    toolId: 'tool:ask_user',
    name: 'ask_user',
    description:
      'Pause the workflow and ask the user a clarifying question. The workflow will resume once the user responds.',
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description:
            'The question to ask the user. Be specific about what information you need and why.',
        },
      },
      required: ['question'],
    },
  },
]
