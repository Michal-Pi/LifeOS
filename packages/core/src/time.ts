export type ISODateTime = string & { readonly __isoDateTime: unique symbol }

export interface Clock {
  now(): Date
  toISOString(date: Date): ISODateTime
}

export class SystemClock implements Clock {
  now() {
    return new Date()
  }

  toISOString(date: Date): ISODateTime {
    return date.toISOString() as ISODateTime
  }
}

export function formatFriendlyTime(date: Date) {
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms))
}
