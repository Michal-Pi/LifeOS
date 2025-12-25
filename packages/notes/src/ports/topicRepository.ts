import type {
  Topic,
  TopicId,
  TopicFilters,
  CreateTopicInput,
  UpdateTopicInput,
} from '../domain/models'

/**
 * Repository interface for Topic persistence
 * Implementations: Firestore, IndexedDB
 */
export interface TopicRepository {
  /**
   * Create a new topic
   */
  create(userId: string, input: CreateTopicInput): Promise<Topic>

  /**
   * Update an existing topic
   */
  update(userId: string, topicId: TopicId, updates: UpdateTopicInput): Promise<Topic>

  /**
   * Delete a topic
   */
  delete(userId: string, topicId: TopicId): Promise<void>

  /**
   * Get a single topic by ID
   */
  get(userId: string, topicId: TopicId): Promise<Topic | null>

  /**
   * List topics with optional filters
   */
  list(userId: string, filters?: TopicFilters): Promise<Topic[]>

  /**
   * Reorder topics (update order property for multiple topics)
   */
  reorder(userId: string, topicOrders: { topicId: TopicId; order: number }[]): Promise<void>
}
