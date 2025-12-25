import type { CalendarAccount } from '../domain/models'

export interface AccountRepository {
  listAccounts(userId: string): Promise<CalendarAccount[]>
  getAccount(userId: string, accountId: string): Promise<CalendarAccount | null>
}





