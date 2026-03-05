import { describe, it, expect, vi, beforeEach } from 'vitest'
import { classifyQueryType, getSearchStrategy } from '../deepResearch/searchRouter.js'
import {
  computeQueryHash,
  getCachedSearchResults,
  cacheSearchResults,
} from '../deepResearch/searchCache.js'

describe('Phase 45 — classifyQueryType', () => {
  it('"What is quantum computing" → factual', () => {
    expect(classifyQueryType('What is quantum computing')).toBe('factual')
  })

  it('"peer-reviewed studies on sleep" → academic', () => {
    expect(classifyQueryType('peer-reviewed studies on sleep deprivation')).toBe('academic')
  })

  it('"Why does inflation affect housing" → conceptual', () => {
    expect(classifyQueryType('Why does inflation affect housing prices')).toBe('conceptual')
  })

  it('"React vs Vue" → comparative', () => {
    expect(classifyQueryType('React vs Vue for enterprise apps')).toBe('comparative')
  })

  it('"best restaurants in Tokyo" → general (fallback)', () => {
    expect(classifyQueryType('best restaurants in Tokyo')).toBe('general')
  })

  it('"How does photosynthesis work" → conceptual', () => {
    expect(classifyQueryType('How does photosynthesis work')).toBe('conceptual')
  })

  it('"When did World War 2 end" → factual', () => {
    expect(classifyQueryType('When did World War 2 end')).toBe('factual')
  })

  it('"difference between TCP and UDP" → comparative', () => {
    expect(classifyQueryType('difference between TCP and UDP')).toBe('comparative')
  })
})

describe('Phase 45 — getSearchStrategy', () => {
  it('factual → SERP only', () => {
    const strategy = getSearchStrategy('factual')
    expect(strategy.useSERP).toBe(true)
    expect(strategy.useScholar).toBe(false)
    expect(strategy.useSemantic).toBe(false)
    expect(strategy.priority).toBe('serp')
  })

  it('academic → Scholar primary, SERP secondary', () => {
    const strategy = getSearchStrategy('academic')
    expect(strategy.useScholar).toBe(true)
    expect(strategy.useSERP).toBe(true)
    expect(strategy.priority).toBe('scholar')
  })

  it('conceptual → Semantic primary', () => {
    const strategy = getSearchStrategy('conceptual')
    expect(strategy.useSemantic).toBe(true)
    expect(strategy.priority).toBe('semantic')
  })

  it('comparative → SERP + Semantic', () => {
    const strategy = getSearchStrategy('comparative')
    expect(strategy.useSERP).toBe(true)
    expect(strategy.useSemantic).toBe(true)
    expect(strategy.useScholar).toBe(false)
  })

  it('general → all three', () => {
    const strategy = getSearchStrategy('general')
    expect(strategy.useSERP).toBe(true)
    expect(strategy.useScholar).toBe(true)
    expect(strategy.useSemantic).toBe(true)
  })
})

describe('Phase 45 — searchCache', () => {
  it('computeQueryHash is deterministic', () => {
    const hash1 = computeQueryHash('test query')
    const hash2 = computeQueryHash('test query')
    expect(hash1).toBe(hash2)
  })

  it('computeQueryHash normalizes case and whitespace', () => {
    const hash1 = computeQueryHash('Test Query')
    const hash2 = computeQueryHash('  test query  ')
    expect(hash1).toBe(hash2)
  })

  it('different queries produce different hashes', () => {
    const hash1 = computeQueryHash('query one')
    const hash2 = computeQueryHash('query two')
    expect(hash1).not.toBe(hash2)
  })

  describe('getCachedSearchResults', () => {
    const mockGet = vi.fn()
    const mockDoc = vi.fn().mockReturnValue({ get: mockGet })
    const mockFirestore = { doc: mockDoc } as unknown as FirebaseFirestore.Firestore

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('returns results on cache hit', async () => {
      const cachedData = {
        results: [{ url: 'https://example.com', title: 'Test' }],
        cachedAtMs: Date.now() - 1000,
        expiresAtMs: Date.now() + 100000,
      }
      mockGet.mockResolvedValue({ exists: true, data: () => cachedData })

      const results = await getCachedSearchResults('user-1', 'hash123', 'serp', mockFirestore)
      expect(results).toEqual(cachedData.results)
    })

    it('returns null on cache miss', async () => {
      mockGet.mockResolvedValue({ exists: false })

      const results = await getCachedSearchResults('user-1', 'hash123', 'serp', mockFirestore)
      expect(results).toBeNull()
    })

    it('returns null on expired cache entry', async () => {
      const expired = {
        results: [{ url: 'https://old.com' }],
        cachedAtMs: Date.now() - 100000,
        expiresAtMs: Date.now() - 1000, // expired
      }
      mockGet.mockResolvedValue({ exists: true, data: () => expired })

      const results = await getCachedSearchResults('user-1', 'hash123', 'serp', mockFirestore)
      expect(results).toBeNull()
    })
  })

  describe('cacheSearchResults', () => {
    const mockSet = vi.fn().mockResolvedValue(undefined)
    const mockDoc = vi.fn().mockReturnValue({ set: mockSet })
    const mockFirestore = { doc: mockDoc } as unknown as FirebaseFirestore.Firestore

    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('stores results at correct path', async () => {
      await cacheSearchResults('user-1', 'abc123', 'serp', [{ url: 'test.com' }], mockFirestore)
      expect(mockDoc).toHaveBeenCalledWith('users/user-1/searchCache/abc123_serp')
      expect(mockSet).toHaveBeenCalledTimes(1)
    })

    it('sets expiry based on source TTL', async () => {
      const before = Date.now()
      await cacheSearchResults('user-1', 'abc123', 'scholar', [], mockFirestore)
      const after = Date.now()

      const storedEntry = mockSet.mock.calls[0][0]
      // Scholar TTL is 72 hours = 259200000ms
      expect(storedEntry.expiresAtMs).toBeGreaterThanOrEqual(before + 72 * 60 * 60 * 1000)
      expect(storedEntry.expiresAtMs).toBeLessThanOrEqual(after + 72 * 60 * 60 * 1000)
    })
  })
})
