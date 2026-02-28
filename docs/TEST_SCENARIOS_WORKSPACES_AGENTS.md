# Test Scenarios & Use Cases: AI Agents & Workspaces

**Version 1.6** | Last Updated: February 26, 2026

---

## Purpose

This document provides **practical test scenarios** to help you:

1. **Explore every feature** of the AI Agents & Workspaces system
2. **Validate functionality** and provide feedback
3. **Learn through doing** with real-world examples
4. **Test edge cases** and error handling

Each scenario includes:

- **Objective**: What you're testing
- **Features Tested**: Which components are exercised
- **Steps**: Detailed walkthrough
- **Expected Results**: What should happen
- **Feedback Questions**: What to evaluate

---

## Table of Contents

### Basic Scenarios

1. [Create Your First Agent](#scenario-1-create-your-first-agent)
2. [Create a Sequential Workspace](#scenario-2-create-a-sequential-workspace)
3. [Run a Simple Workflow](#scenario-3-run-a-simple-workflow)

### Intermediate Scenarios

4. [Multi-Agent Collaboration](#scenario-4-multi-agent-collaboration)
5. [Using Agent Templates](#scenario-5-using-agent-templates)
6. [Building a Graph Workflow](#scenario-6-building-a-graph-workflow)
7. [Interactive Workflow with Human Input](#scenario-7-interactive-workflow-with-human-input)

### Workflow Builder & Ordering Scenarios

8. [Drag-and-Drop Agent Ordering](#scenario-8-drag-and-drop-agent-ordering)
9. [Parallel Workflow with Merge Strategies](#scenario-9-parallel-workflow-with-merge-strategies)
10. [Custom Visual Workflow Builder](#scenario-10-custom-visual-workflow-builder)
11. [Supervisor Workflow](#scenario-11-supervisor-workflow)

### Advanced Scenarios

12. [Expert Council Decision Making](#scenario-12-expert-council-decision-making)
13. [Project Manager Orchestration](#scenario-13-project-manager-orchestration)
14. [Deep Research Integration](#scenario-14-deep-research-integration)
15. [Prompt-to-Graph Workflow](#scenario-15-prompt-to-graph-workflow)

### Template & Management Scenarios

16. [Create and Share Templates](#scenario-16-create-and-share-templates)
17. [Import/Export Templates](#scenario-17-importexport-templates)
18. [Prompt Library Management](#scenario-18-prompt-library-management)
19. [Coaching Agent Templates](#scenario-19-coaching-agent-templates)

### Edge Case & Error Scenarios

20. [Handling Run Failures](#scenario-20-handling-run-failures)
21. [Infinite Loop Prevention](#scenario-21-infinite-loop-prevention)
22. [Memory Limit Effects](#scenario-22-memory-limit-effects)

### Search Tool Scenarios

23. [Configure Search Tool API Keys](#scenario-23-configure-search-tool-api-keys)
24. [Quick Search Workspace](#scenario-24-quick-search-workspace)
25. [Deep Research Report Workspace](#scenario-25-deep-research-report-workspace)

### Workspace Template Scenarios

26. [Deep Research Template](#scenario-26-deep-research-template)
27. [Normal Research Template](#scenario-27-normal-research-template)
28. [Project Plan Builder Template](#scenario-28-project-plan-builder-template)
29. [Data Scraper Template](#scenario-29-data-scraper-template)
30. [Large Document Reviewer Template](#scenario-30-large-document-reviewer-template)
31. [Transcript Action Extractor Template](#scenario-31-transcript-action-extractor-template)
32. [Block Calendar Template](#scenario-32-block-calendar-template)
33. [Gmail Review Template](#scenario-33-gmail-review-template)
34. [Dialectical Reasoning Template](#scenario-34-dialectical-reasoning-template)

### Hegelian Dialectical Scenarios

35. [Dialectical Cycle: Strategic Decision](#scenario-35-dialectical-cycle-strategic-decision)
36. [Multi-Model Thesis Generation](#scenario-36-multi-model-thesis-generation)
37. [Contradiction Tracking & Resolution](#scenario-37-contradiction-tracking-resolution)
38. [Knowledge Hypergraph Retrieval](#scenario-38-knowledge-hypergraph-retrieval)

### Automated Deep Research Scenarios

39. [Deep Research KG + Dialectical Template](#scenario-39-deep-research-kg--dialectical-template)
40. [Deep Research Budget Control](#scenario-40-deep-research-budget-control)
41. [Deep Research Knowledge Graph Inspection](#scenario-41-deep-research-knowledge-graph-inspection)

### Channel Connection Scenarios

42. [Connect LinkedIn Channel](#scenario-39-connect-linkedin-channel)
43. [Connect Telegram Channel](#scenario-40-connect-telegram-channel)
44. [Connect WhatsApp Channel](#scenario-41-connect-whatsapp-channel)
45. [Channel Connection Error Handling](#scenario-42-channel-connection-error-handling)

### Real-World Use Cases

46. [Business Plan Development](#use-case-1-business-plan-development)
47. [Technical Documentation Creation](#use-case-2-technical-documentation-creation)
48. [Market Research Report](#use-case-3-market-research-report)
49. [Content Marketing Pipeline](#use-case-4-content-marketing-pipeline)
50. [Product Launch Strategy](#use-case-5-product-launch-strategy)
51. [Supervisor-Driven Project Triage](#use-case-6-supervisor-driven-project-triage)
52. [Dialectical Market Entry Analysis](#use-case-7-dialectical-market-entry-analysis)

---

## Basic Scenarios

### Scenario 1: Create Your First Agent

**Objective**: Learn agent creation basics

**Features Tested**:

- Agent Builder modal
- Model selection
- System prompt configuration
- Agent card display

**Steps**:

1. Navigate to **Agents** page (`/agents`)
2. Click **➕ New Agent** button
3. Fill in Basic Information:
   - Name: "Content Researcher"
   - Role: "Researcher"
   - Description: "Finds data and sources for content creation"
4. Go to Configuration tab:
   - System Prompt: "You are a content researcher. Find credible sources, key statistics, and relevant examples for any topic. Always cite sources."
   - Provider: "OpenAI"
   - Model: "gpt-4.1"
   - Temperature: 0.4 (slightly creative but focused)
   - Max Tokens: 2000
5. Go to Tools tab:
   - Enable: `web_search`
6. Click **Save Agent**

**Expected Results**:

- ✅ Agent appears in agents list as a card with role-specific icon (light/dark variants match theme)
- ✅ Agent card shows name, role badge (e.g. "🔍 Researcher"), provider, model, temperature
- ✅ System prompt preview is truncated on the card
- ✅ Can click Edit to modify, Save Template to reuse, or Delete
- ✅ Role filter dropdown in the agents list lets you filter by role (Researcher, Planner, Critic, Synthesizer, Executor, Supervisor, Custom)

**Feedback Questions**:

1. Is the agent builder intuitive?
2. Are the model options clear?
3. Is system prompt editing comfortable?
4. Do the role-specific icons help distinguish agent types at a glance?

---

### Scenario 2: Create a Sequential Workspace

**Objective**: Build a simple multi-agent workflow

**Features Tested**:

- Workspace Builder modal
- Agent selection
- Sequential workflow
- Workspace card display

**Prerequisites**: Create 3 agents:

- "Content Researcher" (from Scenario 1)
- "Content Writer"
- "Content Editor"

**Steps**:

1. Navigate to **Agents** page → **Workspaces** section
2. Click **➕ New Workspace**
3. Fill in:
   - Name: "Simple Content Pipeline"
   - Description: "Research → Write → Edit"
4. Select agents:
   - Use the role filter dropdown to narrow the list
   - Check all 3 agents
   - Default Agent: "Content Researcher"
5. Workflow settings:
   - Workflow Type: "Sequential"
   - A drag-and-drop ordering list appears automatically
   - Drag agents to set execution order: Researcher → Writer → Editor
   - Max Iterations: 10
6. Click **Save Workspace**

**Expected Results**:

- ✅ Workspace appears in list
- ✅ Shows "3 agents" and "Sequential" badge
- ✅ Drag-and-drop ordering list appears when 2+ agents are selected
- ✅ Agent order is preserved on save and reload

**Feedback Questions**:

1. Is workspace creation straightforward?
2. Is drag-and-drop ordering intuitive for setting execution order?
3. Is the role filter helpful when selecting agents?

---

### Scenario 3: Run a Simple Workflow

**Objective**: Execute your first run and see results

**Features Tested**:

- Run modal
- Run execution
- Live status updates
- Output display

**Prerequisites**: "Simple Content Pipeline" workspace from Scenario 2

**Steps**:

1. On Workspaces page, find "Simple Content Pipeline"
2. Click **▶️ Run Workspace**
3. In Run modal:
   - Goal: "Create a blog post about sustainable living tips for busy professionals"
4. Click **Start Run**
5. Observe:
   - Run card appears with "Running" status
   - Status indicator shows current agent activity
   - Token counter updates in real-time
6. Wait for completion (may take 2-3 minutes)
7. Once status changes to "Completed":
   - Expand **▼ Output** section
   - Read the final content

**Expected Results**:

- ✅ Run starts immediately
- ✅ Live updates show progress
- ✅ Token count increases
- ✅ Final output is coherent and relevant
- ✅ All 3 agents contributed (check Messages section)

**Feedback Questions**:

1. Is the run progress clear?
2. Is the live status helpful?
3. Is the final output satisfactory?
4. Would you like to see estimated completion time?

---

## Intermediate Scenarios

### Scenario 4: Multi-Agent Collaboration

**Objective**: See agents building on each other's work

**Features Tested**:

- Message history
- Context passing
- Agent coordination

**Prerequisites**: "Simple Content Pipeline" completed run from Scenario 3

**Steps**:

1. On Workspace Detail page, find completed run
2. Expand **▼ Messages** section
3. Observe conversation flow:
   - User message with goal
   - Agent 1 (Researcher) response with research
   - Agent 2 (Writer) response referencing research
   - Agent 3 (Editor) response polishing final content
4. Note how each agent:
   - References previous work
   - Adds their expertise
   - Maintains context

**Expected Results**:

- ✅ Clear conversation thread
- ✅ Agents acknowledge previous work
- ✅ Context maintained throughout
- ✅ Each agent's contribution is distinct

**Feedback Questions**:

1. Is the agent collaboration visible and understandable?
2. Can you see how context flows between agents?
3. Would visual indicators of context usage help?

---

### Scenario 5: Using Agent Templates

**Objective**: Leverage pre-built agent configurations

**Features Tested**:

- Template selector
- Template instantiation
- Template customization

**Steps**:

1. Navigate to **Agents** page
2. Click **📋 From Template** button
3. Browse templates — each shows a category-specific icon (light/dark):
   - Look at "Risk Analyst"
   - Look at "Real-Time News Analyst" (Grok 4)
   - Look at "Agency & Urgency Coach" (new coaching templates)
4. Select **"Technical Documentation Writer"**
5. Click **Use Template**
6. Agent is created automatically
7. Optional: Click **Edit** to customize
   - Change name to "API Documentation Writer"
   - Modify system prompt to focus on API docs
   - Save

**Expected Results**:

- ✅ Template instantiates immediately
- ✅ Agent is fully configured with role, model, temperature, and tools
- ✅ Ready to use in workspaces
- ✅ Can be customized if needed

**Feedback Questions**:

1. Are templates discoverable?
2. Are template descriptions and icons helpful?
3. Would you like more built-in templates?
4. Are the coaching agent templates useful for business scenarios?

---

### Scenario 6: Building a Graph Workflow

**Objective**: Create complex workflow with branching using JSON or Visual Builder

**Features Tested**:

- Graph workflow JSON editor
- Custom Visual Workflow Builder (ReactFlow canvas)
- Graph Docs modal
- Node creation and edge connections
- Conditional routing

**Prerequisites**: Create agents from templates:

- "Content Strategist (Balanced)"
- "SEO Specialist (Balanced)"
- "Technical Documentation Writer (Balanced)"
- "Creative Writer (Balanced)"

**Steps**:

1. Create new workspace: "Adaptive Content Creation"
2. Add all 4 agents
3. Workflow settings:
   - Type: "Graph"
4. Click **"View Graph Docs"** to read the schema reference
5. Option A — **JSON Editor**: Paste or type graph JSON directly
6. Option B — **Visual Builder** (recommended):
   - Click **"Open Visual Builder"**
   - The builder opens with a Start Agent and End node
   - Use the **Node Palette** on the left to add nodes:
     - Select Start Agent → click "Agent" → adds an agent node after it
     - In the properties panel, assign "Content Strategist" from the agent dropdown
     - Repeat: add SEO Analyst, then a Human Input node, then branch
   - The **Workspace Agents** section in the palette lists all 4 agents for quick add
   - Use **Conditional Branch** in the Structure section to split paths
   - Configure edges: set condition type (Equals/Contains/Regex) in properties
   - Click **Save Workflow** to export graph JSON back to the form
7. Save workspace

**Expected Results**:

- ✅ Visual builder renders nodes on a grid-snapped canvas
- ✅ Nodes are color-coded by type (blue = agent, yellow = tool, red = human input, etc.)
- ✅ Edges show condition labels when not "always"
- ✅ Node properties panel lets you edit label, type, assigned agent, and output key
- ✅ Workspace agents appear in the palette for quick insertion
- ✅ Parallel Split creates N branch nodes with a join node
- ✅ Conditional Branch creates branching paths with edge conditions
- ✅ Saving exports valid graph JSON
- ✅ Graph Docs modal explains the schema

**Feedback Questions**:

1. Is the visual builder more intuitive than raw JSON?
2. Is the node palette easy to discover?
3. Are the color-coded node types helpful?
4. Is the properties panel sufficient for configuration?

---

### Scenario 7: Interactive Workflow with Human Input

**Objective**: Test human-in-the-loop workflows

**Features Tested**:

- Human input nodes
- Run pausing
- Input submission
- Run resumption

**Prerequisites**: "Adaptive Content Creation" workspace from Scenario 6

**Steps**:

1. Run workspace with goal: "Create content about AI in healthcare"
2. Watch run progress through:
   - Content Strategist creates strategy
   - SEO Analyst provides SEO recommendations
3. Run pauses at Human Input node
4. Agent Question Panel appears:
   - Question: "Which style? A) Technical B) Creative"
   - Type response: "A - Technical approach for medical professionals"
5. Click **Submit Response** (or Cmd+Enter)
6. Run resumes with Technical Writer
7. Wait for completion

**Expected Results**:

- ✅ Run pauses cleanly at input node
- ✅ Question is displayed clearly
- ✅ Response input is prominent
- ✅ Run resumes immediately after submission
- ✅ Chosen path is followed (Technical Writer)
- ✅ Final output matches chosen style

**Feedback Questions**:

1. Is the pause for input clear?
2. Is the question display effective?
3. Would you like to provide structured data (not just text)?
4. Should there be a timeout for input?

---

## Workflow Builder & Ordering Scenarios

### Scenario 8: Drag-and-Drop Agent Ordering

**Objective**: Reorder agents via drag-and-drop for sequential and parallel workflows

**Features Tested**:

- SortableAgentList drag-and-drop component
- Agent ordering persistence on save
- Order restoration on edit

**Prerequisites**: A workspace with 3+ agents in sequential or parallel mode

**Steps**:

1. Create or edit a workspace
2. Select 3+ agents and set workflow type to **Sequential**
3. Observe the **Execution Order** section that appears below workflow type:
   - Each selected agent is listed with a drag handle (dots icon), index number, role icon, and name
4. Drag "Content Editor" above "Content Writer" to change execution order
5. Observe the index numbers update in real time
6. Save the workspace
7. Re-open the workspace for editing
8. Verify the order is preserved

**Expected Results**:

- ✅ Drag handle appears on the left of each agent row
- ✅ Dragging animates smoothly (agent lifts with drop shadow)
- ✅ Index numbers re-sequence immediately on drop
- ✅ Order is preserved through save/reload
- ✅ Works for both Sequential ("Execution Order") and Parallel ("Output Order") workflows
- ✅ Ordering list only appears when 2+ agents are selected

**Feedback Questions**:

1. Is the drag handle discoverable?
2. Is the animation smooth enough?
3. Would you like keyboard shortcuts for reordering?

---

### Scenario 9: Parallel Workflow with Merge Strategies

**Objective**: Test all merge strategies for parallel agent outputs

**Features Tested**:

- ParallelMergeSelector radio-card component
- Merge strategy validation (synthesize requires exactly 1 Synthesizer)
- SortableAgentList output ordering

**Prerequisites**: Create 3 agents:

- "Brainstorm Agent A" (role: Researcher)
- "Brainstorm Agent B" (role: Researcher)
- "Result Synthesizer" (role: Synthesizer)

**Steps**:

1. Create workspace: "Merge Strategy Test"
2. Select all 3 agents
3. Set workflow type to **Parallel**
4. Observe the **Merge Strategy** selector with 4 options:
   - **Combine** — concatenate all outputs in order
   - **Pick Best** — Expert Council selects the best response
   - **Synthesize** — a Synthesizer agent merges outputs
   - **Deduplicate Combine** — combine only unique results
5. Select **Combine** — no warnings shown
6. Select **Synthesize**:
   - A green hint confirms "The Synthesizer receives all outputs"
   - Because exactly 1 Synthesizer is selected, no warning
7. Now deselect "Result Synthesizer" and observe:
   - Warning: "Requires exactly one Synthesizer agent"
8. Re-select the Synthesizer. Select a second Synthesizer (if available):
   - Warning: "Requires exactly one Synthesizer agent — 2 are currently selected"
9. Switch merge to **Pick Best** — no synthesizer constraint
10. Use the **Output Order** drag-and-drop list to control concatenation order
11. Save workspace

**Expected Results**:

- ✅ 4 merge options displayed as radio cards with labels and descriptions
- ✅ Selecting "Synthesize" without a Synthesizer shows a warning
- ✅ Selecting "Synthesize" with exactly 1 Synthesizer shows a success hint
- ✅ Multiple Synthesizers show a specific warning
- ✅ Save is blocked with validation error if "Synthesize" is selected without a valid Synthesizer
- ✅ Output order drag-and-drop controls the combination sequence

**Feedback Questions**:

1. Are the merge strategy descriptions clear enough?
2. Is the synthesizer validation helpful or restrictive?
3. Would you like a preview of how merge affects output?

---

### Scenario 10: Custom Visual Workflow Builder

**Objective**: Build a full custom workflow graph using the visual canvas

**Features Tested**:

- ReactFlow-based visual builder canvas
- Node palette (add nodes, workspace agents, structural operations)
- Node properties panel (label, type, agent assignment, edge conditions)
- Parallel split and conditional branch operations
- Save/load graph cycle

**Prerequisites**: Create 3 agents in any role

**Steps**:

1. Create a new workspace
2. Select 3+ agents
3. Set workflow type to **Custom**
4. Click **"Open Visual Builder"**
5. The builder opens with 2 default nodes: "Start Agent" and "End", connected by an edge
6. Click the "Start Agent" node to select it (border highlights)
7. In the **Node Palette** (left sidebar):
   - Under "Add Node", click **Agent** — a new agent node is inserted after the selected node
   - Under "Workspace Agents", click one of your agents — a pre-configured agent node is inserted
8. Select the new agent node, then in **Node Properties** (below palette):
   - Change its label
   - Assign an agent from the dropdown
   - Add an output key
9. With a node selected, click **Parallel Split** (set branches to 3):
   - 3 branch nodes + 1 join/merge node appear
   - All branch nodes connect from the selected node, all merge into the join
10. Select a node and click **Conditional Branch**:
    - 2 conditional paths (Path A, Path B) are created
    - In Properties, set edge conditions (Equals, Contains, Regex)
11. Select any non-start node and click **Delete Selected Node**:
    - Node is removed, edges are re-wired (predecessors connect to successors)
12. Header shows live "N nodes, M edges" counter
13. Click **Save Workflow** — canvas closes, graph JSON is populated in the form
14. Save workspace, then re-edit it
15. Click "Open Visual Builder" again — previous graph is loaded

**Expected Results**:

- ✅ Canvas renders with zoom, pan, and auto-fit
- ✅ Nodes are color-coded: blue (agent), yellow (tool), red (human input), teal (join), gray (end), green (research)
- ✅ Start node shows "START" badge
- ✅ Conditional edges are animated with dashed stroke and show condition labels
- ✅ Parallel Split creates correct fan-out/fan-in topology
- ✅ Deleting a node preserves graph connectivity
- ✅ Graph survives a save → reload → reopen cycle
- ✅ The N^2 iteration guard prevents browser freeze if cycles are accidentally introduced

**Feedback Questions**:

1. Is the node palette organized well?
2. Is the split between palette and properties panel intuitive?
3. Would you like undo/redo support?
4. Is auto-layout sufficient or would manual positioning help?

---

### Scenario 11: Supervisor Workflow

**Objective**: Create a supervisor-driven workspace where one agent delegates to workers

**Features Tested**:

- Supervisor agent role creation
- Supervisor workflow type selection
- Supervisor agent selector (filtered to supervisor-role agents)
- SupervisorPreview hub-and-spoke visualization
- Validation (minimum 2 agents, supervisor required)
- Agent ID reordering on save (supervisor first)

**Prerequisites**: None — this scenario walks through end-to-end

**Steps**:

**Part A: Create a Supervisor Agent**

1. Navigate to **Agents** page
2. Click **➕ New Agent**
3. Fill in:
   - Name: "Project Coordinator"
   - Role: **Supervisor** (new role option)
   - Description: "Routes and delegates work across specialist agents"
4. Configure:
   - System Prompt: "You are a project coordinator. Break down the problem into sub-tasks, delegate each to the appropriate specialist, validate their work, and synthesize the final result."
   - Provider: OpenAI, Model: gpt-4.1, Temperature: 0.3
5. Save — agent card shows "👔 Supervisor" badge with the supervisor icon

**Part B: Create Worker Agents**

6. Create 2 more agents:
   - "Research Specialist" (role: Researcher)
   - "Report Writer" (role: Executor)

**Part C: Create Supervisor Workspace**

7. Click **➕ New Workspace**
8. Name: "Supervised Research Pipeline"
9. Select all 3 agents
10. Set workflow type to **Supervisor**
11. Observe new UI elements:
    - **Supervisor Agent** dropdown appears, filtered to agents with role "supervisor"
    - If no supervisor-role agent is selected, a warning is shown
    - Select "Project Coordinator" as the supervisor
12. Observe the **Supervisor Overview** visualization:
    - Hub-and-spoke SVG: "Project Coordinator" at the top center
    - "Research Specialist" and "Report Writer" below, connected by dashed lines
    - Each worker shows their role badge
13. Save workspace

**Part D: Validation**

14. Try saving without selecting a supervisor:
    - Error: "A supervisor agent must be selected"
15. Deselect all agents except the supervisor:
    - Error: "Supervisor workflow requires at least 2 agents (1 supervisor + 1 worker)"
16. Re-select agents and supervisor, save successfully
17. Re-open for editing — supervisor selection is restored

**Expected Results**:

- ✅ "Supervisor" appears in the role dropdown in Agent Builder
- ✅ Agent cards show 👔 icon and "Supervisor" label
- ✅ Workspace form shows supervisor-specific UI when "supervisor" workflow is selected
- ✅ Supervisor dropdown is filtered to supervisor-role agents only
- ✅ Hub-and-spoke preview renders correctly with correct agent names
- ✅ Validation prevents save without supervisor or with fewer than 2 agents
- ✅ On save, supervisor agent ID is placed first in the `agentIds` array (backend contract)
- ✅ Edit mode restores supervisor selection from the first agent ID

**Feedback Questions**:

1. Is the supervisor workflow concept clear from the UI?
2. Is the hub-and-spoke preview useful for understanding the topology?
3. Should the preview also show agent tools?
4. Would you like to configure delegation rules (e.g. which workers handle which tasks)?

---

## Advanced Scenarios

### Scenario 12: Expert Council Decision Making

**Objective**: Experience multi-model deliberation

**Features Tested**:

- Expert Council configuration
- Council invocation
- Multi-model voting
- Chairman synthesis

**Steps**:

1. Create workspace: "Strategic Decision Maker"
2. Add agent: "Strategic Advisor" (any model)
3. Enable **Expert Council**:
   - Default Mode: "Full"
   - Council Models: All 4 (OpenAI, Anthropic, Google, Grok)
   - Chairman: "gpt-4.1"
   - Self-Exclusion: Enabled
4. In agent's system prompt, add:
   ```
   For complex strategic decisions, use the expert_council_execute tool.
   ```
5. Give agent tool permission: `expert_council_execute`
6. Save workspace
7. Run with goal:
   ```
   Should our SaaS startup focus on enterprise or SMB market first?
   Considerations: $2M seed funding, team of 10, 18-month runway, product is
   AI-powered analytics for e-commerce.
   ```
8. Watch run execute:
   - Agent invokes Expert Council tool
   - All 4 models deliberate
   - Each provides perspective
9. Once complete, expand **▼ Expert Council** section
10. Read each model's reasoning and final recommendation

**Expected Results**:

- ✅ Council is invoked automatically
- ✅ All 4 models provide distinct perspectives
- ✅ Each reasoning is substantive (Full mode)
- ✅ Chairman synthesizes into clear recommendation
- ✅ Decision considers all viewpoints

**Feedback Questions**:

1. Is multi-model value clear in the output?
2. Are the different perspectives helpful?
3. Is the chairman's synthesis effective?
4. When would you use Quick vs Full mode?
5. Is the cost worth the quality for important decisions?

---

### Scenario 13: Project Manager Orchestration

**Objective**: Test intelligent workflow coordination

**Features Tested**:

- Project Manager configuration
- Question generation
- Assumption validation
- Conflict detection
- Quality gates

**Steps**:

1. Create workspace: "Comprehensive Project Planner"
2. Add agents:
   - "Project Manager" (with expert_council tool)
   - "Strategic Planner"
   - "Task Breakdown Specialist"
   - "Risk Analyst"
3. Enable **Project Manager**:
   - Questioning Depth: "Deep" (7-10 questions)
   - Auto Use Expert Council: Enabled
   - Expert Council Threshold: 60
   - Quality Gate Threshold: 75
   - All flags: Enabled (assumption validation, conflict detection, profiling)
4. Workflow: Sequential
5. Save and run with intentionally ambiguous goal:
   ```
   We need to build a mobile app ASAP for our new business idea.
   ```
6. Project Manager will ask clarifying questions:
   - What's the business idea?
   - What platforms (iOS/Android/both)?
   - What's "ASAP" in timeline?
   - What's the budget?
   - Who's the target user?
   - What features are must-have vs nice-to-have?
   - Do you have a design?
   - Etc.
7. Answer each question thoughtfully
8. PM validates your answers, may challenge assumptions
9. Workflow proceeds once PM is satisfied

**Expected Results**:

- ✅ PM asks relevant, probing questions
- ✅ Questions address ambiguity in original prompt
- ✅ PM identifies unrealistic assumptions
- ✅ PM detects conflicting requirements
- ✅ Final plan is comprehensive and realistic
- ✅ Can view PM context to see decisions made

**Feedback Questions**:

1. Are PM's questions helpful or annoying?
2. Is Deep questioning too much?
3. Does assumption validation add value?
4. Should PM ask questions in batches or one-by-one?

---

### Scenario 14: Deep Research Integration

**Objective**: Test external research workflow

**Features Tested**:

- Research request creation
- Research queue
- Priority management
- Research completion

**Prerequisites**: Create agent with `create_deep_research_request` tool permission

**Steps**:

1. Create workspace: "Research-Intensive Analysis"
2. Add "Research Analyst" agent (with deep research tool)
3. Run with complex research goal:
   ```
   Analyze the competitive landscape of AI-powered code editors.
   Include market share, feature comparison, pricing, and growth trends.
   ```
4. Agent realizes it needs deep external research
5. Agent creates research request using tool
6. Run continues with other work
7. Navigate to Workspace Detail page
8. See **Research Queue** panel
9. New request appears:
   - Question: "AI code editors competitive analysis"
   - Priority: Medium (auto-assigned)
   - Status: Pending
10. Click **Change Priority** → Set to "High"
11. In real scenario, you'd conduct research externally
12. For testing: Click **Mark Complete**
13. Provide mock findings:
    ```
    Top players: GitHub Copilot (60% share), Cursor (20%), Codeium (15%)
    Key features: Auto-complete, chat, command...
    Pricing: $10-20/mo for individuals...
    ```
14. Submit findings
15. Agent receives research results in next iteration

**Expected Results**:

- ✅ Agent identifies research need
- ✅ Request created with clear question
- ✅ Request appears in queue
- ✅ Priority can be changed
- ✅ Findings can be provided
- ✅ Agent incorporates findings

**Feedback Questions**:

1. Is research workflow clear?
2. Should research pause the run or continue async?
3. Would automated research be valuable?
4. What research sources would be most useful?

---

### Scenario 15: Prompt-to-Graph Workflow

**Objective**: Generate workflow from natural language

**Features Tested**:

- Natural language graph generation
- AI workflow design
- Graph validation

**Steps**:

1. Create new workspace: "AI-Generated Workflow"
2. Add several agents of different types
3. Workflow tab:
   - Type: "Graph"
4. Instead of manually designing, use **Prompt-to-Graph**:
   - Click "Use Prompt-to-Graph" button
   - Model: "gpt-4.1"
   - Prompt:
     ```
     Create a content review workflow:
     1. Writer creates initial draft
     2. Fact checker validates all claims
     3. If any facts fail, loop back to writer for revision
     4. If all facts pass, send to editor
     5. Editor polishes the content
     6. SEO specialist optimizes
     7. Human approval before publishing
     8. If rejected, loop back to editor
     9. If approved, mark as complete
     ```
   - Click **Generate Workflow**
5. AI generates graph with:
   - Writer node
   - Fact Checker node
   - Conditional loop back to Writer
   - Editor node
   - SEO node
   - Human Input node
   - Conditional loop to Editor
   - End node
   - All edges with appropriate conditions
6. Review generated graph
7. Make manual adjustments if needed
8. Save workspace

**Expected Results**:

- ✅ Graph is generated from description
- ✅ Logic matches prompt intent
- ✅ Nodes are correctly typed
- ✅ Edges have appropriate conditions
- ✅ Graph is valid and executable

**Feedback Questions**:

1. Does AI understand complex workflow logic?
2. Is generated graph correct?
3. How often do you need to manually adjust?
4. What workflow patterns does it struggle with?

---

## Template & Management Scenarios

### Scenario 16: Create and Share Templates

**Objective**: Save and reuse configurations

**Features Tested**:

- Template creation from agent
- Template creation from workspace
- Template library
- Template description

**Steps**:

**Part A: Agent Template**

1. Create well-configured agent: "Product Analyst"
   - Detailed system prompt
   - Specific model and parameters
   - Relevant tools
2. Click **💾 Save as Template**
3. Name: "Product Analysis Agent"
4. Description: "Analyzes product features, pricing, and market fit"
5. Save
6. Go to Agents page → **⚙️ View Templates**
7. Your template appears

**Part B: Workspace Template**

1. Create comprehensive workspace: "Product Launch Kit"
   - 6 agents (Market Researcher, Product Analyst, Marketing Strategist, etc.)
   - Graph workflow
   - Expert Council enabled
   - Project Manager enabled
2. Test run it to ensure it works
3. Click **💾 Save as Template**
4. Name: "Complete Product Launch Workflow"
5. Description: "End-to-end product launch planning with research, positioning, and go-to-market"
6. Save
7. Go to Workspaces page → **Templates** tab
8. Your template appears with:
   - "6 agents" badge
   - "Graph workflow" badge
   - "Expert Council" badge
   - "Project Manager" badge

**Expected Results**:

- ✅ Templates save all configuration
- ✅ Templates appear in library
- ✅ Templates show key features
- ✅ Can instantiate templates anytime

**Feedback Questions**:

1. Is template saving intuitive?
2. Should templates be public/sharable?
3. Would you like template categories?
4. Should templates version/update?

---

### Scenario 17: Import/Export Templates

**Objective**: Share templates as files

**Features Tested**:

- Template export
- JSON file generation
- Template import
- Configuration restoration

**Steps**:

**Part A: Export**

1. Go to Workspaces → Templates tab
2. Find "Complete Product Launch Workflow" template
3. Click **⋮ Menu** → **📤 Export**
4. JSON file downloads
5. Open file in text editor to inspect structure

**Part B: Share (Simulated)**

1. Share JSON file with colleague (simulate by saving to different folder)

**Part C: Import**

1. Delete the template (to simulate fresh import)
2. Click **📥 Import Template** button
3. Select the exported JSON file
4. Template is restored with all configuration
5. Verify:
   - Name matches
   - Description matches
   - Agent count matches
   - Features match

**Expected Results**:

- ✅ Export produces valid JSON
- ✅ JSON is human-readable
- ✅ Import recreates exactly
- ✅ All configuration preserved
- ✅ Agents are included/referenced correctly

**Feedback Questions**:

1. Is import/export workflow smooth?
2. Should exports include agent configurations inline?
3. Would you like a template marketplace?
4. What template metadata would be helpful?

---

### Scenario 18: Prompt Library Management

**Objective**: Organize reusable prompts

**Features Tested**:

- Prompt creation
- Variable usage
- Prompt categories
- Prompt reuse

**Steps**:

1. Navigate to **Prompt Library** (`/agents/prompts`)
2. Click **➕ New Prompt**
3. Create "Tone of Voice" prompt:
   - Name: "Professional but Accessible Tone"
   - Category: "Tone"
   - Content:
     ```
     Write in a professional but accessible tone:
     - Use clear, jargon-free language
     - Active voice preferred
     - Conversational but authoritative
     - Targeted to {{audience}}
     - Purpose: {{purpose}}
     ```
4. Save - Variables auto-detected
5. Create "Research Template" prompt:
   - Name: "Comprehensive Research Structure"
   - Category: "Workflow"
   - Content:

     ```
     Research {{topic}} thoroughly:

     1. Key Facts & Statistics
     2. Industry Trends
     3. Expert Opinions
     4. Case Studies
     5. Counterarguments

     Focus areas: {{focus_areas}}
     Target depth: {{depth}}
     ```

6. Save
7. Now use prompts:
   - Create new agent
   - In system prompt field, click **Prompt Library** button
   - Select "Professional but Accessible Tone"
   - Prompt is inserted with variables
   - Fill in variables manually or leave as-is
8. Create workspace run:
   - In Starting Prompt field, use library
   - Select "Comprehensive Research Structure"
   - Variables inserted

**Expected Results**:

- ✅ Prompts save with variables
- ✅ Variables are detected automatically
- ✅ Prompts can be inserted anywhere
- ✅ Variables can be filled at use-time
- ✅ Prompt library is searchable

**Feedback Questions**:

1. Is variable syntax (`{{var}}`) intuitive?
2. Would you like prompt versioning?
3. Should prompts support default values for variables?
4. What other metadata would help organize prompts?

---

### Scenario 19: Coaching Agent Templates

**Objective**: Deploy and use the new business coaching agent templates

**Features Tested**:

- 6 new coaching/business agent templates
- Template instantiation with pre-configured prompts and models
- Using coaching agents in sequential workflows

**Steps**:

1. Navigate to **Agents** page
2. Click **📋 From Template**
3. Browse the new coaching templates:
   - **Agency & Urgency Coach** — helps define immediate action plans
   - **Planning & Prioritization Coach** — structures priorities and weekly plans
   - **Offer & Positioning Coach** — refines value proposition and messaging
   - **Marketing & Content Pipeline Coach** — plans content strategy
   - **Sales Pipeline & Deal Coach** — structures sales processes
   - **LinkedIn Post Critic** — reviews and improves LinkedIn content
4. Create one of each template agent
5. Verify each agent's configuration:
   - System prompt is detailed and domain-specific
   - Model and temperature are set appropriately
   - Role is set correctly (varies by template)
6. Create a workspace: "Business Coaching Suite"
   - Add: Agency Coach, Planning Coach, Offer Coach
   - Workflow: Sequential
   - Run with goal: "I'm a solo consultant launching a new AI advisory practice. Help me build an actionable plan."
7. Observe each coach contributing domain-specific advice

**Expected Results**:

- ✅ All 6 coaching templates are available in the template selector
- ✅ Each instantiates with a detailed, multi-section system prompt
- ✅ Agents provide focused, domain-specific coaching responses
- ✅ Sequential workflow passes context between coaches

**Feedback Questions**:

1. Are the coaching agent prompts realistic and useful?
2. Which coaching areas would you add next?
3. Would coaching templates benefit from tool access (e.g. web search)?
4. Is the sequential flow natural for coaching scenarios?

---

## Edge Case & Error Scenarios

### Scenario 20: Handling Run Failures

**Objective**: Test error handling and recovery

**Features Tested**:

- Error detection
- Error display
- Retry mechanism
- Partial results

**Steps**:

1. Create agent with invalid configuration:
   - Set temperature to 5.0 (invalid, max is 2.0)
     OR
   - Use model that requires API key you don't have
2. Create workspace with this agent
3. Run workspace
4. Observe failure:
   - Status changes to "Failed"
   - Error message appears
   - Error category shown (e.g., "validation", "auth")
5. Click **▼ Error Details** to see:
   - Error type
   - Error message
   - Which step failed
   - Stack trace (if applicable)
6. Fix the issue:
   - Edit agent to correct temperature
     OR
   - Add API key in Settings
7. Click **Retry** on run
8. Run completes successfully

**Expected Results**:

- ✅ Errors are caught and displayed clearly
- ✅ Error messages are actionable
- ✅ Failed runs can be retried
- ✅ Partial results are preserved
- ✅ Error categories help diagnosis

**Feedback Questions**:

1. Are error messages helpful?
2. Is retry obvious and easy?
3. Should system auto-retry transient errors?
4. What error details are most useful?

---

### Scenario 21: Infinite Loop Prevention

**Objective**: Test max iteration safety limit

**Features Tested**:

- Iteration counting
- Max iteration enforcement
- Loop detection
- Graceful termination

**Steps**:

1. Create graph workflow with intentional loop:
   - Node A: Agent produces output
   - Node B: Always routes back to Node A
   - No exit condition
2. Set **Max Iterations: 5** (low for testing)
3. Run workflow
4. Watch iterations:
   - Step 1: A → B → A
   - Step 2: A → B → A
   - Step 3: A → B → A
   - Step 4: A → B → A
   - Step 5: A → B → A
5. On 6th iteration, run stops automatically
6. Status: "Failed" or "Paused"
7. Error: "Maximum iterations reached (5)"

**Expected Results**:

- ✅ System counts iterations
- ✅ Stops at exactly max iterations
- ✅ Error message is clear
- ✅ Partial results are accessible
- ✅ User is not charged for runaway loops

**Feedback Questions**:

1. Is max iterations clear when setting up?
2. Should system warn about potential loops?
3. What's a reasonable default max iterations?
4. Should different workflow types have different defaults?

---

### Scenario 22: Memory Limit Effects

**Objective**: Understand memory/context tradeoffs

**Features Tested**:

- Memory limit configuration
- Context truncation
- Performance impact
- Cost impact

**Steps**:

1. Create workspace: "Memory Test"
2. Add agent: "Summarizer" (simple task)
3. **Test A: Low Memory**
   - Memory Limit: 10 messages
   - Run with long, complex goal (500 words)
   - Observe: Fast, cheap, but may lose context
4. **Test B: High Memory**
   - Memory Limit: 200 messages
   - Run with same goal
   - Observe: Slower, more expensive, better context
5. Compare:
   - Execution time
   - Token usage
   - Output quality
   - Cost

**Expected Results**:

- ✅ Low memory = faster, cheaper, less context
- ✅ High memory = slower, pricier, more context
- ✅ Token count reflects memory setting
- ✅ Quality difference is noticeable for complex tasks

**Feedback Questions**:

1. Is memory limit impact clear?
2. Should system recommend memory based on task?
3. Would you like memory usage visualization?
4. How do you decide optimal memory limit?

---

## Search Tool Scenarios

### Scenario 23: Configure Search Tool API Keys

**Objective**: Set up and test search tool API keys in Settings

**Features Tested**:

- Search Tool Keys settings panel
- Key storage in Firestore
- Test connection functionality
- Key priority chain (user key → system key)

**Steps**:

1. Navigate to **Settings** page (`/settings`)
2. Scroll to **Intelligence** section
3. Find **Search Tools** panel (below AI Provider Keys)
4. For each tool (Serper, Firecrawl, Exa, Jina Reader):
   - Note the status indicator (Connected / Inactive)
   - Enter your API key in the password field
   - Click **Save**
   - Status should change to "Connected" (green dot)
   - Click **Test** button
   - Observe: Loading spinner → success (green ✓) or failure (red ✗)
5. Test key removal:
   - Click **Clear** on any saved key
   - Status reverts to "Inactive"
   - Test button disappears (no key to test)
6. Test invalid key:
   - Enter "invalid-key-12345" for Serper
   - Save and click Test
   - Should show red ✗ with error message (e.g., "401 Unauthorized")

**Expected Results**:

- ✅ Search Tools panel appears in Settings
- ✅ Keys save and persist across page reloads
- ✅ Status indicators update in real time
- ✅ Test button verifies key against the actual service
- ✅ Invalid keys show clear error messages
- ✅ Clearing a key removes it from Firestore

**Feedback Questions**:

1. Is the Search Tools section easy to find?
2. Are the tool descriptions helpful?
3. Is the Test button reassuring?
4. Would you like to see which tools require keys vs. which are free?

---

### Scenario 24: Quick Search Workspace

**Objective**: Test the Quick Search workspace template for fast sourced answers

**Features Tested**:

- Quick Search Analyst agent
- `serp_search` tool (Serper)
- `read_url` tool (Jina Reader)
- Concise output with citations

**Prerequisites**: Serper API key configured in Settings (or system key available)

**Steps**:

1. Navigate to **Workspaces** page → **Templates** tab
2. Find **"Quick Search"** template
3. Click **Use Template**
4. Workspace is created with 1 agent (Quick Search Analyst)
5. Click **▶️ Run Workspace**
6. Enter goal: "What are the key differences between React Server Components and traditional SSR?"
7. Click **Start Run**
8. Observe:
   - Agent uses `serp_search` to find relevant results
   - Agent may use `read_url` to extract content from top result
   - Response is concise (under 300 words) with citations
9. Check tool calls section for search results

**Expected Results**:

- ✅ Template instantiates with correct agent and tools
- ✅ Agent uses search tools to find current information
- ✅ Response is concise and directly answers the question
- ✅ Sources are cited with URLs
- ✅ Execution is fast (Gemini 1.5 Flash)

**Feedback Questions**:

1. Is the Quick Search workflow useful for ad-hoc questions?
2. Is the response quality sufficient for quick lookups?
3. Would you prefer more or fewer search results?
4. Is the citation format clear?

---

### Scenario 25: Deep Research Report Workspace

**Objective**: Test comprehensive multi-source research with critique and synthesis

**Features Tested**:

- Deep Research Analyst agent
- All 4 search tools (`serp_search`, `semantic_search`, `read_url`, `scrape_url`)
- Critical Reviewer agent
- Executive Synthesizer agent
- Sequential workflow (research → critique → synthesize)

**Prerequisites**: Search tool API keys configured (Serper, Exa at minimum)

**Steps**:

1. Navigate to **Workspaces** page → **Templates** tab
2. Find **"Deep Research Report"** template
3. Click **Use Template**
4. Workspace is created with 3 agents
5. Click **▶️ Run Workspace**
6. Enter goal:
   ```
   Research the current state of AI code assistants:
   - Market leaders and their capabilities
   - Pricing and business models
   - Developer satisfaction and adoption rates
   - Emerging trends and future directions
   ```
7. Click **Start Run**
8. Observe the 3-stage workflow:
   - **Stage 1**: Deep Research Analyst searches multiple sources using different tools
   - **Stage 2**: Critical Reviewer evaluates findings for gaps, bias, and quality
   - **Stage 3**: Executive Synthesizer produces a structured final report
9. Review final output for structure, citations, and confidence levels

**Expected Results**:

- ✅ Research Analyst uses multiple search strategies (SERP + semantic)
- ✅ Full pages are read for deep content extraction
- ✅ Critical Reviewer identifies gaps and suggests improvements
- ✅ Synthesizer produces a well-structured report
- ✅ Multiple sources are cited throughout
- ✅ Output includes confidence levels where appropriate

**Feedback Questions**:

1. Does multi-tool research produce better results than single-tool?
2. Is the critique stage valuable?
3. Is the final synthesis well-structured?
4. How does this compare to manual research?

---

## Real-World Use Cases

### Use Case 1: Business Plan Development

**Objective**: Create comprehensive business plan

**Workflow**: Project Plan Builder template (supervisor workflow)

**Agents**:

- Project Planning Coordinator (role: Supervisor — orchestrator)
- Project Structure Planner
- Task Breakdown Specialist
- Risk Analyst
- Plan Quality Reviewer
- Financial Analyst (added manually)

**Configuration**:

- Workflow: Supervisor (coordinator delegates to specialists)
- Expert Council: Enabled (Quick mode)
- Project Manager: Deep questioning
- Memory: 100 messages

**Steps**:

1. Use "Project Plan Builder" template
2. Add Financial Analyst agent
3. Run with goal:
   ```
   Create business plan for AI-powered meal planning app:
   - Target market: Health-conscious millennials
   - Revenue model: Freemium subscription
   - Key features: Personalized recipes, grocery lists, nutrition tracking
   - Team: 2 founders + $500K funding
   - Timeline: 12-month roadmap to product-market fit
   ```
4. Project Manager asks detailed questions
5. Agents collaborate to produce:
   - Executive summary
   - Market analysis
   - Product roadmap
   - Financial projections
   - Risk assessment
   - Go-to-market strategy

**Expected Output**:

- Comprehensive 20-30 page business plan
- Validated by multiple perspectives
- Realistic timeline and budget
- Identified risks with mitigation

**Success Metrics**:

- Plan is actionable
- Financial projections are realistic
- Risks are thoroughly assessed
- All sections are cohesive

---

### Use Case 2: Technical Documentation Creation

**Objective**: Generate API documentation

**Workflow**: Sequential with technical focus

**Agents**:

- API Analyst (understands API structure)
- Technical Writer (Gemini 1.5 Pro)
- Code Example Generator (Grok Code Fast)
- Editor

**Configuration**:

- Workflow: Sequential
- Memory: 100 messages
- No Expert Council (straightforward task)

**Steps**:

1. Create custom workspace
2. Run with goal:
   ```
   Document our REST API with 15 endpoints for user management,
   project management, and analytics. Include:
   - Endpoint descriptions
   - Parameters (required/optional)
   - Request/response examples
   - Error codes
   - Authentication flow
   - Rate limits
   ```
3. API Analyst structures documentation
4. Technical Writer produces clear explanations
5. Code Example Generator creates examples in 5 languages
6. Editor polishes for clarity

**Expected Output**:

- Complete API reference
- Code examples in Python, JavaScript, Ruby, Go, Java
- Clear authentication guide
- Error handling documentation

**Success Metrics**:

- Developer can integrate without asking questions
- Examples are copy-paste ready
- All endpoints documented
- Clear, concise language

---

### Use Case 3: Market Research Report

**Objective**: Comprehensive competitive analysis

**Workflow**: Parallel analysis with synthesis

**Agents**:

- Market Researcher (web search enabled)
- Competitive Analyst
- Trend Analyst (Grok 4 for real-time data)
- Data Synthesizer

**Configuration**:

- Workflow: Parallel → Join → Synthesize
- Expert Council: Disabled (research task)
- Deep Research: Enabled

**Steps**:

1. Create parallel workflow
2. Run with goal:
   ```
   Analyze the project management software market:
   - Top 10 competitors
   - Market size and growth
   - Key differentiators
   - Pricing strategies
   - Customer segments
   - Emerging trends
   - Gaps and opportunities
   ```
3. Three agents work simultaneously:
   - Market Researcher: Market size, growth, segments
   - Competitive Analyst: Detailed competitor analysis
   - Trend Analyst: Emerging trends, future outlook
4. Join node combines findings
5. Data Synthesizer creates cohesive report

**Expected Output**:

- Executive summary
- Detailed competitor profiles
- Market size and growth projections
- Trend analysis
- Opportunity identification
- Strategic recommendations

**Success Metrics**:

- Data is current (within 30 days)
- Competitors accurately profiled
- Trends are actionable
- Opportunities are specific

---

### Use Case 4: Content Marketing Pipeline

**Objective**: Full content creation workflow

**Workflow**: Thought Leadership Writer template

**Agents**:

- Content Strategist
- SEO Researcher
- Content Writer
- Fact Checker (Claude Haiku)
- Editor (Gemini 1.5 Pro)
- SEO Optimizer

**Configuration**:

- Workflow: Sequential
- Expert Council: For headline approval
- Content Type: Blog Post
- Memory: 150 messages

**Steps**:

1. Use "Thought Leadership Writer" template
2. Run with goal:

   ```
   Create thought leadership post: "The Future of Remote Work:
   Beyond Zoom Fatigue to Async-First Culture"

   Target: HR leaders and executives
   Length: 1500-2000 words
   Tone: Authoritative but accessible
   Include: Data, expert quotes, actionable takeaways
   ```

3. Content Strategist defines positioning
4. SEO Researcher finds high-value keywords
5. Content Writer creates draft
6. Fact Checker validates all claims
7. Editor polishes prose
8. SEO Optimizer adds meta descriptions, headers, etc.
9. Expert Council approves headline

**Expected Output**:

- Publication-ready blog post
- SEO-optimized
- Fact-checked
- Engaging and informative
- Actionable takeaways

**Success Metrics**:

- Passes editorial standards
- SEO score > 80
- All facts cited
- Engaging headline
- Clear call-to-action

---

### Use Case 5: Product Launch Strategy

**Objective**: Plan complete product launch

**Workflow**: Complex graph with multiple paths

**Agents**:

- Product Manager (orchestrator)
- Market Researcher
- Positioning Specialist
- Marketing Strategist
- PR Specialist
- Sales Enablement Specialist
- Launch Coordinator

**Configuration**:

- Workflow: Graph (complex dependencies)
- Expert Council: For go/no-go decision
- Project Manager: Standard questioning
- Human Input: For milestone approvals
- Memory: 200 messages

**Steps**:

1. Create complex graph workflow:
   ```
   Product Manager → Market Research
                  ↓
   Positioning (Council approval) → Marketing Strategy
                                  ↓
   [Parallel]:
   - PR Plan
   - Sales Enablement
   - Launch Timeline
                                  ↓
   Join → Human Approval → Launch Coordinator
   ```
2. Run with goal:
   ```
   Plan launch for AI-powered customer service platform:
   - B2B SaaS, mid-market target
   - Launch in Q2 2026
   - Competitive: Zendesk, Intercom, Freshdesk
   - Key differentiator: Advanced AI, 50% faster resolution
   - Budget: $200K for launch activities
   ```
3. Workflow executes:
   - Market research conducted
   - Positioning reviewed by Expert Council
   - Multi-track planning (PR, Sales, Timeline)
   - Human approval at key gates
   - Final coordinated launch plan

**Expected Output**:

- Complete launch plan with:
  - Positioning statement
  - Target customer profiles
  - Marketing campaign plan
  - PR timeline and materials
  - Sales enablement kit
  - Launch day checklist
  - Success metrics
  - Budget allocation

**Success Metrics**:

- All launch elements coordinated
- Timeline is realistic
- Budget is allocated effectively
- Risks are identified
- Ready for execution

---

### Use Case 6: Supervisor-Driven Project Triage

**Objective**: Use the supervisor workflow to triage and delegate a complex multi-domain request

**Workflow**: Supervisor Triage template (or custom supervisor workspace)

**Agents**:

- Project Coordinator (role: Supervisor)
- Research Specialist (role: Researcher)
- Technical Analyst (role: Executor)
- Report Writer (role: Synthesizer)

**Configuration**:

- Workflow: Supervisor
- Supervisor Agent: Project Coordinator
- Max Iterations: 10
- Memory: 100 messages

**Steps**:

1. Create a supervisor agent: "Project Coordinator" (role: Supervisor)
   - System prompt: "You are a project coordinator. Analyze the incoming request, break it into sub-tasks, delegate each to the appropriate specialist agent, validate their outputs, and synthesize a final deliverable."
2. Create 3 worker agents (Researcher, Technical Analyst, Report Writer)
3. Create workspace using **Supervisor** workflow type
4. Select all 4 agents, designate Project Coordinator as supervisor
5. Verify the hub-and-spoke preview shows correct topology
6. Run with goal:
   ```
   Evaluate whether our company should migrate from AWS to a multi-cloud
   strategy. Consider: cost analysis, technical complexity, security implications,
   team readiness, and a phased migration plan.
   ```
7. Observe supervisor execution:
   - Phase 1: Supervisor plans sub-tasks and delegates
   - Phase 2: Workers execute in parallel (research, technical analysis, writing)
   - Phase 3: Supervisor validates results and produces final synthesis
8. Review output: should be a coordinated deliverable, not fragmented

**Expected Output**:

- Structured report with sections from each specialist
- Supervisor's executive summary tying everything together
- Clear recommendations with supporting evidence from workers
- No redundancy between worker outputs (supervisor deduplicates)

**Success Metrics**:

- Supervisor correctly identifies and delegates sub-tasks
- Each worker contributes domain-specific expertise
- Final output is cohesive, not a simple concatenation
- Worker agent tools and descriptions are available to the supervisor

---

### Use Case 7: Dialectical Market Entry Analysis

**Objective**: Use Hegelian dialectical reasoning to analyze market entry strategy with balanced thesis-antithesis exploration

**Workflow**: Dialectical Reasoning (custom or template)

**Agents**:

- Market Analyst (thesis generator)
- Devil's Advocate (antithesis generator)
- Strategic Synthesizer (sublation/resolution)
- Knowledge Curator (hypergraph management)

**Configuration**:

- Dialectical Mode: Enabled
- Cycle Depth: 2 (allows refinement)
- Contradiction Tracking: All 4 types enabled
- Multi-Model Synthesis: Optional (GPT-4.1 thesis, Claude antithesis)

**Steps**:

1. Create a dialectical workspace with 4 agents configured as above
2. Enable contradiction visualization in workspace settings
3. Run with goal:
   ```
   Should our B2B SaaS company expand into the European market in 2026?
   Consider: regulatory environment (GDPR, AI Act), competitive landscape,
   localization costs, partnership opportunities, and timing risks.
   ```
4. Observe Phase 1 - Market Analyst generates thesis:
   - Opportunity size and growth projections
   - Strategic timing arguments
   - Competitive advantages
5. Observe Phase 2 - Devil's Advocate generates antithesis:
   - Regulatory compliance costs
   - Localization challenges
   - Market saturation risks
6. Watch contradiction detection identify conflicts:
   - PRAGMATIC: Cost of entry vs. revenue projections
   - BOUNDARY: EU-wide strategy vs. country-specific approaches
   - LOGIC: "First mover advantage" vs. "Let competitors validate market"
7. Observe sublation phase synthesize:
   - Phased entry strategy (resolve timing contradiction)
   - Country prioritization framework (resolve boundary contradiction)
   - Risk-adjusted financial model (resolve pragmatic contradiction)
8. Verify knowledge integration adds insights to hypergraph
9. Review final recommendation with confidence scores

**Expected Output**:

- Balanced analysis covering both opportunity and risk
- Clear contradiction identification with resolution strategies
- Phased market entry recommendation with conditions
- Evidence-linked claims for each major point
- Decision framework usable for future market evaluations

**Success Metrics**:

- At least 3 contradictions detected and processed
- Synthesis includes conditions/triggers for action
- Knowledge graph updated with market analysis framework
- Final output acknowledges unresolved tensions as monitoring items
- Cost breakdown shows per-phase token usage

---

## Channel Connection Scenarios

### Scenario 39: Connect LinkedIn Channel

**Objective**: Set up a LinkedIn channel connection using cookie-based authentication

**Features Tested**:

- Channel Connections panel in Settings
- LinkedIn Settings Panel (credential input form)
- Backend credential validation via Voyager API
- Real-time connection status updates

**Prerequisites**: Active LinkedIn account with valid session

**Steps**:

1. Navigate to **Settings** > **Channel Connections**
2. Expand the **LinkedIn** channel row
3. Observe the LinkedIn Settings Panel with:
   - `li_at Cookie` field (required, password input)
   - `CSRF Token` field (optional, password input)
   - Help accordion with cookie extraction instructions
4. Open browser DevTools on LinkedIn, copy the `li_at` cookie value
5. Paste the cookie into the `li_at Cookie` field
6. Optionally enter the CSRF token
7. Click **Connect**
8. Wait for credential validation (backend calls Voyager `/me` API)

**Expected Results**:

- ✅ LinkedIn row is expandable (no longer "Coming Soon")
- ✅ Help accordion shows step-by-step DevTools instructions
- ✅ Password input masks cookie value
- ✅ Successful validation stores connection in Firestore
- ✅ Connected state shows masked cookie, green StatusDot, "Test" and "Disconnect" buttons
- ✅ Channel status in the row updates to "Connected" with connection summary
- ✅ Invalid/expired cookie returns 400 error with "invalid or expired" message

**Feedback Questions**:

1. Are the cookie extraction instructions clear enough?
2. Is the connected state informative?
3. Does the expired session warning ("Expired" badge) help users understand they need to re-authenticate?

---

### Scenario 40: Connect Telegram Channel

**Objective**: Connect a Telegram bot using a BotFather token

**Features Tested**:

- Telegram Settings Panel (bot token form)
- Token format validation (client-side regex)
- Backend validation via Telegram Bot API `getMe`
- Bot username display after connection

**Prerequisites**: Telegram bot created via @BotFather

**Steps**:

1. Navigate to **Settings** > **Channel Connections**
2. Expand the **Telegram** channel row
3. Observe the Telegram Settings Panel with:
   - `Bot Token` field (required, password input, monospace)
   - Help accordion with BotFather setup steps
4. Enter an invalid token format (e.g., "not-a-token")
5. Observe client-side validation error
6. Enter a valid bot token from BotFather (format: `123456:ABC-DEF...`)
7. Click **Connect**
8. Wait for backend to call Telegram `getMe` API

**Expected Results**:

- ✅ Telegram row is expandable (no longer "Coming Soon")
- ✅ Client-side regex validates token format `/^\d+:[A-Za-z0-9_-]+$/`
- ✅ Invalid format shows inline error before submission
- ✅ Successful validation returns bot username (e.g., `@MyBot`)
- ✅ Connected state shows bot username, green StatusDot, Test/Disconnect buttons
- ✅ "Test" button re-validates token by calling `getMe` again
- ✅ Invalid token returns 400 error from backend

**Feedback Questions**:

1. Is the BotFather setup guide helpful for first-time users?
2. Is the bot username display clear after connection?
3. Does the token format validation catch mistakes early enough?

---

### Scenario 41: Connect WhatsApp Channel

**Objective**: Connect WhatsApp via companion service and QR code pairing

**Features Tested**:

- WhatsApp Settings Panel (companion URL + QR flow)
- QR code generation from companion service
- Status polling during pairing
- Companion service health check

**Prerequisites**: WhatsApp companion service deployed (see help accordion for deployment instructions)

**Steps**:

1. Navigate to **Settings** > **Channel Connections**
2. Expand the **WhatsApp** channel row
3. Observe the WhatsApp Settings Panel with:
   - `Companion Service URL` field (required, URL input)
   - `Phone Number` field (optional, for reference)
   - Help accordion with companion deployment instructions
4. Enter the companion service URL (e.g., `https://wa-companion.example.com`)
5. Optionally enter your phone number for reference
6. Click **Pair Device**
7. Observe QR code displayed in the panel
8. Scan the QR code with WhatsApp on your phone (Linked Devices)
9. Wait for status polling (every 3 seconds) to detect successful pairing
10. Observe automatic connection creation after pairing succeeds

**Expected Results**:

- ✅ WhatsApp row is expandable (no longer "Coming Soon")
- ✅ URL validation rejects invalid URLs
- ✅ QR code appears after clicking "Pair Device"
- ✅ "Waiting for scan..." pulsing animation visible during polling
- ✅ QR code expires after 2 minutes with auto-cleanup
- ✅ Successful scan creates connection in Firestore
- ✅ Connected state shows green StatusDot, Test/Disconnect buttons
- ✅ "Save Without Pairing" fallback stores connection without QR flow
- ✅ Companion service URL is validated via `/api/status` endpoint

**Feedback Questions**:

1. Is the QR code large and clear enough to scan easily?
2. Is the 2-minute expiry reasonable?
3. Are the companion service deployment instructions adequate?
4. Is the "Save Without Pairing" fallback useful for advanced users?

---

### Scenario 42: Channel Connection Error Handling

**Objective**: Verify error handling across all channel connection flows

**Features Tested**:

- Missing credential validation (all channels)
- Network error handling
- Connection test/disconnect operations
- Unsupported source rejection

**Steps**:

1. **LinkedIn - Expired Cookie**:
   - Connect with a valid cookie, then wait for it to expire
   - Observe "Expired" badge appears on the connection
   - Click "Test" to re-validate — should show error status
   - Update the cookie to restore connection

2. **Telegram - Invalid Token**:
   - Try connecting with a revoked bot token
   - Observe backend returns 400 with validation error
   - Try connecting with correct token, then revoke it via BotFather
   - Click "Test" — should show disconnected status

3. **WhatsApp - Companion Offline**:
   - Enter a companion URL that is unreachable
   - Click "Pair Device" — should show connection error
   - Enter a valid URL but don't scan QR within 2 minutes
   - Observe QR expiry and cleanup

4. **Delete Connections**:
   - For each connected channel, click "Disconnect"
   - Confirm the connection is removed from Firestore
   - Channel status reverts to "Not connected"

**Expected Results**:

- ✅ Missing required fields return 400 with descriptive error message
- ✅ Expired credentials are detected and surfaced to the user
- ✅ Network errors are caught and displayed (not silent failures)
- ✅ Delete operation removes the connection document
- ✅ Channel panel reverts to the credential input form after disconnect
- ✅ Each channel validates its specific required credentials:
  - LinkedIn: `li_at` cookie
  - Telegram: `botToken`
  - WhatsApp: `companionServiceUrl`

**Feedback Questions**:

1. Are error messages clear and actionable?
2. Is the expired credential flow intuitive (detect → notify → re-authenticate)?
3. Does the disconnect flow feel safe (confirmation prompt)?

---

## Workspace Template Scenarios

### Scenario 26: Deep Research Template

**Objective**: Test the iterative deep research workflow with parallel search, fact checking, and human review

**Prerequisites**: Google account connected (for real-time search); Serper, Exa API keys configured in Settings

**Tools Used**: `serp_search`, `semantic_search`, `read_url`, `scrape_url`

**Steps**:

1. Go to **Workspaces** > **Create from Template**
2. Select **"Deep Research"** template
3. Review the pre-configured agents (8 agents, including coordinator, SERP/semantic searchers, compiler, evaluator, fact checker)
4. Review the graph: coordinator > human confirm > 4 parallel searchers > join > compiler > evaluator > (ITERATE loop or COMPLETE > fact checker > human review > end)
5. Click **Create Workspace**
6. Start a run with: _"Research the impact of AI on healthcare diagnostics"_
7. When prompted at "Confirm Assumptions", review the coordinator's research plan and confirm
8. Observe the parallel search phase (4 agents searching simultaneously)
9. Watch the compiler synthesize results and the evaluator decide ITERATE or COMPLETE
10. If ITERATE, observe the loop back to searchers
11. Once COMPLETE, review the fact checker's output
12. At "Review Final Report", approve or provide feedback

**Expected Results**:

- 8 agents are created from templates with correct models and tools
- Graph renders with loop edges (evaluator back to searchers)
- Human input nodes pause the workflow for user confirmation
- Parallel fan-out to 4 searchers works correctly
- Join node combines all research outputs
- Loop respects limits (maxNodeVisits: 12, maxEdgeRepeats: 10)
- Final report includes citations and confidence levels

---

### Scenario 27: Normal Research Template

**Objective**: Test the 4-way parallel fan-out research workflow (custom/visual builder type)

**Prerequisites**: Same as Scenario 26

**Tools Used**: `serp_search`, `semantic_search`, `read_url`, `get_current_time`

**Steps**:

1. Create workspace from **"Normal Research"** template
2. Note the workflow type is **custom** (visual builder)
3. Click **"Open Visual Builder"** to see the workflow graph visually
4. Observe the fan-out: start trigger > 4 parallel researchers > join > synthesizer > end
5. Close the builder and start a run: _"What are the latest developments in quantum computing?"_
6. Observe all 4 researchers running in parallel (Quick SERP, Deep SERP, Semantic, News)
7. Watch the thinking-model synthesizer combine outputs

**Expected Results**:

- Visual builder shows clean 4-way fan-out pattern
- All 4 research agents execute in parallel
- Join node uses `synthesize` aggregation mode
- Research Synthesizer (o3) produces unified report with confidence levels
- Total run completes within maxIterations: 10

---

### Scenario 28: Project Plan Builder Template

**Objective**: Test iterative planning with gap research and multi-provider evaluation

**Tools Used**: `serp_search`, `read_url`

**Steps**:

1. Create workspace from **"Project Plan Builder"** template
2. Review the graph: planner > evaluator > (NEEDS_WORK: gap researcher > planner loop | COMPLETE: improvement > quality review > end)
3. Start run: _"Plan a mobile app for personal finance tracking"_
4. Observe the planner creating initial structure
5. Watch evaluator assess completeness — may trigger NEEDS_WORK loop
6. If looped, observe gap researcher filling knowledge gaps
7. Once COMPLETE, watch improvement and quality review agents refine

**Expected Results**:

- Iterative loop between evaluator and planner works (maxEdgeRepeats: 3)
- Multi-provider agents: OpenAI (planner, evaluator), Google (gap researcher), Anthropic (improvement)
- Final plan includes chapters, milestones, risk assessment, and quality score

---

### Scenario 29: Data Scraper Template

**Objective**: Test parallel scraping with dedup and structured storage (custom/visual builder type)

**Tools Used**: `serp_search`, `read_url`, `scrape_url`, `create_note`, `create_topic`

**Steps**:

1. Create workspace from **"Data Scraper"** template
2. Note the workflow type is **custom** — open the visual builder to see fan-out
3. Start run: _"Find 50 senior product manager job descriptions from tech companies"_
4. Watch coordinator plan 10-20 search queries and partition into 3 groups
5. Observe 3 scraper agents running in parallel
6. Watch join node deduplicate results
7. Observe storage agent creating a topic and storing items as notes

**Expected Results**:

- 3-way parallel fan-out visible in visual builder
- Join uses `dedup_combine` aggregation
- Storage agent creates a topic (e.g., "PM Job Descriptions") and individual notes
- Notes are searchable in the Notes section after the run

---

### Scenario 30: Large Document Reviewer Template

**Objective**: Test PDF parsing, parallel chapter analysis, and knowledge graph building

**Prerequisites**: A PDF document to upload (100+ pages recommended)

**Tools Used**: `parse_pdf`, `create_note`, `create_topic`, `analyze_note_paragraphs`, `tag_paragraph_with_note`

**Steps**:

1. Create workspace from **"Large Document Reviewer"** template
2. Review the graph: chunker > 3 parallel analysts > join > note creator (Knowledge Manager) > synthesizer > end
3. Upload a PDF and start the run
4. Watch the chunker parse the PDF and divide into 3 analysis chunks
5. Observe 3 Chapter Analysts analyzing their chunks in parallel
6. Watch the Knowledge Manager create topics, notes, and knowledge graph connections
7. Review the Synthesis Agent's cross-chapter summary

**Expected Results**:

- `parse_pdf` tool extracts text from uploaded PDF
- 3-way parallel chapter analysis works
- Knowledge Manager creates topics and tagged notes (visible in Notes section)
- Document Synthesis Agent identifies cross-chapter themes and contradictions
- Handles large documents (500K char truncation if needed)

---

### Scenario 31: Transcript Action Extractor Template

**Objective**: Test transcript parsing, todo creation, and optional calendar scheduling with human input

**Tools Used**: `parse_pdf`, `create_todo`, `create_note`, `list_calendar_events`, `create_calendar_event`, `get_current_time`

**Steps**:

1. Create workspace from **"Transcript Action Extractor"** template
2. Review the graph: parser > prioritizer > todo creator > human calendar > (yes: scheduler > end | no: end)
3. Paste or upload a meeting transcript and start the run
4. Watch the parser extract speakers, decisions, and action items
5. Observe the prioritizer assigning urgency and time estimates
6. Check that todo items appear in your task list
7. At "Calendar Preferences" human input, choose "yes" to schedule or "no" to skip
8. If yes, watch the scheduler create calendar blocks respecting your constraints

**Expected Results**:

- Action items extracted accurately with owners and deadlines
- Todo items created with correct urgency levels (visible in Planner)
- Meeting summary note created
- Human input node presents yes/no branching correctly
- Calendar events respect existing schedule (no double-booking)

---

### Scenario 32: Block Calendar Template

**Objective**: Test todo review and calendar scheduling workflow with human constraint gathering

**Prerequisites**: Existing todos with due dates in Planner; Google Calendar connected

**Tools Used**: `list_todos`, `get_current_time`, `list_calendar_events`, `create_calendar_event`

**Steps**:

1. Ensure you have some overdue or this-week todos in Planner
2. Create workspace from **"Block Calendar"** template
3. Review the simple graph: todo reviewer > human constraints > scheduler > end
4. Start the run
5. Watch the Todo Review Agent list overdue and upcoming tasks with time estimates
6. At "Scheduling Preferences", provide constraints (e.g., "Max 4 hours/day, no meetings before 10am, avoid lunch 12-1")
7. Watch the scheduler create calendar blocks

**Expected Results**:

- Todo Review Agent finds overdue and this-week tasks from your Planner
- Time estimates are reasonable
- Human input pauses for constraint gathering
- Calendar blocks appear on your Google Calendar
- Existing events are not overlapped
- High-urgency/overdue items get earliest slots

---

### Scenario 33: Gmail Review Template

**Objective**: Test email scanning, smart filtering, summarization, and action extraction

**Prerequisites**: Google account connected with Gmail access; `gmail.readonly` OAuth scope granted

**Tools Used**: `list_gmail_messages`, `read_gmail_message`, `query_firestore`, `create_todo`, `create_note`, `list_calendar_events`, `create_calendar_event`, `get_current_time`

**Steps**:

1. Create workspace from **"Gmail Review"** template
2. Review the graph: scanner > summarizer > human actions > (schedule: scheduler > end | done: end)
3. Start the run
4. Watch the Email Scanner (gpt-4.1-nano, fast/cheap) list recent emails and classify by subject/sender
5. Observe it filtering out spam, promotions, and automated notifications
6. Watch the Summarizer read full bodies of important emails only
7. Check that a summary note and todo items are created
8. At "Review Actions", choose "schedule" to block calendar time or "done" to finish
9. If scheduling, watch the Calendar Scheduler create events

**Expected Results**:

- Scanner uses gpt-4.1-nano for cost efficiency (only reads subject/sender)
- Spam/promo emails correctly filtered as "skip"
- Only important emails have bodies read (cost optimization)
- Summary note created with all email summaries
- Action items become todos in Planner
- Calendar events created for time-sensitive items
- Already-processed emails tracked (won't be re-processed on next run)

---

### Scenario 34: Dialectical Reasoning Template

**Objective**: Test the research-first Hegelian dialectical reasoning template with multi-model thesis generation, full 6-phase cycle, and iterative loops

**Prerequisites**:

- API keys configured for at least 3 providers (Anthropic, OpenAI, Google)
- Search tool API keys configured (Serper at minimum; Exa and Jina recommended)

**Tools Used**: `serp_search`, `semantic_search`, `read_url`, `search_web`, `search_scholar`

**Steps**:

1. Go to **Workspaces** > **Create from Template**
2. Select **"Dialectical Reasoning"** template
3. Review the pre-configured agents (5 agents):
   - **Dialectical Economic Thesis Agent (Anthropic)** — `thesis_generator` role, Claude Sonnet 4.5, tools: `serp_search`, `semantic_search`, `read_url`
   - **Dialectical Systems Thesis Agent (OpenAI)** — `thesis_generator` role, GPT-5.2, tools: `serp_search`, `search_web`, `search_scholar`
   - **Dialectical Adversarial Thesis Agent (Google)** — `thesis_generator` role, Gemini 2.5 Pro, tools: `serp_search`, `semantic_search`, `search_scholar`
   - **Dialectical Synthesis Agent (Thinking)** — `synthesizer` role, o1, no tools
   - **Dialectical Meta-Reflection Agent (Thinking)** — `meta_reflection` role, Claude Opus 4.6, no tools
4. Verify workflow type is **dialectical** (no custom graph needed — the executor builds the 6-phase cycle automatically)
5. Click **Create Workspace**
6. Start a run with a strategic question:
   ```
   Should enterprise companies adopt AI agents for customer support in 2026?
   Consider: cost implications, customer satisfaction risks, regulatory
   compliance, competitive pressure, and workforce transition.
   ```
7. Observe **Phase 1 — Retrieve Context**: On first cycle, passes through (no knowledge graph yet)
8. Observe **Phase 2 — Generate Theses** (3 agents in parallel):
   - **Economic Agent** (Anthropic): Calls `serp_search` and `semantic_search` to find current cost data, ROI studies, and market analysis. Then generates an economic thesis with concept graph, causal model, and confidence score
   - **Systems Agent** (OpenAI): Calls `serp_search` and `search_web` to find system dynamics, adoption patterns, and feedback loops. Then generates a systems thesis
   - **Adversarial Agent** (Google): Calls `serp_search` and `search_scholar` specifically searching for _failures, criticisms, and counter-evidence_. Then generates an adversarial thesis highlighting risks
9. Verify each thesis includes:
   - Research findings with cited URLs
   - Concept graph entries (A → B: relationship)
   - Falsification criteria
   - Decision implications
   - Confidence score (0.0–1.0)
10. Observe **Phase 3 — Cross-Negation**: Each thesis negated by another agent using typed rewrite operators (SPLIT, MERGE, REVERSE_EDGE, ADD_MEDIATOR, SCOPE_TO_REGIME, TEMPORALIZE)
11. Observe **Phase 4 — Crystallize Contradictions**: 4 algorithmic trackers identify conflicts:
    - LOGIC: Mutually exclusive claims (e.g., "AI reduces costs" vs "AI increases costs in year 1")
    - PRAGMATIC: Action conflicts (e.g., "deploy fast" vs "thorough testing required")
    - SEMANTIC: Different definitions (e.g., "customer satisfaction" measured differently)
    - BOUNDARY: Regime mismatches (e.g., claims valid for enterprise but not SMB)
12. Observe **Phase 5 — Sublation**: Synthesis Agent (o1) applies typed operators to create a higher-order understanding. Check scoring: parsimony (40%), scope (40%), novelty (20%)
13. Observe **Phase 6 — Meta-Reflection**: Meta-Reflection Agent (Claude Opus 4.6) evaluates:
    - Conceptual velocity (rate of new insights)
    - Contradiction density (unresolved conflicts per claim)
    - Decision: CONTINUE, TERMINATE, or RESPECIFY
14. If CONTINUE: Watch the cycle loop back to Phase 1, this time with an enriched knowledge graph. Thesis agents search again, potentially with refined queries
15. If TERMINATE: Review the final synthesis summary
16. Check the DialecticalCycleVisualization component for cycle metrics

**Expected Results**:

- ✅ 5 agents are created from templates with correct roles, models, and tools
- ✅ Template uses `workflowType: 'dialectical'` (no `workflowGraphTemplate` needed)
- ✅ Phase 2 shows all 3 thesis agents running in parallel
- ✅ Each thesis agent calls at least 2 search tools before generating its thesis (research-first protocol)
- ✅ Different agents use different tool combinations for information diversity:
  - Economic: `serp_search` + `semantic_search` + `read_url`
  - Systems: `serp_search` + `search_web` + `search_scholar`
  - Adversarial: `serp_search` + `semantic_search` + `search_scholar`
- ✅ Research findings are cited with URLs in each thesis
- ✅ Multi-model heterogeneity (Anthropic, OpenAI, Google) produces genuinely different perspectives
- ✅ Cross-negation uses typed rewrite operators (not free-text critiques)
- ✅ At least 2 contradictions detected across the 4 tracker types
- ✅ Sublation produces novel claims and testable predictions
- ✅ Meta-reflection correctly decides CONTINUE or TERMINATE based on velocity
- ✅ If CONTINUE, cycle 2+ has richer context from the accumulated knowledge graph
- ✅ Total run completes within maxIterations: 30 (~5 full cycles)
- ✅ Run cost breakdown shows per-phase token usage
- ✅ Final output is a balanced, evidence-grounded analysis — not a compromise but a higher-order synthesis

**Feedback Questions**:

1. Does the research-first protocol produce more grounded theses compared to non-search dialectical runs?
2. Is multi-model heterogeneity visible in the diversity of perspectives?
3. Are the typed rewrite operators (SPLIT, MERGE, etc.) reflected in the synthesis output?
4. Does the adversarial agent find meaningfully different information by searching for counter-evidence?
5. Is the meta-reflection decision (CONTINUE vs TERMINATE) well-calibrated? Does it stop at the right time?
6. How does this template compare to the manual dialectical setup (Scenarios 35-38)?

---

## Hegelian Dialectical Scenarios

These scenarios test the advanced Hegelian dialectical reasoning architecture introduced in version 1.3.

### Scenario 35: Dialectical Cycle: Strategic Decision

**Objective**: Test the complete 6-phase dialectical reasoning cycle for strategic decision-making.

**Prerequisites**:

- Enable Dialectical Mode in Agent Builder
- Configure at least 2 AI providers (for multi-model synthesis)
- Have a research topic requiring balanced analysis

**Steps**:

1. Navigate to **Agents** page and create a new agent
2. Enable **"Dialectical Mode"** in the Agent Builder
3. Set the cycle depth to 2 (allows refinement cycles)
4. Enter a strategic question: _"Should we migrate from monolith to microservices?"_
5. Start the run and observe Phase 1 (Thesis Generation)
6. Watch Phase 2 (Antithesis Generation) - note how it generates counterarguments
7. Observe Phase 3 (Contradiction Detection) - see detected conflicts highlighted
8. Watch Phase 4 (Sublation) - observe synthesis of competing positions
9. Check Phase 5 (Knowledge Integration) - verify insights added to hypergraph
10. Review Phase 6 (Response Composition) - final balanced recommendation

**Expected Results**:

- All 6 phases complete successfully
- Thesis presents migration benefits (scalability, team autonomy, etc.)
- Antithesis presents valid concerns (complexity, distributed debugging, etc.)
- At least 2 contradictions detected (e.g., PRAGMATIC: cost vs benefit)
- Sublation produces nuanced recommendation with conditions
- Knowledge graph updated with decision framework
- Final response includes confidence score and evidence links
- Run cost breakdown shows per-phase token usage

---

### Scenario 36: Multi-Model Thesis Generation

**Objective**: Test thesis/antithesis generation using different AI models for diverse perspectives.

**Prerequisites**:

- Configure API keys for at least 3 providers (OpenAI, Anthropic, Google)
- Enable Dialectical Mode

**Steps**:

1. Create a Dialectical agent with **"Multi-Model Synthesis"** enabled
2. Configure model assignments:
   - Thesis: GPT-4.1 (analytical strength)
   - Antithesis: Claude Sonnet (nuanced reasoning)
   - Synthesis: Gemini 2.0 (integration capability)
3. Enter topic: _"Remote work vs office-first culture for startups"_
4. Start the run
5. Observe thesis generation using GPT-4.1
6. Watch antithesis generation switch to Claude Sonnet
7. Note the model indicator changes in the run log
8. Verify synthesis uses Gemini 2.0
9. Compare output quality with single-model approach

**Expected Results**:

- Model switching occurs visibly in run log
- Each model's strengths reflected in their phase outputs
- GPT-4.1 thesis is structured and analytical
- Claude antithesis shows nuanced counterpoints
- Gemini synthesis integrates both perspectives coherently
- Token costs distributed across providers
- No API errors during model switches

---

### Scenario 37: Contradiction Tracking & Resolution

**Objective**: Test the 4 contradiction tracker types and resolution strategies.

**Prerequisites**:

- Enable Dialectical Mode with contradiction tracking visible

**Steps**:

1. Create agent with **"Show Contradiction Details"** enabled
2. Enter complex topic: _"AI regulation: innovation vs safety"_
3. Start the run and observe contradiction detection phase
4. Look for **LOGIC** contradictions (mutually exclusive claims)
5. Look for **PRAGMATIC** contradictions (implementation conflicts)
6. Look for **SEMANTIC** contradictions (definition/framing conflicts)
7. Look for **BOUNDARY** contradictions (scope/context conflicts)
8. Observe resolution proposals for each type
9. Check which contradictions get resolved vs preserved as tensions
10. Verify the sublation phase addresses unresolved contradictions

**Expected Results**:

- At least 1 contradiction detected per tracker type (for complex topics)
- LOGIC tracker catches: "AI must be autonomous" vs "AI must be controlled"
- PRAGMATIC tracker catches: "Fast deployment" vs "Thorough testing"
- SEMANTIC tracker catches: Different definitions of "safety"
- BOUNDARY tracker catches: "National regulation" vs "Global AI systems"
- Resolution strategies applied (SYNTHESIS, HIERARCHY, CONTEXT_SPLIT, PRESERVE_TENSION)
- Unresolved tensions clearly marked in final output
- Contradiction visualization shows color-coded types

---

### Scenario 38: Knowledge Hypergraph Retrieval

**Objective**: Test the 4-layer knowledge hypergraph storage and retrieval.

**Prerequisites**:

- Complete at least 2 prior dialectical runs to populate the hypergraph
- Have runs on related topics for cross-referencing

**Steps**:

1. View the **Knowledge Graph** from the Agents page
2. Observe the 4 layers: Claims, Evidence, Relationships, Meta
3. Click on a claim node to see its evidence links
4. Check the hyperedge connecting multiple claims
5. Start a new dialectical run on a related topic
6. Observe "Retrieving relevant context..." during thesis generation
7. Watch the retrieval agent select from prior knowledge
8. Verify retrieved context appears in the run log
9. Check that prior contradictions inform current analysis
10. After completion, verify new nodes added to hypergraph

**Expected Results**:

- Graph visualization shows all 4 layers distinctly
- Claims layer contains thesis/antithesis statements
- Evidence layer links to sources and prior runs
- Relationship layer shows supports/contradicts edges
- Meta layer contains confidence scores and timestamps
- Retrieval finds 3-5 relevant prior insights
- Retrieved context improves output quality
- New run adds to graph (not duplicating existing nodes)
- Cross-topic insights discovered and utilized

---

## Automated Deep Research Scenarios

### Scenario 39: Deep Research KG + Dialectical Template

**Objective**: Test the full automated deep research pipeline — from template instantiation through search, claim extraction, KG construction, dialectical reasoning, gap analysis, and final answer generation.

**Features Tested**:

- Template instantiation with 9 agents and `deep_research` workflow type
- LangGraph-based multi-phase execution
- Knowledge Graph construction with claims, concepts, and causal links
- Multi-lens dialectical reasoning (economic, systems, adversarial)
- Budget-aware iteration with gap analysis
- Structured answer generation with source traceability

**Prerequisites**:

- At least one AI provider key (OpenAI, Anthropic, or Google)
- Search tool API keys configured (Serper recommended; Exa optional)
- Tools `serp_search`, `semantic_search`, `read_url` available

**Steps**:

1. Go to **Agents** > **Workflows** tab
2. Click **Create from Template**
3. Select **"Deep Research (KG + Dialectical)"**
4. Review the 9 pre-configured agents:
   - 4 research agents (Planner, Claim Extractor, Gap Analyst, Answer Generator)
   - 5 dialectical agents (Economic, Systems, Adversarial thesis + Synthesis + Meta-Reflection)
5. Verify workflow type is `deep_research` (not `graph` or `sequential`)
6. Click **Create Workspace**
7. Start a run with a research-worthy question:
   ```
   What are the long-term economic and societal implications
   of widespread AI adoption in healthcare diagnostics?
   ```
8. Observe the run log for phase events:
   - `deep_research_phase: search_planning` — query decomposition
   - `deep_research_phase: source_ingestion` — web/academic search execution
   - `deep_research_phase: claim_extraction` — atomic claims from sources
   - `deep_research_phase: dialectical` — multi-lens thesis generation and synthesis
   - `deep_research_phase: gap_analysis` — coverage gap identification
   - `deep_research_phase: answer_generation` — final report compilation
9. If gap analysis triggers a new iteration, observe the loop back to source ingestion
10. Wait for the final answer to be generated
11. Review the output: structured sections, confidence levels, citations

**Expected Results**:

- ✅ Template creates workspace with 9 agents and correct workflow type
- ✅ Run starts and progresses through named phases in the log
- ✅ Search planning produces diverse queries (SERP + semantic + academic)
- ✅ Claim extraction outputs atomic claims with evidence types and confidence scores
- ✅ Knowledge Graph nodes appear (claims, concepts, causal links)
- ✅ Dialectical phase produces thesis/antithesis/synthesis outputs
- ✅ Gap analysis identifies missing perspectives and generates follow-up queries
- ✅ Budget tracking prevents runaway costs (check `spentTokens`, `searchCallsUsed`)
- ✅ Final answer includes sections, confidence levels, and source bibliography
- ✅ Run completes with status `completed` (not stuck or errored)

**Feedback Questions**:

1. Are the phase transitions visible enough in the run log?
2. Is the final report structured clearly?
3. Does the dialectical reasoning add value over a simpler multi-source pipeline?
4. Is the budget control transparent enough?

---

### Scenario 40: Deep Research Budget Control

**Objective**: Verify that the budget system correctly limits execution and transitions between budget phases.

**Prerequisites**: Same as Scenario 39

**Steps**:

1. Create a workspace from **"Deep Research (KG + Dialectical)"** template
2. Start a run with a broad question that would require many iterations:
   ```
   Compare the educational philosophies of Montessori, Waldorf, Reggio Emilia,
   and traditional schooling across cognitive development, social skills,
   creativity, and long-term career outcomes.
   ```
3. Monitor the run log for budget-related events
4. Observe the budget phase transitions:
   - `full` → `reduced` → `minimal` as budget depletes
5. Check that the run terminates gracefully when budget is exhausted
6. Review the final answer — it should acknowledge remaining knowledge gaps

**Expected Results**:

- ✅ Run does not exceed configured budget (check `spentUsd` vs `maxBudgetUsd`)
- ✅ Gap iterations stop when budget is insufficient for another cycle
- ✅ Budget phase transitions are logged
- ✅ Final answer is generated even under budget pressure (minimal phase)
- ✅ Remaining gaps are disclosed in the output

---

### Scenario 41: Deep Research Knowledge Graph Inspection

**Objective**: Verify that the Knowledge Graph is populated correctly during a deep research run.

**Prerequisites**: Complete Scenario 39 first (need a completed deep research run)

**Steps**:

1. After a deep research run completes, navigate to the **Knowledge Graph** view
2. Inspect claim nodes — each should have:
   - Claim text (atomic assertion)
   - Confidence score (0.0–1.0)
   - Evidence type (empirical, theoretical, statistical, etc.)
   - Source episode link
3. Inspect concept nodes — extracted topics and domains
4. Inspect edges:
   - `supports` / `contradicts` between claims
   - `causal_link` for cause-effect relationships
   - `related_to` between concepts
5. Check that `SourceRecord` data is attached to source nodes
6. Verify no duplicate claims (normalized text deduplication)

**Expected Results**:

- ✅ Claim nodes contain structured metadata (confidence, evidence type, source quotes)
- ✅ Concept nodes represent key topics from the research
- ✅ Edge types include `supports`, `contradicts`, and `causal_link`
- ✅ Source traceability: every claim links back to its source document
- ✅ No duplicate claim nodes for the same assertion
- ✅ Graph is navigable and relationships make semantic sense

---

## Feedback Collection Framework

After each scenario, collect feedback on:

### Usability:

- Was the feature discoverable?
- Was the UI intuitive?
- Were instructions clear?
- What was confusing?

### Performance:

- Was response time acceptable?
- Were token costs reasonable?
- Did output quality justify cost?

### Functionality:

- Did it work as expected?
- Were there bugs or errors?
- What features are missing?
- What would improve workflow?

### Value:

- Is this feature useful?
- Would you use it regularly?
- What's the value proposition?
- How could it be more valuable?

---

## Issue Reporting Template

When providing feedback, please include:

```
**Scenario**: [Which scenario]
**Step**: [Which step]
**Issue Type**: Bug / Feature Request / Question / Suggestion
**Description**: [What happened]
**Expected**: [What should happen]
**Actual**: [What actually happened]
**Severity**: Critical / High / Medium / Low
**Screenshots**: [If applicable]
**Suggestions**: [How to improve]
```

---

## Next Steps

1. **Work through scenarios** in order (basic → advanced → use cases)
2. **Document feedback** using template above
3. **Experiment freely** - create your own scenarios
4. **Share creative uses** - what unique workflows did you build?
5. **Report issues** - help improve the system

---

_End of Test Scenarios. See main guide: [User Guide: Workspaces & Agents](./USER_GUIDE_WORKSPACES_AGENTS.md)_
