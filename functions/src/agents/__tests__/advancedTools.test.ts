import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NoAPIKeyConfiguredError } from '../errorHandler.js'

// ----- Mocks -----

// Mock firebase-admin/firestore
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({
      limit: vi.fn(() => ({
        get: vi.fn(() => ({ empty: true })),
      })),
    })),
    doc: vi.fn(() => ({
      get: vi.fn(() => ({ exists: false })),
      set: vi.fn(),
    })),
  })),
}))

// Mock external Google dependencies
vi.mock('../../google/driveApi.js', () => ({
  searchDriveFiles: vi.fn(),
  downloadDriveFile: vi.fn(),
}))

vi.mock('../../google/gmailApi.js', () => ({
  listGmailMessages: vi.fn(),
  readGmailMessage: vi.fn(),
}))

// Mock deep research validation
vi.mock('../deepResearchValidation.js', () => ({
  assertValidResearchContext: vi.fn(),
  normalizeResearchQuestions: vi.fn((q: string[]) => q),
}))

// Mock global fetch
const mockFetch = vi.fn()
globalThis.fetch = mockFetch

// ----- Tests -----

describe('advancedTools', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- NoAPIKeyConfiguredError ----

  describe('NoAPIKeyConfiguredError', () => {
    it('has correct name property', () => {
      const error = new NoAPIKeyConfiguredError('Serper', 'SERPER_API_KEY')
      expect(error.name).toBe('NoAPIKeyConfiguredError')
    })

    it('has category "config"', () => {
      const error = new NoAPIKeyConfiguredError('Serper', 'SERPER_API_KEY')
      expect(error.category).toBe('config')
    })

    it('is not retryable', () => {
      const error = new NoAPIKeyConfiguredError('Serper', 'SERPER_API_KEY')
      expect(error.retryable).toBe(false)
    })

    it('includes provider name in message', () => {
      const error = new NoAPIKeyConfiguredError('Serper', 'SERPER_API_KEY')
      expect(error.message).toContain('Serper')
      expect(error.message).toContain('SERPER_API_KEY')
    })

    it('includes user-friendly guidance in userMessage', () => {
      const error = new NoAPIKeyConfiguredError('Serper', 'SERPER_API_KEY')
      expect(error.userMessage).toContain('Settings')
      expect(error.userMessage).toContain('Serper')
    })
  })

  // ---- serp_search ----

  describe('serp_search', () => {
    it('throws NoAPIKeyConfiguredError when API key is missing', async () => {
      const { serpSearchTool } = await import('../advancedTools.js')

      await expect(
        serpSearchTool.execute({ query: 'test' }, { userId: 'u1' } as any)
      ).rejects.toThrow(NoAPIKeyConfiguredError)
    })

    it('returns results on successful search', async () => {
      const { serpSearchTool } = await import('../advancedTools.js')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          organic: [
            {
              title: 'Result 1',
              snippet: 'Snippet 1',
              link: 'https://example.com',
              position: 1,
            },
          ],
        }),
      })

      const result = await serpSearchTool.execute(
        { query: 'test' },
        { userId: 'u1', searchToolKeys: { serper: 'fake-key' } } as any
      )

      expect(result).toHaveProperty('results')
      expect((result as { results: unknown[] }).results).toHaveLength(1)
    })

    it('sends correct headers and body to Serper API', async () => {
      const { serpSearchTool } = await import('../advancedTools.js')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organic: [] }),
      })

      await serpSearchTool.execute(
        { query: 'vitest testing' },
        { userId: 'u1', searchToolKeys: { serper: 'my-serper-key' } } as any
      )

      expect(mockFetch).toHaveBeenCalledWith(
        'https://google.serper.dev/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-API-KEY': 'my-serper-key',
            'Content-Type': 'application/json',
          }),
        })
      )

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(callBody.q).toBe('vitest testing')
    })

    it('uses news endpoint when searchType is "news"', async () => {
      const { serpSearchTool } = await import('../advancedTools.js')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          news: [
            {
              title: 'News 1',
              snippet: 'News snippet',
              link: 'https://news.example.com',
              date: '2025-01-01',
              source: 'Example News',
            },
          ],
        }),
      })

      const result = await serpSearchTool.execute(
        { query: 'test news', searchType: 'news' },
        { userId: 'u1', searchToolKeys: { serper: 'fake-key' } } as any
      )

      expect(mockFetch).toHaveBeenCalledWith(
        'https://google.serper.dev/news',
        expect.anything()
      )

      const typedResult = result as { searchType: string; results: Array<{ source?: string }> }
      expect(typedResult.searchType).toBe('news')
      expect(typedResult.results[0].source).toBe('Example News')
    })

    it('throws structured error on API failure', async () => {
      const { serpSearchTool } = await import('../advancedTools.js')

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      await expect(
        serpSearchTool.execute(
          { query: 'test' },
          { userId: 'u1', searchToolKeys: { serper: 'fake-key' } } as any
        )
      ).rejects.toThrow()
    })

    it('wraps unexpected errors via wrapError', async () => {
      const { serpSearchTool } = await import('../advancedTools.js')

      mockFetch.mockRejectedValueOnce(new Error('Network failure'))

      await expect(
        serpSearchTool.execute(
          { query: 'test' },
          { userId: 'u1', searchToolKeys: { serper: 'fake-key' } } as any
        )
      ).rejects.toThrow()
    })
  })

  // ---- Input sanitization ----

  describe('sanitizeSearchQuery (via serp_search)', () => {
    it('trims whitespace from query', async () => {
      const { serpSearchTool } = await import('../advancedTools.js')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organic: [] }),
      })

      const result = await serpSearchTool.execute(
        { query: '  padded query  ' },
        { userId: 'u1', searchToolKeys: { serper: 'fake-key' } } as any
      )

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(callBody.q).toBe('padded query')

      expect((result as { query: string }).query).toBe('padded query')
    })

    it('truncates very long queries', async () => {
      const { serpSearchTool } = await import('../advancedTools.js')

      const longQuery = 'a'.repeat(1000)

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ organic: [] }),
      })

      const result = await serpSearchTool.execute(
        { query: longQuery },
        { userId: 'u1', searchToolKeys: { serper: 'fake-key' } } as any
      )

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(callBody.q.length).toBeLessThanOrEqual(500)

      expect((result as { query: string }).query.length).toBeLessThanOrEqual(500)
    })
  })

  // ---- semantic_search ----

  describe('semantic_search', () => {
    it('throws NoAPIKeyConfiguredError when Exa key is missing', async () => {
      const { semanticSearchTool } = await import('../advancedTools.js')

      await expect(
        semanticSearchTool.execute({ query: 'test' }, { userId: 'u1' } as any)
      ).rejects.toThrow(NoAPIKeyConfiguredError)
    })

    it('returns results on successful semantic search', async () => {
      const { semanticSearchTool } = await import('../advancedTools.js')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [
            {
              title: 'Semantic Result',
              url: 'https://example.com/semantic',
              text: 'Some conceptual content',
              score: 0.95,
            },
          ],
          autopromptString: 'optimized query',
        }),
      })

      const result = await semanticSearchTool.execute(
        { query: 'conceptual search' },
        { userId: 'u1', searchToolKeys: { exa: 'fake-exa-key' } } as any
      )

      const typedResult = result as { count: number; results: unknown[]; optimizedQuery?: string }
      expect(typedResult.count).toBe(1)
      expect(typedResult.results).toHaveLength(1)
      expect(typedResult.optimizedQuery).toBe('optimized query')
    })

    it('throws on API failure', async () => {
      const { semanticSearchTool } = await import('../advancedTools.js')

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      })

      await expect(
        semanticSearchTool.execute(
          { query: 'test' },
          { userId: 'u1', searchToolKeys: { exa: 'fake-exa-key' } } as any
        )
      ).rejects.toThrow()
    })
  })

  // ---- scrape_url ----

  describe('scrape_url', () => {
    it('throws NoAPIKeyConfiguredError when Firecrawl key is missing', async () => {
      const { scrapeUrlTool } = await import('../advancedTools.js')

      await expect(
        scrapeUrlTool.execute({ url: 'https://example.com' }, { userId: 'u1' } as any)
      ).rejects.toThrow(NoAPIKeyConfiguredError)
    })

    it('returns scraped content on success', async () => {
      const { scrapeUrlTool } = await import('../advancedTools.js')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            markdown: '# Hello World\n\nSome content here.',
            metadata: {
              title: 'Hello World Page',
              description: 'A test page',
              sourceURL: 'https://example.com',
            },
          },
        }),
      })

      const result = await scrapeUrlTool.execute(
        { url: 'https://example.com' },
        { userId: 'u1', searchToolKeys: { firecrawl: 'fake-fc-key' } } as any
      )

      const typedResult = result as { url: string; title: string; content: string }
      expect(typedResult.url).toBe('https://example.com')
      expect(typedResult.title).toBe('Hello World Page')
      expect(typedResult.content).toContain('Hello World')
    })

    it('throws on API failure', async () => {
      const { scrapeUrlTool } = await import('../advancedTools.js')

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      })

      await expect(
        scrapeUrlTool.execute(
          { url: 'https://example.com' },
          { userId: 'u1', searchToolKeys: { firecrawl: 'fake-fc-key' } } as any
        )
      ).rejects.toThrow()
    })

    it('throws when Firecrawl returns unsuccessful response', async () => {
      const { scrapeUrlTool } = await import('../advancedTools.js')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          data: null,
        }),
      })

      await expect(
        scrapeUrlTool.execute(
          { url: 'https://example.com' },
          { userId: 'u1', searchToolKeys: { firecrawl: 'fake-fc-key' } } as any
        )
      ).rejects.toThrow('Firecrawl scraping failed')
    })
  })

  // ---- Error wrapping ----

  describe('error wrapping', () => {
    it('wraps fetch network errors into AgentError via serp_search', async () => {
      const { serpSearchTool } = await import('../advancedTools.js')

      const networkError = new Error('fetch failed')
      ;(networkError as any).code = 'ECONNREFUSED'
      mockFetch.mockRejectedValueOnce(networkError)

      try {
        await serpSearchTool.execute(
          { query: 'test' },
          { userId: 'u1', searchToolKeys: { serper: 'fake-key' } } as any
        )
        expect.fail('Expected error to be thrown')
      } catch (error: any) {
        expect(error.name).toBe('AgentError')
        expect(error.category).toBe('network')
        expect(error.retryable).toBe(true)
      }
    })

    it('wraps fetch network errors into AgentError via semantic_search', async () => {
      const { semanticSearchTool } = await import('../advancedTools.js')

      const networkError = new Error('fetch failed')
      ;(networkError as any).code = 'ETIMEDOUT'
      mockFetch.mockRejectedValueOnce(networkError)

      try {
        await semanticSearchTool.execute(
          { query: 'test' },
          { userId: 'u1', searchToolKeys: { exa: 'fake-exa-key' } } as any
        )
        expect.fail('Expected error to be thrown')
      } catch (error: any) {
        expect(error.name).toBe('AgentError')
        expect(error.category).toBe('network')
        expect(error.retryable).toBe(true)
      }
    })

    it('wraps fetch network errors into AgentError via scrape_url', async () => {
      const { scrapeUrlTool } = await import('../advancedTools.js')

      const networkError = new Error('fetch failed')
      ;(networkError as any).code = 'ENOTFOUND'
      mockFetch.mockRejectedValueOnce(networkError)

      try {
        await scrapeUrlTool.execute(
          { url: 'https://example.com' },
          { userId: 'u1', searchToolKeys: { firecrawl: 'fake-fc-key' } } as any
        )
        expect.fail('Expected error to be thrown')
      } catch (error: any) {
        expect(error.name).toBe('AgentError')
        expect(error.category).toBe('network')
        expect(error.retryable).toBe(true)
      }
    })

    it('preserves AgentError instances through wrapError', async () => {
      const { serpSearchTool } = await import('../advancedTools.js')

      // A 429 response triggers throwApiError which creates an AgentError with rate_limit category
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      })

      try {
        await serpSearchTool.execute(
          { query: 'test' },
          { userId: 'u1', searchToolKeys: { serper: 'fake-key' } } as any
        )
        expect.fail('Expected error to be thrown')
      } catch (error: any) {
        // throwApiError creates an AgentError; wrapError passes it through unchanged
        expect(error.name).toBe('AgentError')
        expect(error.category).toBe('rate_limit')
        expect(error.retryable).toBe(true)
      }
    })
  })
})
