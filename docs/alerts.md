# LifeOS Calendar Alerts (Phase 2.5)

This document describes the in-app alert system for calendar events.

## Overview

LifeOS provides a **best-effort, in-app alert system** that notifies users when calendar events are about to start. Alerts appear as banners at the top of the page when the app is open.

### Key Characteristics

- **Best-effort delivery**: Alerts only fire while the app is open in the foreground
- **In-app only**: No push notifications or background delivery (yet)
- **Canonical storage**: Alert settings sync across devices via canonical event data
- **Dismissal syncing**: Dismissed alerts stay dismissed across sessions and devices

## Alert Configuration

### Preset Options

Users can configure alerts with the following presets:

| Option | Minutes Before |
|--------|----------------|
| None | — |
| At time of event | 0 |
| 5 minutes before | 5 |
| 10 minutes before | 10 |
| 15 minutes before | 15 |
| 30 minutes before | 30 |
| 1 hour before | 60 |
| Custom | User-defined |

### Limitations

- **All-day events**: Alerts are not supported for all-day events. This is because the "start time" of an all-day event is ambiguous (midnight in which timezone?). Future versions may add support for configuring a specific alert time for all-day events.

## Data Model

### CanonicalAlert

```typescript
type CanonicalAlertMethod = 'in_app_banner';

interface CanonicalAlert {
  method: CanonicalAlertMethod;
  minutesBefore: number;
  enabled: boolean;
}
```

### Event Fields

The following fields are added to `CanonicalCalendarEvent`:

```typescript
{
  alerts?: CanonicalAlert[];           // Alert configurations
  alertsUpdatedAtMs?: number;          // When alerts were last modified
  alertDismissal?: {
    dismissedUntilMs?: number;         // Dismiss until this time (usually startMs)
    dismissedAtMs?: number;            // When dismissal occurred
  };
}
```

## Alert Delivery

### Alert Scheduler

The alert scheduler (`apps/web-vite/src/alerts/alertScheduler.ts`) runs in the foreground and:

1. Watches events in a 24-hour window
2. Computes fire times for enabled alerts
3. Sets JavaScript timers to fire alerts
4. Recomputes when:
   - Events change
   - Alert settings change
   - Browser tab gains focus/visibility

### Banner Behavior

When an alert fires, a banner appears at the top of the page showing:

- Event title
- Start time
- Countdown ("Starts in X minutes")
- "Open" button to view event details
- "X" dismiss button

Banners automatically hide when:
- User clicks dismiss
- User opens the event
- Event start time is reached

### Dismissal Logic

When a user dismisses an alert:

1. The banner is immediately hidden
2. `alertDismissal.dismissedUntilMs` is set to `event.startMs`
3. The dismissal is persisted to Firestore via the outbox
4. The alert won't reappear on refresh or other devices until after the event starts

## Best-Effort Disclaimer

**Important**: Alerts are best-effort and only work while the app is open.

This means:
- If the browser tab is closed or in the background, alerts won't fire
- Browser throttling may delay alerts in inactive tabs
- No notifications will appear if the app isn't running

The UI shows a hint: "💡 Alerts only work while the app is open"

## Technical Details

### Alert Fire Logic

An alert should fire when:

```typescript
function shouldAlertFire(event, alert, nowMs) {
  // Don't fire for deleted/cancelled events
  if (isDeleted(event) || event.status === 'cancelled') return false;
  
  // Compute fire time
  const fireTimeMs = event.startMs - (alert.minutesBefore * 60 * 1000);
  
  // Must be after fire time
  if (nowMs < fireTimeMs) return false;
  
  // Must be before event start
  if (nowMs >= event.startMs) return false;
  
  // Must not be dismissed
  if (event.alertDismissal?.dismissedUntilMs > nowMs) return false;
  
  return true;
}
```

### Google-Synced Events

Alerts work with Google-synced events because:

1. The UI reads from canonical data (not raw Google data)
2. The scheduler reads canonical events
3. Alert settings are stored in canonical fields
4. Google's own notification system is ignored (LifeOS alerts are independent)

## Future Enhancements

Potential future improvements:

- [ ] Push notifications (requires service worker)
- [ ] Email alerts
- [ ] Multiple alerts per event
- [ ] All-day event alerts with configurable time
- [ ] Sound/vibration options
- [ ] Snooze functionality
- [ ] Calendar-level default alerts

## Testing

### Unit Tests

Alert helpers are tested in `packages/calendar/src/domain/__tests__/models.test.ts`:

- `getPrimaryAlert` - Finding primary alert
- `computeAlertFireTimeMs` - Fire time calculation
- `isAlertDismissed` - Dismissal logic
- `shouldAlertFire` - Complete fire decision
- `describeAlert` - Human-readable descriptions

### Manual Test Checklist

1. **Create event with alert**
   - Create a timed event starting in 15 minutes
   - Set alert = 10 minutes before
   - ✅ Banner appears at the right time while app is open

2. **Dismiss alert**
   - Click X dismiss
   - ✅ Banner disappears immediately
   - ✅ Does not reappear on refresh before start time

3. **Auto-hide on start**
   - Wait until event start time
   - ✅ Banner is not shown anymore

4. **Cross-device sync**
   - Open same account in another browser/profile
   - ✅ Alert settings match (canonical sync)

5. **Google-synced events**
   - Pick a Google event starting soon
   - Set alert in LifeOS
   - ✅ Banner triggers based on canonical data





