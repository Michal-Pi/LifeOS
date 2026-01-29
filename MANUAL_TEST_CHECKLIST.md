# Manual Test Checklist

## Test Date: **\*\***\_\_\_**\*\***

## Tester: **\*\***\_\_\_**\*\***

---

## 1. Calendar Time Display (Today Page)

### Test 1.1: 24-Hour Format Display

- [ ] Navigate to Today page (`/today`)
- [ ] Verify calendar events display times in 24-hour format (e.g., "08:15 - 08:45" instead of "8:15 AM - 8:45 AM")
- [ ] Verify all times fit on a single line without wrapping
- [ ] Check events at various times:
  - [ ] Morning times (08:00-11:59)
  - [ ] Afternoon times (12:00-17:59)
  - [ ] Evening times (18:00-23:59)
  - [ ] Single-digit hours (08:00, 09:00)

### Test 1.2: Time Display Consistency

- [ ] Verify all calendar event times are consistently formatted
- [ ] Verify no text overflow or wrapping occurs
- [ ] Check with events that have long titles to ensure time column remains stable

---

## 2. Workout Data Loading

### Test 2.1: Workout Permission Error Handling

- [ ] Navigate to Training/Workout page
- [ ] Verify no "Failed to load workout data: FirebaseError: Missing or insufficient permissions" errors appear in console
- [ ] If user has no workout plans, verify page loads gracefully without errors
- [ ] Verify workout data loads successfully if permissions are available
- [ ] Verify workout data falls back to local data if Firestore permissions are insufficient

### Test 2.2: Workout Template Loading

- [ ] Navigate to Workout Templates page
- [ ] Verify templates load without permission errors
- [ ] Verify templates fall back to local data if Firestore permissions are insufficient
- [ ] Check console for any error messages

---

## 3. Workspace Modal Size

### Test 3.1: Modal Width

- [ ] Navigate to Workspaces page (`/workspaces`)
- [ ] Click "Create Workspace" button
- [ ] Verify modal is twice as wide as before (should be noticeably wider)
- [ ] Verify modal is responsive and doesn't overflow on smaller screens

### Test 3.2: Input Field Widths

- [ ] In the Create Workspace modal, verify all text input fields are twice as wide:
  - [ ] Workspace Name input
  - [ ] Description textarea
  - [ ] All council model inputs (Model ID, Model name, System prompt)
  - [ ] Chairman model inputs (Model ID, Model name, System prompt)
  - [ ] All other text inputs in the form
- [ ] Verify inputs are properly aligned and don't overlap
- [ ] Verify form is still usable and readable

---

## 4. Expert Council Models - Connected Providers

### Test 4.1: Default Provider Selection

**Prerequisites:** Ensure you have at least one LLM provider connected in Settings

- [ ] Navigate to Settings page (`/settings`)
- [ ] Note which providers are connected (OpenAI, Anthropic, Google, xAI)
- [ ] Navigate to Workspaces page
- [ ] Click "Create Workspace"
- [ ] Select "Expert Council" execution mode
- [ ] Verify council models default to the first connected provider (not hardcoded OpenAI)
- [ ] Verify chairman model defaults to the first connected provider
- [ ] Verify default model names match the provider:
  - [ ] OpenAI → "gpt-4"
  - [ ] Anthropic → "claude-3-5-sonnet-20241022"
  - [ ] Google → "gemini-pro"
  - [ ] xAI → "grok-beta"

### Test 4.2: Provider Dropdown Filtering

- [ ] In Expert Council Settings section, verify provider dropdowns only show connected providers:
  - [ ] Council Model provider dropdowns
  - [ ] Chairman Model provider dropdown
- [ ] Verify disconnected providers do NOT appear in dropdowns
- [ ] Test with different provider combinations:
  - [ ] Only OpenAI connected
  - [ ] OpenAI + Anthropic connected
  - [ ] All providers connected
  - [ ] No providers connected (should show OpenAI as fallback)

### Test 4.3: Adding Council Models

- [ ] In Create Workspace modal with Expert Council enabled
- [ ] Click "+ Add Council Model" button
- [ ] Verify new council model is added to the list
- [ ] Verify new model defaults to first connected provider
- [ ] Verify new model has unique Model ID (council-1, council-2, etc.)
- [ ] Add multiple models and verify each gets added correctly
- [ ] Verify you can add models up to the maximum council size limit

### Test 4.4: Removing Council Models

- [ ] In Create Workspace modal with Expert Council enabled
- [ ] Ensure at least 2 council models exist
- [ ] Click "Remove model" button on any council model
- [ ] Verify the model is removed from the list
- [ ] Verify remaining models are still properly displayed
- [ ] Verify you cannot remove models below the minimum council size (should show validation error)
- [ ] Test removing multiple models in sequence

### Test 4.5: Council Model Configuration

- [ ] Verify you can edit each council model:
  - [ ] Change Model ID
  - [ ] Change Provider (only connected providers available)
  - [ ] Change Model name
  - [ ] Change Temperature
  - [ ] Change Max tokens
  - [ ] Change System prompt
- [ ] Verify changes persist when adding/removing other models
- [ ] Verify validation works correctly (e.g., min/max council size)

---

## 5. Workspace Creation from Templates

