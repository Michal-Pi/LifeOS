import type {
  Section,
  SectionId,
  SectionFilters,
  CreateSectionInput,
  UpdateSectionInput,
} from '../domain/models'

/**
 * Repository interface for Section persistence
 * Implementations: Firestore, IndexedDB
 */
export interface SectionRepository {
  /**
   * Create a new section
   */
  create(userId: string, input: CreateSectionInput): Promise<Section>

  /**
   * Update an existing section
   */
  update(userId: string, sectionId: SectionId, updates: UpdateSectionInput): Promise<Section>

  /**
   * Delete a section
   */
  delete(userId: string, sectionId: SectionId): Promise<void>

  /**
   * Get a single section by ID
   */
  get(userId: string, sectionId: SectionId): Promise<Section | null>

  /**
   * List sections with optional filters
   */
  list(userId: string, filters?: SectionFilters): Promise<Section[]>

  /**
   * Reorder sections (update order property for multiple sections)
   */
  reorder(userId: string, sectionOrders: { sectionId: SectionId; order: number }[]): Promise<void>
}
