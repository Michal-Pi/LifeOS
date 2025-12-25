/// <reference path="./rrule.d.ts" />
// Use the ES5 UMD build which works reliably in both ESM and CJS contexts
import rruleModule from 'rrule/dist/es5/rrule.js'

const { RRule, Weekday } = rruleModule as {
  RRule: typeof import('rrule').RRule
  Weekday: typeof import('rrule').Weekday
}

export { RRule, Weekday }
