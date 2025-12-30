import type { RunEventWriter } from './runEvents.js'

export type StreamContext = {
  eventWriter: RunEventWriter
  agentId: string
  agentName: string
  step?: number
}
