# Visual Graph Editor Improvement Plan

> Generated: 2026-02-27 | Based on: Codebase audit, UI screenshots, market comparison (n8n, Make, LangGraph Studio, Retool, ComfyUI, Rivet)

---

## Current State Assessment

### What You Have

- **React Flow** (`@xyflow/react`) canvas with pan/zoom and grid background
- **BFS auto-layout** — left-to-right, grid-snapped, nodes NOT draggable
- **Sidebar palette** (`BuilderNodePalette`) — select a node, then click sidebar to add/delete/edit
- **Modal-based properties** (`NodePropertiesModal`) — double-click or "Edit Properties" opens a full modal, blocking the canvas
- **6 node types** — agent, tool, human_input, join, end, research_request; color-coded
- **4 edge condition types** — always, equals, contains, regex
- **Parallel split** (2-6 branches with auto-join) and **conditional branching** via reducer actions
- **Keyboard shortcuts** — Delete/Backspace to remove, Escape to deselect
- **Execution visualization** (`InteractiveWorkflowGraph`) — status emoji on nodes, edge highlighting
- **Docs modal** (`WorkflowGraphDocsModal`) — built-in reference with 3 copyable examples
- **Pure reducer state management** — clean, predictable, testable

### What's Missing (vs. Market)

- No MiniMap
- No edge arrowheads
- No undo/redo
- No copy/paste nodes
- No multi-select
- No drag-to-reposition nodes
- No "+" button on node outputs (n8n's killer feature)
- No slide-in panel (properties open as blocking modal)
- No inline content on nodes (just label + type badge)
- No node grouping or subgraphs
- No streaming output on running nodes
- No token/cost display per node
- No breakpoints/interrupts
- No node bypass/mute for testing

### Screenshots Reviewed (017)

From the full-page capture of the workflow builder:

- The canvas is very sparse — nodes are small rectangles with minimal info
- Large amounts of white space around nodes
- Sidebar palette is functional but requires "select first, then act" pattern
- No visual indication of data flow direction (no arrowheads)
- Nodes show only a label and colored border — no model, no agent name, no prompt preview
- The builder feels more like a diagram viewer than an interactive editor

---

## Competitive Landscape Summary

| Pattern           | LifeOS Current              | n8n                         | Make                      | LangGraph Studio      | ComfyUI                    | Rivet                        |
| ----------------- | --------------------------- | --------------------------- | ------------------------- | --------------------- | -------------------------- | ---------------------------- |
| **Node config**   | Modal (blocks canvas)       | Side panel (canvas visible) | Overlay panel             | Code-defined          | Inline on node             | Inline on node               |
| **Add nodes**     | Select node → click sidebar | "+" on output handle        | Click "+" between modules | Code                  | Drag from palette          | Drag from palette            |
| **Layout**        | BFS grid, fixed             | Free-form draggable         | Radial/chain              | Code-defined          | Free-form                  | Free-form                    |
| **Node content**  | Label only                  | Label + icon + status       | Circle + icon             | Label + status        | Full inline widgets        | Prompt editor + model picker |
| **Execution viz** | Emoji badges                | Animated borders + count    | Red glow + error paths    | State diff + timeline | Green sweep + progress bar | Inline output + tokens       |
| **Branching**     | Via sidebar action          | IF/Switch nodes             | Router + edge filters     | Conditional edges     | N/A                        | If/Else + Match nodes        |
| **Loops**         | Back-edge detection only    | Loop node + visual          | Iterator/Aggregator       | Cycles in graph       | N/A                        | Loop controller              |
| **Complexity**    | None                        | Sticky notes                | Scenarios                 | Subgraphs             | Groups + reroute           | Subgraphs                    |
| **Undo/Redo**     | None                        | Full history                | Full history              | N/A                   | Full history               | Full history                 |
| **Multi-select**  | None                        | Shift+click, box select     | Click+drag                | N/A                   | Box select                 | Box select                   |

---

## Improvement Plan

### Phase 1: Foundation Polish (Quick Wins)

Low-effort changes using React Flow built-in features that immediately improve usability.

#### 1.1 Add MiniMap

**What:** Add `<MiniMap>` component to both `CustomWorkflowBuilder` and `InteractiveWorkflowGraph`.

**Why:** For graphs with 8+ nodes, users lose spatial orientation when zoomed in. Every competitive editor has this. React Flow provides it out of the box.

**Implementation:**

```tsx
import { MiniMap } from '@xyflow/react'
;<MiniMap
  nodeColor={(node) => NODE_TYPE_COLORS[node.data.nodeType]?.border}
  maskColor="rgba(0,0,0,0.15)"
  pannable
  zoomable
  style={{ bottom: 12, right: 12, width: 160, height: 100 }}
/>
```

**Effort:** ~15 min | **Impact:** High for orientation in complex graphs

---

#### 1.2 Add Edge Arrowheads

**What:** Add directional arrow markers to all edges.

**Why:** Currently there's no visual indication of data flow direction. For conditional branches and back-edges this is critical.

**Implementation:** Add `markerEnd={{ type: MarkerType.ArrowClosed, color: edgeColor }}` to edge definitions in both builder and visualization components.

**Effort:** ~15 min | **Impact:** High for graph readability

---

#### 1.3 Enable Multi-Select

**What:** Enable box-selection (`selectionOnDrag`) and Shift+Click multi-select. Wire up `onSelectionChange` to track selected nodes.

**Why:** Users currently can only operate on one node at a time. Bulk delete, bulk move, and future grouping all require multi-select.

**Implementation:**

```tsx
<ReactFlow
  selectionOnDrag
  multiSelectionKeyCode="Shift"
  onSelectionChange={({ nodes }) => setSelectedNodeIds(nodes.map((n) => n.id))}
/>
```

**Effort:** ~1 hour (including bulk delete handler) | **Impact:** Medium — enables future features

---

#### 1.4 Richer Node Content (Inline Preview)

**What:** Expand `BuilderCustomNode` to show more than just a label. Display:

- Agent name and model (e.g., "Research Analyst — gpt-5-mini")
- First ~60 chars of system prompt or custom prompt
- Output key (if set)
- For join nodes: aggregation mode badge

**Why:** Currently nodes are near-empty rectangles. Users have to double-click each one to remember what it does. n8n, ComfyUI, and Rivet all show key info directly on the node face.

**Implementation:** Increase node dimensions from 220x80 to ~260x120 and render 2-3 lines of content below the label.

**Effort:** ~2 hours | **Impact:** Very high — single biggest readability improvement

---

#### 1.5 Node Toolbar (Floating Actions)

**What:** Replace the sidebar "Actions" section with React Flow's `<NodeToolbar>` — a floating bar that appears above the selected node.

**Why:** The current pattern (select node → look at sidebar → click action) is indirect. A floating toolbar puts actions where the user's eyes already are: on the selected node.

**Implementation:**

```tsx
import { NodeToolbar, Position } from '@xyflow/react'

// Inside BuilderCustomNode:
;<NodeToolbar position={Position.Top} isVisible={data.selected}>
  <button onClick={onAddAfter}>+ Add</button>
  <button onClick={onEdit}>Edit</button>
  <button onClick={onDuplicate}>Copy</button>
  <button onClick={onDelete}>Delete</button>
</NodeToolbar>
```

**Effort:** ~2 hours | **Impact:** High — reduces cognitive distance for every action

---

### Phase 2: Core UX Improvements

Medium-effort changes that transform the editing experience.

#### 2.1 "+" Button on Node Outputs (n8n Pattern)

**What:** Add a "+" button on each node's right-side (source) handle. Clicking it opens a quick-add dropdown menu positioned at the handle location, listing node types and available agents. Selecting one auto-creates the node and connection.

**Why:** This is n8n's signature UX innovation and the single biggest difference between "workflow building feels tedious" and "workflow building flows naturally." Currently your users must: select node → find sidebar → click add button → configure. With "+": click "+" → pick type → done.

**Implementation:**

- Add a "+" overlay button next to each source `Handle` in `BuilderCustomNode`
- On click, render a positioned dropdown (or use React Flow's `NodeToolbar` on a pseudo-handle)
- Dropdown lists: Agent (with agent sub-menu), Tool, Human Input, Join, End, Research, Parallel Split, Conditional
- On selection, dispatch `ADD_NODE_AFTER` or `ADD_AGENT_NODE_AFTER` with auto-connection

**Also: Drag-from-handle-to-empty-space** — use `onConnectEnd` to detect drops in empty space and trigger the same quick-add menu at the drop position.

**Effort:** ~6 hours | **Impact:** Transformative — changes the fundamental editing feel

---

#### 2.2 Replace Modal with Slide-In Panel

**What:** Replace `NodePropertiesModal` with a right-side slide-in panel that overlays ~40% of the canvas. The graph remains visible and interactive while properties are open.

**Why:** The current modal completely blocks the canvas. Users can't see the graph context while editing a node — they can't check what's upstream/downstream, can't see the overall structure, can't click another node to compare. Every major workflow editor (n8n, Retool, LangGraph Studio) uses a side panel instead.

**Implementation:**

- Convert `NodePropertiesModal` to a `NodePropertiesPanel` component
- Position: absolute right, 380-420px wide, full height of canvas area
- Slide-in animation (200ms ease-out)
- Keep the same content (agent selector, prompt editor, edge config)
- Add tabs: Properties | Input (last run) | Output (last run)
- Close on Escape or clicking the canvas (not just a "Done" button)
- React Flow auto-adjusts viewport when panel opens (add right padding)

**Effort:** ~8 hours | **Impact:** Transformative — context preservation during editing

---

#### 2.3 Undo/Redo

**What:** Add an action history stack to `customWorkflowBuilderReducer`. Track state snapshots (or action-based undo) and support Ctrl+Z / Ctrl+Shift+Z.

**Why:** Users currently cannot undo mistakes. Deleting the wrong node, adding a wrong connection, or splitting incorrectly requires rebuilding from scratch. Every competitive editor has undo/redo. This is table stakes.

**Implementation approach — snapshot-based (simpler):**

```typescript
// In CustomWorkflowBuilder:
const [history, setHistory] = useState<BuilderState[]>([])
const [historyIndex, setHistoryIndex] = useState(0)

// After each dispatch, push state to history
// Ctrl+Z → setHistoryIndex(i - 1), restore history[i-1]
// Ctrl+Shift+Z → setHistoryIndex(i + 1), restore history[i+1]
// Max history: 50 snapshots
```

Show undo/redo buttons in the toolbar header with disabled state when at stack boundaries.

**Effort:** ~4 hours | **Impact:** High — essential safety net for editing

---

#### 2.4 Enable Draggable Nodes (Hybrid Layout)

**What:** Change `nodesDraggable` from `false` to `true`. Keep the BFS auto-layout as the default, but let users manually reposition nodes after auto-layout. Add a "Re-Layout" button to snap everything back to the computed grid.

**Why:** The fixed layout works for simple graphs but becomes frustrating for complex ones. Users may want to move a frequently-edited node closer, spread out a crowded area, or align nodes for visual clarity. n8n, ComfyUI, and Rivet all allow free positioning.

**Implementation:**

- Set `nodesDraggable={true}` on `<ReactFlow>`
- On drag end (`onNodeDragStop`), update the node's position in state
- Add a "Auto-Layout" button in the header toolbar that re-runs `computeLayout()` and snaps all nodes back to grid positions (with smooth animation)
- Mark manually-positioned nodes so auto-layout doesn't override them (optional: "pin" concept)

**Effort:** ~3 hours | **Impact:** Medium-high — flexibility without losing auto-layout convenience

---

#### 2.5 Better Edge Visualization & Inline Condition Labels

**What:** Improve edge rendering:

- Show condition type as a colored badge on conditional edges (green for "always", yellow for "equals/contains", red for "regex")
- Make condition labels clickable — clicking opens a small inline popover to edit the condition (key, value) without opening the full properties modal
- Animate edges differently during execution: flowing dots for active edges, solid green for completed, dashed red for failed paths
- Show back-edges (loops) with a distinctive curved-back arrow and iteration count

**Why:** Currently edges are plain lines with small labels. Conditions are hard to read and require opening the properties modal to edit. Make puts filters directly on edges, which is much more intuitive.

**Effort:** ~5 hours | **Impact:** Medium-high — better readability + faster condition editing

---

### Phase 3: Advanced Capabilities

Higher-effort features that add power-user capabilities.

#### 3.1 Execution State: Token Count, Cost, and Timing Per Node

**What:** In `InteractiveWorkflowGraph`, after execution completes, show on each node:

- Token count (input/output)
- Estimated cost
- Execution time
- Truncated output preview (first ~100 chars)

Click to expand full output in the side panel.

**Why:** This is critical for AI workflow editors. Rivet and LangGraph Studio both show this. Users need to understand cost distribution across nodes to optimize their workflows. Without it, cost is a black box.

**Implementation:** The data already exists in `WorkflowStep[]` (which tracks tokens, cost, output). Just surface it on the node face.

**Effort:** ~4 hours | **Impact:** Very high for cost optimization and debugging

---

#### 3.2 Streaming Token Output on Running Nodes

**What:** When a node is executing, show a live-updating text area on the node face that streams the LLM's token output in real-time.

**Why:** LangGraph Studio's killer feature. Currently, users see a static "running" state and then suddenly "completed" with output. Streaming makes the workflow feel alive and lets users catch issues early (e.g., "this agent is going off-topic, let me stop it").

**Implementation:** The Firestore-based run event system already emits streaming events. Subscribe to the run's event stream in `InteractiveWorkflowGraph` and render tokens on the active node. Truncate to last ~200 chars on the node face; full stream in the side panel.

**Effort:** ~8 hours | **Impact:** Very high — makes execution feel magical

---

#### 3.3 Node Grouping (Collapsible Containers)

**What:** Allow users to select multiple nodes and group them into a labeled, colored container. The group can be collapsed to a single "macro" node (showing group name + node count) or expanded to show all internal nodes.

**Why:** ComfyUI and Rivet both use this as the primary complexity management tool. For workflows with 15+ nodes, grouping is essential. Without it, the canvas becomes overwhelming.

**Implementation:**

- Multi-select (from Phase 1.3) + "Group" button in toolbar
- Group is a React Flow "group" node (built-in support) with a colored background
- Collapsed state: single node with `{groupName} (5 nodes)` label
- Expanded state: all child nodes visible inside the group boundary
- Groups are persisted as metadata in the `WorkflowGraph`

**Effort:** ~12 hours | **Impact:** High for complex workflows

---

#### 3.4 Breakpoints & Step-Through Debugging

**What:** Allow users to set breakpoints on any node. During execution, the workflow pauses at breakpoints, showing current state. User can inspect, modify input, and resume (or step to next node).

**Why:** LangGraph Studio's most powerful debugging feature. For complex graph workflows with conditions and loops, breakpoints are essential to understand why a particular path was taken.

**Implementation:**

- Add a "breakpoint" toggle on each node (red dot indicator)
- During execution, when the workflow reaches a breakpoint node, set run status to `waiting_for_input` with a `breakpoint` flag
- Show a "Paused at Node X" overlay with the current state
- Provide "Resume", "Step" (execute one node and pause again), and "Skip" buttons
- This leverages the existing `human_input` / `waiting_for_input` infrastructure

**Effort:** ~10 hours | **Impact:** High for debugging complex workflows

---

#### 3.5 Subgraph Composition (Workflow-as-Node)

**What:** Allow a workflow graph node to reference another saved workflow. The subgraph node shows as a single node with the sub-workflow's name, but can be double-clicked to "drill down" into the sub-workflow graph (breadcrumb navigation).

**Why:** Rivet's primary complexity management tool. This enables:

- Reuse: a "Research + Summarize" sub-workflow used in multiple parent workflows
- Modularity: edit the sub-workflow independently
- Readability: complex workflows as composable building blocks

**Implementation:**

- New node type: `subworkflow` with a `workflowId` reference
- In the builder, selecting this type shows a workflow picker
- Double-clicking drills into the sub-workflow editor (with breadcrumb nav)
- During execution, the sub-workflow runs as a nested graph (LangGraph already supports subgraphs via `firestoreCheckpointer`)

**Effort:** ~16 hours | **Impact:** Transformative for power users

---

#### 3.6 Upgrade Layout Algorithm (Dagre/ELK)

**What:** Replace the custom BFS layout with `dagre` (or `elkjs`) for auto-layout.

**Why:** The current BFS layout works for linear chains and simple splits, but struggles with:

- Uneven branch depths (one branch has 5 nodes, another has 2 — BFS doesn't center properly)
- Cross-edges between non-adjacent columns
- Minimizing edge crossings in complex DAGs
- Handling disconnected subgraphs elegantly

Dagre is the standard for directed graph layout and handles all these cases. React Flow's ecosystem recommends it.

**Implementation:**

```typescript
import dagre from 'dagre'

function computeDagreLayout(nodes, edges): PositionedNodes {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'LR', ranksep: 100, nodesep: 60 })
  g.setDefaultEdgeLabel(() => ({}))

  nodes.forEach((n) => g.setNode(n.id, { width: 260, height: 120 }))
  edges.forEach((e) => g.setEdge(e.from, e.to))

  dagre.layout(g)

  return nodes.map((n) => ({
    ...n,
    position: { x: g.node(n.id).x, y: g.node(n.id).y },
  }))
}
```

Keep the "Auto-Layout" button from 2.4, but use dagre instead of BFS.

**Effort:** ~4 hours | **Impact:** Medium — better layout for complex graphs

---

#### 3.7 Copy/Paste Nodes

**What:** Support Ctrl+C to copy selected node(s) (with their edges) and Ctrl+V to paste. Pasted nodes get new IDs and are placed near the original positions with an offset.

**Why:** Currently, creating similar nodes requires building each one from scratch. For workflows with repeated patterns (e.g., 3 research agents with different prompts), copy/paste saves significant time.

**Implementation:**

- On copy: serialize selected nodes + internal edges to clipboard state
- On paste: deserialize, generate new IDs, offset positions by +50px each axis
- Re-wire edges to use new IDs
- Select pasted nodes for immediate editing

**Effort:** ~4 hours | **Impact:** Medium — saves time on repetitive graph building

---

#### 3.8 Node Bypass/Mute (Testing Mode)

**What:** Allow right-click → "Bypass" on any node. A bypassed node is greyed out and its input passes directly to its output during execution. "Mute" completely skips the node.

**Why:** ComfyUI's bypass feature is invaluable for A/B testing workflows. Users can temporarily disable an agent node to see how the workflow performs without it, without deleting and re-creating the node.

**Implementation:**

- Add `bypassed: boolean` and `muted: boolean` to `BuilderNode`
- Visual: bypassed nodes get a diagonal stripe overlay; muted nodes are 30% opacity
- During execution: bypassed nodes pass-through; muted nodes are skipped
- Context menu or keyboard shortcut (B for bypass, M for mute)

**Effort:** ~5 hours | **Impact:** Medium — great for iterating on workflow design

---

### Phase 4: AI-Native Features

Features specific to AI agent workflow editors (not found in generic workflow tools).

#### 4.1 AI-Evaluated Conditions

**What:** Add a new edge condition type: `llm_evaluate`. Instead of regex/equals/contains, the condition is a natural language instruction (e.g., "route to this branch if the research found conflicting evidence"). A cheap model (gpt-5-nano) evaluates the condition at runtime.

**Why:** Rivet offers this and it's uniquely powerful for AI workflows. Traditional string matching conditions are brittle — you're trying to pattern-match on LLM output, which is inherently unstructured. Letting an LLM evaluate the condition is more natural and robust.

**Implementation:**

- Add `llm_evaluate` to `WorkflowEdgeConditionType`
- In the edge condition editor, when `llm_evaluate` is selected, show a text area for the natural language condition
- In the backend `genericGraph.ts`, when evaluating this edge type, make a call to gpt-5-nano with: "Given this output: {output}, evaluate this condition: {condition}. Respond YES or NO."
- Cost: ~$0.001 per evaluation (nano pricing)

**Effort:** ~6 hours | **Impact:** High — makes conditional workflows actually work well with LLM output

---

#### 4.2 Inline Prompt Editor on Agent Nodes

**What:** For agent nodes, show a small inline prompt preview on the node face. Clicking the prompt area expands it into an inline editor (still on the node, no modal) for quick edits. Full editing still available in the side panel.

**Why:** Rivet's signature feature. The most common editing action in an AI workflow builder is tweaking prompts. Currently this requires: double-click → modal opens → scroll to prompt → edit → close modal. An inline editor eliminates 4 of those 5 steps.

**Implementation:**

- In `BuilderCustomNode`, render a truncated prompt text (2-3 lines, monospace, muted color)
- On click, expand to an inline `<textarea>` with a small save/cancel button
- Changes dispatch `UPDATE_NODE` to update the custom prompt
- Node auto-resizes to fit the editor (use React Flow's `NodeResizer`)

**Effort:** ~6 hours | **Impact:** High — makes prompt iteration dramatically faster

---

#### 4.3 Estimated Cost Preview (Pre-Execution)

**What:** Before running a workflow, show an estimated cost breakdown per node based on the configured model and expected token count. Show as a tooltip or badge on each node.

**Why:** Unique to AI workflow editors. Users should know _before_ they run a workflow how much it will cost. Currently cost is only visible after execution.

**Implementation:**

- Use `modelPricing.ts` to calculate per-node estimates
- Default token estimate: agent's `maxTokens` for output, ~500 for input (or use historical average)
- Show as a small "$0.05" badge on each node in the builder
- Show total estimated cost in the toolbar header: "Est. cost: $0.42"

**Effort:** ~3 hours | **Impact:** High — cost awareness before commitment

---

#### 4.4 Execution Replay (Time Travel)

**What:** After a workflow completes, allow users to "replay" the execution by stepping through nodes in order. At each step, show the node's input, output, and the state diff (what changed).

**Why:** LangGraph Studio's time travel feature. For debugging why a workflow took a certain path or produced certain output, being able to replay step-by-step is invaluable. The data already exists in the run's `steps` array.

**Implementation:**

- Add a "Replay" button on completed runs in `InteractiveWorkflowGraph`
- Replay mode: timeline scrubber at the bottom, nodes highlight one at a time
- At each step: side panel shows input/output/state-diff
- Forward/back buttons to step through
- Clicking a node jumps to its execution step

**Effort:** ~10 hours | **Impact:** Very high for understanding and debugging

---

## Priority Matrix

### Tier 1: Do First (Highest Impact per Hour)

| #   | Improvement                                             | Phase | Effort | Impact         |
| --- | ------------------------------------------------------- | ----- | ------ | -------------- |
| 1   | MiniMap                                                 | 1.1   | 15 min | High           |
| 2   | Edge arrowheads                                         | 1.2   | 15 min | High           |
| 3   | Richer node content (agent name, model, prompt preview) | 1.4   | 2 hrs  | Very high      |
| 4   | Node toolbar (floating actions)                         | 1.5   | 2 hrs  | High           |
| 5   | "+" button on node outputs                              | 2.1   | 6 hrs  | Transformative |
| 6   | Replace modal with slide-in panel                       | 2.2   | 8 hrs  | Transformative |

**Total Tier 1: ~19 hours** for a dramatically better editing experience.

### Tier 2: Do Next (Strong Value)

| #   | Improvement                                       | Phase | Effort | Impact      |
| --- | ------------------------------------------------- | ----- | ------ | ----------- |
| 7   | Undo/Redo                                         | 2.3   | 4 hrs  | High        |
| 8   | Enable draggable nodes (hybrid layout)            | 2.4   | 3 hrs  | Medium-high |
| 9   | Token count + cost display per node               | 3.1   | 4 hrs  | Very high   |
| 10  | Estimated cost preview (pre-execution)            | 4.3   | 3 hrs  | High        |
| 11  | Better edge visualization + inline condition edit | 2.5   | 5 hrs  | Medium-high |
| 12  | Multi-select                                      | 1.3   | 1 hr   | Medium      |
| 13  | AI-evaluated conditions                           | 4.1   | 6 hrs  | High        |

**Total Tier 2: ~26 hours** for power-user editing + cost intelligence.

### Tier 3: Do Later (Advanced)

| #   | Improvement                             | Phase | Effort | Impact         |
| --- | --------------------------------------- | ----- | ------ | -------------- |
| 14  | Streaming token output on running nodes | 3.2   | 8 hrs  | Very high      |
| 15  | Inline prompt editor on nodes           | 4.2   | 6 hrs  | High           |
| 16  | Execution replay (time travel)          | 4.4   | 10 hrs | Very high      |
| 17  | Breakpoints & step-through debugging    | 3.4   | 10 hrs | High           |
| 18  | Node grouping (collapsible)             | 3.3   | 12 hrs | High           |
| 19  | Upgrade to dagre layout                 | 3.6   | 4 hrs  | Medium         |
| 20  | Copy/paste nodes                        | 3.7   | 4 hrs  | Medium         |
| 21  | Node bypass/mute                        | 3.8   | 5 hrs  | Medium         |
| 22  | Subgraph composition                    | 3.5   | 16 hrs | Transformative |

**Total Tier 3: ~75 hours** for pro-level debugging + complexity management.

---

## Expected Outcome

### After Tier 1 (~19 hours):

The editor goes from "diagram viewer with a sidebar" to "intuitive visual builder." Users can:

- See what each node does at a glance (agent, model, prompt preview)
- Add nodes by clicking "+" on any output (flow-through building)
- Edit properties while seeing the graph (side panel, not modal)
- Navigate complex graphs with MiniMap
- Understand data flow direction (arrowheads)
- Take quick actions via floating toolbar

### After Tier 1+2 (~45 hours):

The editor becomes competitive with n8n for AI workflows. Users additionally:

- Undo mistakes (Ctrl+Z)
- Reposition nodes freely
- See cost per node (both estimated and actual)
- Edit conditions inline on edges
- Use AI-evaluated conditions for smart routing
- Select and operate on multiple nodes

### After All Tiers (~120 hours):

The editor becomes the **best visual AI agent workflow builder available** — beyond n8n (which is generic), beyond Rivet (which is developer-focused), and beyond LangGraph Studio (which is code-first). Users get:

- Streaming output on nodes during execution
- Time-travel debugging with state diffs
- Breakpoints for step-through inspection
- Collapsible groups for managing complexity
- Subgraph composition for reusable building blocks
- Node bypass for A/B testing workflow variations
