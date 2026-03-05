import type { StoredConcept } from '../domain/dialectical'

/**
 * Repository interface for the concept library (Phase 29)
 */
export interface ConceptRepository {
  findByTags(userId: string, tags: string[]): Promise<StoredConcept[]>
  upsertConcept(userId: string, concept: StoredConcept): Promise<void>
  getConcepts(userId: string, conceptIds: string[]): Promise<StoredConcept[]>
}
