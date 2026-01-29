# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Pure offline-first architecture implementation across the entire application
- Comprehensive network error handling with automatic fallback to local data
- Deprecated `isOnline()` function with clear JSDoc warnings for UI-only usage
- Documentation for offline-first architecture patterns and migration plan
- Comparison of Notion vs Hybrid offline patterns
- Comprehensive expert council and AI agent framework documentation
- Manual test checklist for offline-first behavior

### Changed

- **Breaking**: Removed all online status checks before operations and sync attempts
- All write operations now always save locally and queue for sync immediately
- All sync workers now always attempt sync regardless of online status
- All Firestore read operations now always attempt remote fetch with local fallback
- Training repository read operations now handle network errors gracefully
- Improved error messages for network-related issues

### Removed

- Online status checks from `useTodoOperations.ts` (7 locations)
- Online status checks from sync workers (6 locations across 4 files)
- Online status checks from training repository read operations (15 locations across 4 files)
- `isOnline()` function from `training/syncWorker.ts`
- Unused `isOnline` imports from training repositories

### Fixed

- App now works seamlessly offline without special handling
- Sync attempts no longer blocked by unreliable `navigator.onLine` status
- Network errors properly caught and handled with local data fallback
- Consistent behavior between online and offline states

## [Previous Version] - 2026-01-26

### Summary of Recent Changes

- Calendar event sync improvements
- Workout session error handling
- Task list rendering fixes
- Priority view badge positioning
- Calendar time display improvements
- Workspace creation undefined field handling
- Modal sizing adjustments
- Expert council model defaults
- Firestore lease error suppression

---

## Migration Notes for v2.0 (Offline-First)

### For Developers

**Before Deploying**:

1. Review the [Offline-First Migration Plan](docs/Offline-First_Architecture_Migration_Plan.md)
2. Test thoroughly using the [Manual Test Checklist](MANUAL_TEST_CHECKLIST.md)
3. Monitor Firestore read requests (expected increase)
4. Monitor network error patterns in logs
5. Verify outbox draining works correctly

**Architecture Changes**:

- The app now follows a pure offline-first model
- Network status is used ONLY for UI indicators
- All operations save locally first, then sync in background
- Network errors are caught and handled gracefully
- Automatic retries via outbox system

**Testing**:

- Test with airplane mode on/off
- Test with slow/flaky connections
- Verify sync indicators work correctly
- Confirm no console errors when offline
- Validate data consistency after offline→online transition

### For Users

**What's New**:

- ✨ Instant feedback for all operations (no waiting for network)
- 🚀 Works perfectly offline without any special handling
- 🔄 Automatic sync when connection is restored
- 💪 More reliable - doesn't depend on network status checks
- 🎯 Seamless transitions between online and offline

**What to Expect**:

- All changes save instantly to your device
- Sync happens automatically in the background
- No more "waiting for connection" messages
- App works the same whether online or offline

---

**Full Migration Details**: See [docs/OFFLINE_FIRST_MIGRATION_SUMMARY.md](docs/OFFLINE_FIRST_MIGRATION_SUMMARY.md)
