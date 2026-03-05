import type { StoredConcept, ConceptId } from '../domain/dialectical'

/**
 * Repository interface for the concept library (Phase 29).
 * Follows the standard CRUD pattern used by other ports in the project.
 */
export interface ConceptRepository {
  /** Create or update a concept. Returns the persisted entity. */
  upsertConcept(userId: string, concept: StoredConcept): Promise<StoredConcept>

  /** Get a single concept by ID. Returns null if not found. */
  getConcept(userId: string, conceptId: ConceptId): Promise<StoredConcept | null>

  /** Get multiple concepts by IDs. Returns only found entries. */
  getConcepts(userId: string, conceptIds: ConceptId[]): Promise<StoredConcept[]>

  /** Find concepts matching any of the given tags (OR semantics). */
  findByTags(userId: string, tags: string[]): Promise<StoredConcept[]>

  /** List all concepts for a user with optional filters. */
  listConcepts(
    userId: string,
    options?: { limit?: number; sourceRunId?: string }
  ): Promise<StoredConcept[]>

  /** Delete a concept by ID. */
  deleteConcept(userId: string, conceptId: ConceptId): Promise<void>
}
