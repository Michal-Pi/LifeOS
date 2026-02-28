// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./rrule.d.ts" />
import rruleModule from 'rrule/dist/es5/rrule.js'

const { RRule, Weekday } = rruleModule as {
  RRule?: typeof import('rrule').RRule
  Weekday?: typeof import('rrule').Weekday
}

if (!RRule || !Weekday) {
  throw new Error('rrule CJS exports are unavailable')
}

export const RRuleExport: typeof import('rrule').RRule = RRule
export const WeekdayExport: typeof import('rrule').Weekday = Weekday

export { RRuleExport as RRule, WeekdayExport as Weekday }
