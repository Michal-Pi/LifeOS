import type { Message, MessageId, CreateMessageInput, RunId } from '../domain/models'

export interface MessageRepository {
  create(input: CreateMessageInput): Promise<Message>
  get(messageId: MessageId): Promise<Message | null>
  listByRun(runId: RunId, options?: { limit?: number }): Promise<Message[]>
  delete(messageId: MessageId): Promise<void>
}
