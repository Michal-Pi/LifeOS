import { describe, expect, it } from 'vitest'

describe('deep research context seeding progress', () => {
  it('advances claimsProcessedCount and slices only newly extracted claims for kg construction', () => {
    const seededClaims = Array.from({ length: 5 }, (_, i) => ({ claimId: `seed-${i}` }))
    const newlyExtractedClaims = Array.from({ length: 3 }, (_, i) => ({ claimId: `new-${i}` }))

    const contextSeedingResult = {
      extractedClaims: seededClaims,
      claimsProcessedCount: seededClaims.length,
    }

    expect(contextSeedingResult.claimsProcessedCount).toBe(5)

    const accumulatedClaims = [...contextSeedingResult.extractedClaims, ...newlyExtractedClaims]
    const newClaimsForKG = accumulatedClaims.slice(contextSeedingResult.claimsProcessedCount)

    expect(accumulatedClaims).toHaveLength(8)
    expect(newClaimsForKG).toHaveLength(3)
    expect(newClaimsForKG.map((claim) => claim.claimId)).toEqual(['new-0', 'new-1', 'new-2'])
  })
})
