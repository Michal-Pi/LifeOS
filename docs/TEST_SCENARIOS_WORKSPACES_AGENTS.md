# Test Scenarios & Use Cases: AI Agents & Workspaces

**Version 1.1** | Last Updated: January 30, 2026

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

### Advanced Scenarios

8. [Expert Council Decision Making](#scenario-8-expert-council-decision-making)
9. [Project Manager Orchestration](#scenario-9-project-manager-orchestration)
10. [Deep Research Integration](#scenario-10-deep-research-integration)
11. [Prompt-to-Graph Workflow](#scenario-11-prompt-to-graph-workflow)

### Template & Management Scenarios

12. [Create and Share Templates](#scenario-12-create-and-share-templates)
13. [Import/Export Templates](#scenario-13-importexport-templates)
14. [Prompt Library Management](#scenario-14-prompt-library-management)

### Edge Case & Error Scenarios

15. [Handling Run Failures](#scenario-15-handling-run-failures)
16. [Infinite Loop Prevention](#scenario-16-infinite-loop-prevention)
17. [Memory Limit Effects](#scenario-17-memory-limit-effects)

### Search Tool Scenarios

18. [Configure Search Tool API Keys](#scenario-18-configure-search-tool-api-keys)
19. [Quick Search Workspace](#scenario-19-quick-search-workspace)
20. [Deep Research Report Workspace](#scenario-20-deep-research-report-workspace)

### Real-World Use Cases

21. [Business Plan Development](#use-case-1-business-plan-development)
22. [Technical Documentation Creation](#use-case-2-technical-documentation-creation)
23. [Market Research Report](#use-case-3-market-research-report)
24. [Content Marketing Pipeline](#use-case-4-content-marketing-pipeline)
25. [Product Launch Strategy](#use-case-5-product-launch-strategy)

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
   - Model: "gpt-4o"
   - Temperature: 0.4 (slightly creative but focused)
   - Max Tokens: 2000
5. Go to Tools tab:
   - Enable: `web_search`
6. Click **Save Agent**

**Expected Results**:

- ✅ Agent appears in agents list
- ✅ Agent card shows name, role badge, model, tools
- ✅ Can click Edit to modify

**Feedback Questions**:

1. Is the agent builder intuitive?
2. Are the model options clear?
3. Is system prompt editing comfortable?
4. Would you like prompt templates for common agent types?

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

1. Navigate to **Workspaces** page (`/workspaces`)
2. Click **➕ New Workspace**
3. Basic tab:
   - Name: "Simple Content Pipeline"
   - Description: "Research → Write → Edit"
4. Agents tab:
   - Select all 3 agents (checkboxes)
   - Default Agent: "Content Researcher"
5. Workflow tab:
   - Workflow Type: "Sequential"
   - Max Iterations: 10
6. Memory tab:
   - Memory Limit: 100
7. Click **Save Workspace**

**Expected Results**:

- ✅ Workspace appears in list
- ✅ Shows "3 agents"
- ✅ Shows "Sequential" badge
- ✅ Can click "Show Details"

**Feedback Questions**:

1. Is workspace creation straightforward?
2. Is the agent selection clear?
3. Would visual workflow preview help during creation?

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
3. Browse templates:
   - Look at "Strategic Planner"
   - Look at "Risk Analyst"
   - Look at "Real-Time News Analyst" (Grok 4)
4. Select **"Technical Documentation Writer"**
5. Click **Use Template**
6. Agent is created automatically
7. Optional: Click **Edit** to customize
   - Change name to "API Documentation Writer"
   - Modify system prompt to focus on API docs
   - Save

**Expected Results**:

- ✅ Template instantiates immediately
- ✅ Agent is fully configured
- ✅ Ready to use in workspaces
- ✅ Can be customized if needed

**Feedback Questions**:

1. Are templates discoverable?
2. Are template descriptions helpful?
3. Would you like more built-in templates?
4. Which template types would be most useful?

---

### Scenario 6: Building a Graph Workflow

**Objective**: Create complex workflow with branching

**Features Tested**:

- Graph workflow designer
- Node creation
- Edge connections
- Conditional routing

**Prerequisites**: Create agents:

- "Content Strategist"
- "SEO Analyst"
- "Technical Writer"
- "Creative Writer"

**Steps**:

1. Create new workspace: "Adaptive Content Creation"
2. Add all 4 agents
3. Workflow tab:
   - Type: "Graph"
4. In Graph Designer:
   - **Node 1**: Agent (Content Strategist) - "strategy"
   - **Node 2**: Agent (SEO Analyst) - "seo"
   - **Node 3**: Human Input - "choice"
     - Prompt: "Which style? A) Technical B) Creative"
   - **Node 4**: Agent (Technical Writer) - "technical"
   - **Node 5**: Agent (Creative Writer) - "creative"
   - **Node 6**: End - "done"
5. Connect edges:
   - strategy → seo (Always)
   - seo → choice (Always)
   - choice → technical (Condition: Contains "A" or "technical")
   - choice → creative (Condition: Contains "B" or "creative")
   - technical → done (Always)
   - creative → done (Always)
6. Save workspace

**Expected Results**:

- ✅ Graph displays visually
- ✅ Nodes show agent/type
- ✅ Edges show conditions
- ✅ Can drag nodes to rearrange
- ✅ Can edit nodes/edges

**Feedback Questions**:

1. Is the graph designer intuitive?
2. Are conditions easy to set up?
3. Would you like graph templates?
4. What other node types would be useful?

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

## Advanced Scenarios

### Scenario 8: Expert Council Decision Making

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
   - Chairman: "gpt-4o"
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

### Scenario 9: Project Manager Orchestration

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

### Scenario 10: Deep Research Integration

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

### Scenario 11: Prompt-to-Graph Workflow

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
   - Model: "gpt-4o"
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

### Scenario 12: Create and Share Templates

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

### Scenario 13: Import/Export Templates

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

### Scenario 14: Prompt Library Management

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

## Edge Case & Error Scenarios

### Scenario 15: Handling Run Failures

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

### Scenario 16: Infinite Loop Prevention

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

### Scenario 17: Memory Limit Effects

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

### Scenario 18: Configure Search Tool API Keys

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

### Scenario 19: Quick Search Workspace

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

### Scenario 20: Deep Research Report Workspace

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

**Workflow**: Project Plan Builder template

**Agents**:

- Project Manager (orchestrator)
- Strategic Planner
- Market Researcher
- Financial Analyst
- Risk Analyst
- Critical Reviewer

**Configuration**:

- Workflow: Graph with validation gates
- Expert Council: Enabled (Full mode)
- Project Manager: Deep questioning
- Memory: 150 messages

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
