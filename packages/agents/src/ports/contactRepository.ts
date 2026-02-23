import type {
  Contact,
  ContactId,
  CreateContactInput,
  UpdateContactInput,
  DunbarCircle,
  Interaction,
  InteractionId,
  CreateInteractionInput,
  InteractionType,
} from '../domain/contacts'

export interface ContactRepository {
  create(userId: string, input: CreateContactInput): Promise<Contact>
  update(userId: string, contactId: ContactId, updates: UpdateContactInput): Promise<Contact>
  get(userId: string, contactId: ContactId): Promise<Contact | null>
  list(
    userId: string,
    options?: {
      circle?: DunbarCircle
      starred?: boolean
      archived?: boolean
      search?: string
      limit?: number
      orderBy?: 'lastInteractionMs' | 'nextFollowUpMs' | 'displayName' | 'createdAtMs'
    }
  ): Promise<Contact[]>
  delete(userId: string, contactId: ContactId): Promise<void>
  findByEmail(userId: string, email: string): Promise<Contact | null>
  getFollowUpDue(userId: string, beforeMs: number, limit?: number): Promise<Contact[]>
}

export interface InteractionRepository {
  create(userId: string, input: CreateInteractionInput): Promise<Interaction>
  list(
    userId: string,
    contactId: ContactId,
    options?: {
      limit?: number
      type?: InteractionType
    }
  ): Promise<Interaction[]>
  delete(userId: string, contactId: ContactId, interactionId: InteractionId): Promise<void>
}
