# Todos UI Notes

## Hierarchy Navigation

- Sidebar shows projects and milestones.
- Selecting a project or milestone filters the task list.
- Project/Milestone objectives and key results render above the task list.

## Task Editing

- Urgency slider is disabled when a due date exists (auto-inferred).
- Importance slider maps to 1/2/4/7/10 with labeled descriptors.
- Domain is inherited from project when linked.
- Estimated time is captured in hours/minutes.
- The Frog highlights the highest priority active task in Today.

## Scheduling

- "Schedule on Calendar" opens the event form.
- Default duration uses the task’s estimated time (fallback 60 minutes).
- Created events are linked via `calendarEventIds`.

## Priority Buckets

Priority view groups tasks into:

- Urgent / Overdue
- Next 3 Days
- This Week
- This Month
- Specific Deadline (dated > 30 days)
- Parking Lot (no due date)