### Test 5.1: Instantiate Workspace from Template

- [ ] Navigate to Workspaces page
- [ ] Click on a workspace template preset (e.g., "Research Assistant", "Content Creator")
- [ ] Verify workspace is created successfully without errors
- [ ] Verify no "Unsupported field value: undefined" errors appear
- [ ] Verify workspace appears in the workspaces list
- [ ] Click on the newly created workspace to verify it opens correctly

### Test 5.2: Workspace with Expert Council Template

- [ ] Create a workspace from a template that uses Expert Council
- [ ] Verify council models are properly configured
- [ ] Verify chairman model is properly configured
- [ ] Verify all models use connected providers (not hardcoded)
- [ ] Verify workspace saves without errors

---

## 6. Workspace Undefined Values Fix

### Test 6.1: Create Workspace with Optional Fields

- [ ] Create a new workspace manually (not from template)
- [ ] Leave optional fields empty (workflowGraph, etc.)
- [ ] Verify workspace saves successfully
- [ ] Verify no "Unsupported field value: undefined" errors
- [ ] Verify workspace can be edited and saved again

### Test 6.2: Edit Existing Workspace

- [ ] Open an existing workspace for editing
- [ ] Make changes to various fields
- [ ] Save the workspace
- [ ] Verify no undefined value errors occur
- [ ] Verify changes are saved correctly

---

## 7. Task List Separator

### Test 7.1: Separator Display

- [ ] Navigate to Planner page (`/planner`)
- [ ] Switch to List view
- [ ] Verify only ONE "Later" separator appears in the list
- [ ] Verify separator appears between "this_week" tasks and "later" tasks
- [ ] Verify NO thick borders appear (only the text separator with lines)
- [ ] Verify separator has proper spacing and styling (----- Later ----- style)

### Test 7.2: Separator Positioning

- [ ] Verify separator appears at the correct location (after last "this_week" task, before first "later" task)
- [ ] Verify separator does NOT appear:
  - [ ] After "today" tasks (when next task is "next_3_days" or "this_week")
  - [ ] Multiple times in the list
- [ ] Test with different task urgency combinations

---

## 8. Priority View Badge Position

### Test 8.1: Badge Location

- [ ] Navigate to Planner page
- [ ] Switch to Priority view
- [ ] Verify badges (project/domain) appear at the BOTTOM of each task card with other meta tags
- [ ] Verify badges do NOT appear at the top-right corner
- [ ] Verify task title uses full width (no padding-right for badge)

### Test 8.2: Badge Display

- [ ] Verify badges display correctly:
  - [ ] Project badges (if task has project)
  - [ ] Domain badges (if task has no project)
- [ ] Verify badges appear alongside other meta tags (Due date, Importance, Time estimate)
- [ ] Verify long task titles don't overflow or overlap badges

---

## 9. Task List Pagination

### Test 9.1: Pagination Display

- [ ] Navigate to Planner List view
- [ ] If you have more than 20 tasks, verify pagination controls appear at bottom
- [ ] Verify pagination shows: "Page X of Y (Z tasks)"
- [ ] Verify Previous/Next buttons are present
- [ ] Verify Previous button is disabled on page 1
- [ ] Verify Next button is disabled on last page

### Test 9.2: Pagination Functionality

- [ ] Click "Next" button to go to next page
- [ ] Verify next 20 tasks are displayed
- [ ] Click "Previous" button to go back
- [ ] Verify previous tasks are displayed
- [ ] Verify page number updates correctly
- [ ] Test navigating through multiple pages

### Test 9.3: Container Height

- [ ] Verify task list container resizes dynamically:
  - [ ] Shows full height for up to 20 rows
  - [ ] Minimum height of 400px
  - [ ] Maximum height based on visible rows (up to 20 rows)
- [ ] Verify container doesn't overflow or cause scrolling issues

---

## 10. Integration Tests

### Test 10.1: Full Workflow - Create Workspace with Expert Council

- [ ] Navigate to Workspaces page
- [ ] Click "Create Workspace"
- [ ] Fill in workspace name and description
- [ ] Select agents
- [ ] Select "Expert Council" execution mode
- [ ] Verify council models default to connected providers
- [ ] Add additional council models
- [ ] Remove a council model
- [ ] Configure chairman model
- [ ] Save workspace
- [ ] Verify workspace is created successfully
- [ ] Verify no errors in console

### Test 10.2: Full Workflow - Edit Workspace

- [ ] Open an existing workspace for editing
- [ ] Make changes to council models (add, remove, modify)
- [ ] Change providers
- [ ] Save workspace
- [ ] Verify changes are saved
- [ ] Verify workspace still works correctly

---

## Notes

- **Browser Console:** Keep browser console open during all tests to catch any errors
- **Network Tab:** Monitor network requests for any failed API calls
- **Responsive Testing:** Test on different screen sizes if possible
- **Provider Setup:** Ensure you have at least one LLM provider connected for Expert Council tests

---

## Test Results Summary

**Total Tests:** **\_**  
**Passed:** **\_**  
**Failed:** **\_**  
**Blocked:** **\_**

**Critical Issues Found:**

1. ***
2. ***
3. ***

**Minor Issues Found:**

1. ***
2. ***

**Additional Notes:**

---

---

---
