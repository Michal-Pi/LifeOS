export interface BusyBlock {
  startMs: number
  endMs: number
}

export interface AttendeeAvailability {
  email: string
  busy: BusyBlock[]
  error?: string
}

/**
 * Simple conflict check helper
 */
export function checkConflicts(
  proposedStartMs: number,
  proposedEndMs: number,
  attendees: AttendeeAvailability[]
): { hasConflict: boolean; conflictingAttendees: string[] } {
  const conflicting = attendees.filter((attendee) =>
    attendee.busy.some((block) => proposedStartMs < block.endMs && proposedEndMs > block.startMs)
  )

  return {
    hasConflict: conflicting.length > 0,
    conflictingAttendees: conflicting.map((a) => a.email),
  }
}
