# Complete User Guide: AI Agents & Workspaces

**Version 1.1** | Last Updated: January 30, 2026

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Agents: Individual AI Workers](#agents-individual-ai-workers)
3. [Workspaces: Collaborative Environments](#workspaces-collaborative-environments)
4. [Runs: Executing Workflows](#runs-executing-workflows)
5. [Templates: Reusable Configurations](#templates-reusable-configurations)
6. [Advanced Features](#advanced-features)
7. [Every Button Explained](#every-button-explained)

---

## Core Concepts

### What is LifeOS AI System?

LifeOS provides a sophisticated multi-agent AI system where:

- **Agents** are specialized AI workers with specific roles and capabilities
- **Workspaces** are collaborative environments where multiple agents work together
- **Runs** are individual executions of a workspace's workflow
- **Templates** are reusable configurations for agents and workspaces

### Key Design Philosophy

1. **Specialization over Generalization**: Each agent has a focused role (researcher, critic, planner, etc.)
2. **Collaboration over Solo Work**: Multiple agents work together, each contributing their expertise
3. **Workflow-Driven**: Agents follow defined workflows (sequential, parallel, graph-based)
4. **Memory & Context**: Agents maintain conversation history and can build upon previous work
5. **Tool Integration**: Agents can use tools (web search, deep research, etc.)

---

## Agents: Individual AI Workers

### What is an Agent?

An **Agent** is a configured AI assistant with:

- A specific **role** (researcher, planner, critic, etc.)
- A **system prompt** that defines its behavior and expertise
- An **AI model** from a specific provider (OpenAI, Anthropic, Google, xAI)
- **Tool permissions** (what actions it can take)
- **Model parameters** (temperature, max tokens)

### Agent Roles

| Role            | Purpose               | Typical Responsibilities                                |
| --------------- | --------------------- | ------------------------------------------------------- |
| **Planner**     | Strategic planning    | Creates roadmaps, breaks down tasks, defines milestones |
| **Researcher**  | Information gathering | Finds data, sources, evidence, conducts web searches    |
| **Critic**      | Quality assurance     | Reviews work for gaps, risks, and improvements          |
| **Synthesizer** | Content creation      | Combines inputs into coherent final outputs             |
| **Executor**    | Action-taking         | Performs specific tasks, uses tools                     |
| **Custom**      | User-defined          | Any specialized role you define                         |

### Agent Configuration

#### Required Fields:

- **Name**: Descriptive name (e.g., "Strategic Planner", "Research Analyst")
- **Role**: Select from predefined roles or choose "Custom"
- **System Prompt**: Instructions that define the agent's personality, expertise, and behavior
- **Model Provider**: OpenAI, Anthropic, Google, or xAI (Grok)
- **Model Name**: Specific model (e.g., gpt-4o, claude-3-5-haiku, gemini-1.5-pro, grok-4)

#### Optional Fields:

- **Description**: Internal note about what this agent does
- **Temperature**: 0.0 (precise) to 2.0 (creative). Default: 0.7
- **Max Tokens**: Maximum response length. Higher = longer responses
- **Tool Permissions**: Which tools this agent can use (web_search, create_deep_research_request, etc.)

### Model Selection Guide

| Provider      | Model                   | Best For                         | Cost      | Speed     |
| ------------- | ----------------------- | -------------------------------- | --------- | --------- |
| **OpenAI**    | gpt-4o                  | General-purpose, reliable        | Medium    | Fast      |
| **OpenAI**    | gpt-4o-mini             | Simple tasks, cost-sensitive     | Very Low  | Very Fast |
| **Anthropic** | claude-3-5-haiku        | Detail work, cost-effective      | Low       | Fast      |
| **Google**    | gemini-1.5-pro          | Synthesis, editing               | Low       | Fast      |
| **Google**    | gemini-1.5-flash        | High-speed, structured output    | Very Low  | Very Fast |
| **xAI**       | grok-4                  | Real-time data, trends           | High      | Fast      |
| **xAI**       | grok-4-1-fast-reasoning | Deep reasoning, complex planning | Very High | Medium    |

---

## Workspaces: Collaborative Environments

### What is a Workspace?

A **Workspace** is a collaborative environment where:

- Multiple agents work together toward a common goal
- Workflow defines how agents interact (sequential, parallel, graph)
- Shared context and memory enable continuity
- Advanced features like Expert Council and Project Manager coordinate work

### Workspace Types

#### 1. Sequential Workflow

- Agents work one after another in a defined order
- Output of Agent A becomes input for Agent B
- **Use Case**: Content pipeline (Strategy → Research → Write → Edit → SEO)

#### 2. Parallel Workflow

- Multiple agents work simultaneously on different aspects
- Results are combined at the end
- **Use Case**: Market analysis (Technical Analysis + Fundamental Analysis + Sentiment Analysis)

#### 3. Supervisor Workflow

- A supervisor agent coordinates and delegates to specialist agents
- Supervisor makes decisions about next steps
- **Use Case**: Project management with dynamic task allocation

#### 4. Graph Workflow (Most Powerful)

- Visual node-based workflow with conditional branching
- Supports loops, joins, human input nodes
- **Use Case**: Complex decision trees, iterative refinement

### Workspace Configuration

#### Core Settings:

**1. Basic Information**

- **Name**: Descriptive workspace name
- **Description**: What this workspace accomplishes

**2. Agent Selection**

- **Available Agents**: Which agents can participate
- **Default Agent**: Which agent starts the workflow (for supervisor/graph modes)

**3. Workflow Configuration**

- **Workflow Type**: Sequential, Parallel, Supervisor, or Graph
- **Workflow Graph**: Visual workflow designer (for graph type)
- **Max Iterations**: Safety limit to prevent infinite loops (default: 10)

**4. Memory Settings**

- **Memory Message Limit**: How many recent messages agents remember (default: 100)
- Higher = more context, but slower and more expensive
- Lower = faster, cheaper, but less context

#### Advanced Features:

**5. Expert Council** (Multi-Model Arbitration)

- Council of 4 different AI models (OpenAI, Anthropic, Google, Grok) deliberate on complex decisions
- **Chairman Model**: Synthesizes council's opinions into final decision
- **Modes**:
  - **Full**: All models provide detailed reasoning (most thorough, expensive)
  - **Quick**: All models give brief opinions (balanced)
  - **Single**: Chairman decides alone (fastest, cheapest)
- **Use Cases**:
  - High-stakes decisions
  - Complex technical problems
  - Multiple valid approaches
  - Quality gates

**6. Project Manager** (Orchestrator)

- Intelligent coordinator that asks clarifying questions
- Validates assumptions before starting work
- Detects conflicts and contradictions
- Can invoke Expert Council for complex decisions
- **Questioning Depth**:
  - **Light**: 1-2 basic questions
  - **Standard**: 3-5 clarifying questions (recommended)
  - **Deep**: 7-10 comprehensive questions
- **Quality Gates**: Minimum quality score required to proceed
- **Auto Expert Council**: Automatically uses council for high-complexity items

### Workflow Graph Nodes

| Node Type            | Purpose                 | Configuration                                  |
| -------------------- | ----------------------- | ---------------------------------------------- |
| **Agent**            | Execute specific agent  | Select agent, optionally customize prompt      |
| **Tool**             | Execute a tool directly | Select tool, provide parameters                |
| **Human Input**      | Pause and ask user      | Provide question prompt                        |
| **Join**             | Combine parallel paths  | Choose aggregation: list, ranked, or consensus |
| **Research Request** | Trigger deep research   | Specify research topic/question                |
| **End**              | Workflow completion     | Marks successful end of flow                   |

### Workflow Graph Edges

Edges define the flow between nodes:

- **Condition Type**:
  - **Always**: Always follow this path
  - **Equals**: Only if output equals specific value
  - **Contains**: Only if output contains text
  - **Regex**: Only if output matches pattern
- **Label**: Descriptive label for this transition

---

## Runs: Executing Workflows

### What is a Run?

A **Run** is a single execution instance of a workspace:

- Has a unique ID
- Processes a specific **goal** (user prompt)
- Tracks **status** (pending, running, completed, failed, paused, waiting_for_input)
- Records **all messages** exchanged between agents
- Captures **tool calls** and their results
- Generates **final output**

### Run Lifecycle

```
pending → running → [waiting_for_input] → running → completed
          ↓                                           ↓
        failed                                    paused
```

### Starting a Run

**Required:**

- **Goal**: The task/question/problem you want solved

**Optional:**

- **Custom Memory Limit**: Override workspace default for this run
- **Starting Prompt**: Custom instructions for the first agent
- **Context**: Additional structured data

### Run Status Explained

| Status                | Meaning                 | User Actions Available                       |
| --------------------- | ----------------------- | -------------------------------------------- |
| **Pending**           | Queued, not started yet | Cancel, Delete                               |
| **Running**           | Actively processing     | Stop, View Live Progress                     |
| **Waiting for Input** | Needs your response     | Provide Answer, Skip                         |
| **Completed**         | Successfully finished   | View Output, Save as Note, Run Again, Delete |
| **Failed**            | Error occurred          | View Error, Retry, Delete                    |
| **Paused**            | Manually stopped        | Resume, Delete                               |

### Run Output & Results

Each run produces:

1. **Final Output**: Synthesized result (main deliverable)
2. **Full Message History**: All agent conversations
3. **Workflow Steps**: Visual progress through nodes
4. **Tool Calls**: All tools used and their results
5. **Expert Council Deliberations**: If Expert Council was used
6. **Project Manager Context**: Questions, assumptions, decisions
7. **Token Usage**: How many tokens consumed (cost tracking)
8. **Timestamps**: Start time, end time, duration

### Live Run Features

While a run is active:

- **Real-Time Status Updates**: See current agent activity
- **Token Counter**: Running total of tokens used
- **Estimated Cost**: Live cost calculation
- **Current Step**: Which node in the workflow
- **Stop Button**: Pause execution at any time

### Interactive Features

**Human Input Nodes:**

- Run pauses when it reaches a human_input node
- Question is displayed prominently
- You provide answer in text area
- Submit to resume workflow
- Keyboard shortcut: Cmd/Ctrl+Enter to submit

**Provide Input (Legacy):**

- If run is waiting_for_input, an input panel appears
- Agent is asking a clarifying question
- Type your response and submit
- Run automatically resumes

---

## Templates: Reusable Configurations

### What are Templates?

Templates are saved, reusable configurations:

- **Agent Templates**: Pre-configured agent setups
- **Workspace Templates**: Complete workspace configurations with multiple agents

### Built-in Templates

#### Agent Templates (21 Pre-built):

1. **Research Analyst** - Investigates topics, summarizes findings
2. **Strategic Planner** - Creates project structures with chapters
3. **Critical Reviewer** - Reviews for gaps and quality
4. **Executive Synthesizer** - Combines inputs into briefs
5. **Project Manager - Planning** - Coordinates planning sessions
6. **Task Breakdown Specialist** - Creates detailed task lists
7. **Risk Analyst** - Identifies risks and mitigation strategies
8. **Content Strategist** - Defines positioning for content
9. **Content Writer** - Creates polished long-form content
10. **Editor** - Polishes for clarity and flow
11. **SEO Specialist** - Optimizes for search engines
12. **Fact Checker** - Validates accuracy of claims
13. **Real-Time News Analyst** - Analyzes current events (Grok 4) + `serp_search`
14. **Trend Analyst** - Identifies emerging patterns (Grok 4) + `semantic_search`
15. **Technical Documentation Writer** - Creates clear technical docs (Gemini)
16. **Quick Summarizer** - Fast, concise summaries (GPT-4o-mini)
17. **X (Twitter) Analyst** - Real-time X analysis for trends, sentiment, brand monitoring (Grok 4)
18. **Quick Search Analyst** - Fast sourced answers (Gemini 1.5 Flash) with `serp_search` + `read_url`
19. **Deep Research Analyst** - Multi-angle deep research (GPT-4o) with all search tools

#### Workspace Templates (4 Pre-built):

1. **Project Plan Builder**
   - Multi-agent planning workflow
   - Project Manager + Planner + Task Specialist + Risk Analyst + Reviewer
   - Expert Council enabled (Quick mode)
   - Use: Complex project planning with validation

2. **Thought Leadership Writer**
   - Content creation pipeline
   - Strategist + Researcher + Writer + Editor + SEO + Fact Checker
   - Expert Council enabled (Full mode)
   - Use: High-quality thought leadership content

3. **Quick Search**
   - Fast sourced answers
   - Quick Search Analyst (1 agent)
   - Sequential workflow, 3 max iterations
   - Use: Ad-hoc questions needing fast, cited answers

4. **Deep Research Report**
   - Comprehensive multi-source research
   - Deep Research Analyst + Critical Reviewer + Executive Synthesizer
   - Sequential workflow, 10 max iterations
   - Use: In-depth research reports with critique and synthesis

### Creating Templates

**From Agent:**

1. Click "Save as Template" on any agent card
2. Give it a descriptive name and description
3. Template saved for reuse

**From Workspace:**

1. Click "Save as Template" on workspace card
2. Template includes all agents and workflow configuration
3. Can be instantiated multiple times

### Using Templates

**Agent:**

1. Go to Agents page
2. Click "From Template" button
3. Select template
4. Template instantiates as new agent
5. Customize if needed

**Workspace:**

1. Go to Workspaces page
2. Switch to "Templates" tab
3. Click on template
4. Click "Use Template"
5. Agents are created automatically
6. Workspace is configured
7. Ready to run

### Import/Export Templates

**Export:**

- Click menu (⋮) on template card
- Select "Export Template"
- JSON file downloads
- Share with others

**Import:**

- Click "Import Template" button
- Select JSON file
- Template added to your library

---

## Advanced Features

### 1. Expert Council

The Expert Council is a multi-model deliberation system:

**How It Works:**

1. Complex decision is presented to council
2. Four AI models from different providers deliberate:
   - OpenAI GPT-4o (structured, reliable)
   - Anthropic Claude Haiku (detail-oriented)
   - Google Gemini 1.5 Pro (synthesis-focused)
   - xAI Grok 4 (real-time, unconventional)
3. Each provides their perspective and reasoning
4. Chairman model synthesizes into final recommendation

**Modes:**

- **Full Mode**: Each model provides 200-400 word detailed analysis
- **Quick Mode**: Each model provides 50-100 word brief opinion
- **Single Mode**: Only chairman decides (no council)

**Configuration:**

- **Self-Exclusion**: If agent's model is on council, it's excluded from vote
- **Min Council Size**: Minimum models required (default: 2)
- **Max Council Size**: Maximum models to include (default: 10)
- **Caching**: Cache decisions for 24 hours to save cost

**When to Use:**

- High-stakes business decisions
- Technical architecture choices
- Multiple valid approaches exist
- Need diverse perspectives
- Quality gate before major commitment

**Cost Consideration:**
Full mode with 4 models = 4x the token cost of single model.

### 2. Project Manager

Intelligent workflow coordinator:

**Capabilities:**

- **Question Generation**: Asks clarifying questions before starting
- **Assumption Validation**: Challenges user's assumptions
- **Conflict Detection**: Identifies contradictory requirements
- **Expert Council Invocation**: Uses council for complex decisions
- **Quality Gates**: Enforces minimum quality standards
- **User Profiling**: Learns your preferences over time

**Configuration:**

**Questioning Depth:**

- **Light**: 1-2 questions (fast start)
- **Standard**: 3-5 questions (recommended balance)
- **Deep**: 7-10 questions (thorough understanding)

**Quality Thresholds:**

- **Expert Council Threshold**: Complexity score that triggers council (0-100)
- **Quality Gate Threshold**: Minimum quality score to proceed (0-100)

**Flags:**

- ✓ **Require Assumption Validation**: PM challenges assumptions
- ✓ **Enable Conflict Detection**: PM identifies contradictions
- ✓ **Enable User Profiling**: PM learns your preferences
- ✓ **Auto Use Expert Council**: PM invokes council when needed

**Viewing Project Manager Context:**
In a run, expand "Project Manager Context" to see:

- Questions asked and your answers
- Assumptions identified
- Decisions made
- Conflicts detected
- Quality assessments

### 3. Deep Research System

For tasks requiring extensive external research:

**How It Works:**

1. Agent creates a research request using `create_deep_research_request` tool
2. Request goes into research queue
3. You review and assign priority
4. External research is conducted (manual or automated)
5. Results returned to agent

**Request Fields:**

- **Question**: What needs to be researched
- **Context**: Background information
- **Required Depth**: Quick, Standard, or Comprehensive
- **Priority**: Low, Medium, High, Critical
- **Deadline**: Optional target completion date

**Managing Requests:**
View "Research Queue" panel in workspace detail:

- See all pending research requests
- Assign priorities
- Mark as complete with findings
- Cancel if no longer needed

### 4. Prompt Library

Centralized prompt management:

**Features:**

- Save reusable prompts with variables
- Categorize prompts (agent, workflow, tone, tool)
- Use prompts in agents and workspaces
- Variables: Use `{{variable_name}}` syntax
- Share prompts across workspaces

**Access:** `/agents/prompts`

**Example Prompt:**

```
You are analyzing {{topic}} for {{audience}}.
Focus on {{key_aspects}}.
Tone: {{tone_of_voice}}.
```

### 5. Tool System

Agents can use tools to take actions:

**Built-in Tools:**

| Tool                           | Purpose                                | Configuration            |
| ------------------------------ | -------------------------------------- | ------------------------ |
| `web_search`                   | Search the web (Google CSE)            | Query, max results       |
| `serp_search`                  | Fast SERP results (Serper)             | Query, max results, type |
| `read_url`                     | Extract clean markdown from URL (Jina) | URL                      |
| `scrape_url`                   | Scrape JS-heavy pages (Firecrawl)      | URL, formats             |
| `semantic_search`              | Neural/semantic search (Exa)           | Query, num results       |
| `create_deep_research_request` | Request deep research                  | Question, context, depth |
| `expert_council_execute`       | Invoke Expert Council                  | Prompt, mode             |

**Custom Tools:**

- Define your own tools
- Specify parameters (name, type, description, required)
- Agents call tools via function calling

**Tool Permissions:**

- Control which agents can use which tools
- Configure in agent's "Tool Permissions" field

### 6. Memory & Context Management

**Message History Window:**

- Controls how many recent messages agents remember
- Default: 100 messages
- Per-workspace setting
- Per-run override available

**Why This Matters:**

- More messages = better context, higher cost, slower
- Fewer messages = less context, lower cost, faster
- Balance based on task complexity

**Context Preservation:**

- Agents maintain conversation history within a run
- Can reference earlier work
- Build upon previous outputs

### 7. Interactive Workflows

**Human-in-the-Loop:**

- Add `human_input` nodes to workflow graph
- Run pauses and asks you a question
- You provide answer
- Run continues with your input

**Use Cases:**

- Decision gates requiring approval
- Preference selection (A or B?)
- Clarification of ambiguous requirements
- Quality check before continuing

### 8. Content Type Customization

For content-focused workspaces:

**Content Types:**

- Blog Post
- LinkedIn Post
- Twitter Thread
- Newsletter
- Documentation
- Case Study
- White Paper

**Effect:**

- Changes agent prompts to match format
- Adjusts tone and structure
- Optimizes for platform

**Configuration:**
In workspace with `supportsContentTypes: true`, select content type when creating run.

---

## Every Button Explained

### Agents Page (`/agents`)

#### Top Navigation:

- **➕ New Agent**: Opens agent builder modal (create from scratch)
- **📋 From Template**: Opens template selector to instantiate pre-built agent
- **🔧 New Tool**: Opens tool builder to create custom tool
- **⚙️ View Templates**: Switches to templates view
- **📥 Import**: Import agent template from JSON file
- **🔗 Prompt Library**: Navigate to prompt library

#### Agent Card Actions:

- **✏️ Edit**: Opens agent builder with this agent's configuration
- **📋 Clone**: Creates a copy with "(Copy)" suffix
- **💾 Save as Template**: Saves this agent as a reusable template
- **🗑️ Delete**: Permanently deletes agent (requires confirmation)
- **⋮ Menu**: Shows all above actions in dropdown

#### Filters:

- **Role Filter**: Filter by role (all, planner, researcher, critic, etc.)
- **Provider Filter**: Filter by AI provider (all, OpenAI, Anthropic, Google, xAI)

#### Agent Card Information:

- **Name**: Agent's display name
- **Role Badge**: Visual indicator of agent role
- **Model**: Shows provider and model (e.g., "OpenAI GPT-4o")
- **Description**: Agent's purpose (if set)
- **Tools**: List of tools agent can use
- **Temperature**: Creativity setting (0.0 - 2.0)
- **Max Tokens**: Response length limit

---

### Workspaces Page (`/workspaces`)

#### Top Navigation:

- **🖥️ Workspaces Tab**: View your workspaces
- **📋 Templates Tab**: View workspace templates
- **➕ New Workspace**: Opens workspace builder modal
- **📥 Import**: Import workspace template from JSON file

#### Workspace Card Actions:

- **▶️ Run Workspace**: Opens run modal to start execution
- **👁️ Show Details**: Navigate to workspace detail page
- **✏️ Edit**: Opens workspace builder with this workspace's config
- **📋 Clone**: Creates a copy with "(Copy)" suffix
- **💾 Save as Template**: Saves as reusable template
- **🗑️ Delete**: Permanently deletes workspace (requires confirmation)
- **⋮ Menu**: Shows all above actions in dropdown

#### Workspace Card Information:

- **Name**: Workspace display name
- **Description**: Purpose (if set)
- **Agents Count**: Number of agents (e.g., "5 agents")
- **Workflow Type**: Sequential, Parallel, Supervisor, or Graph
- **Feature Badges**: Shows if Expert Council, Project Manager, Graph, etc. are enabled
- **Run Count**: Total runs executed

#### Template Actions:

- **▶️ Use Template**: Instantiates template (creates agents & workspace)
- **✏️ Edit**: Modify template
- **📤 Export**: Download as JSON file
- **🗑️ Delete**: Delete template (requires confirmation)
- **⋮ Menu**: Shows all above actions

---

### Workspace Detail Page (`/workspaces/:id`)

#### Header:

- **← Back**: Return to workspaces list
- **Workspace Name**: Current workspace name
- **▶️ Start Run**: Opens run modal
- **Agents Badge**: Shows "N agents"
- **Workflow Type Badge**: Shows workflow type

#### Workflow Graph Section:

- **📊 Visual Graph**: See workflow nodes and connections
- **Node Colors**:
  - Blue: Agent node
  - Green: Tool node
  - Purple: Human input node
  - Orange: Join node
  - Yellow: Research request node
  - Gray: End node
- **Click Node**: Opens node details modal
- **Edge Labels**: Show conditions

#### Research Queue Panel (if present):

- **Research Requests List**: All pending research items
- **Priority Badge**: Low, Medium, High, Critical
- **Status**: Pending, In Progress, Completed, Cancelled
- **Actions**:
  - **Change Priority**: Update priority level
  - **Mark Complete**: Provide findings and complete
  - **Cancel**: Remove request

#### Runs Section:

- **Filter Dropdown**: Filter by status (All, Running, Completed, Failed, Paused, Waiting for Input)
- **Sort Options**: By date (newest first/oldest first)
- **Run Cards**: All runs for this workspace

---

### Run Card (in Workspace Detail)

#### Header:

- **Goal**: The task/prompt for this run
- **Status Badge**: Current status with color coding
- **Timestamp**: When run was created
- **Duration**: How long it took (for completed)
- **⋮ Menu**: Run actions dropdown

#### Status Indicator (for running runs):

- **Live Status Message**: Current activity (e.g., "🤖 Strategic Planner is thinking...")
- **Token Counter**: Running total (e.g., "2,543 tokens")
- **Estimated Cost**: Live cost (e.g., "$0.06")
- **⏹️ Stop Button**: Pause execution

#### Agent Question Panel (waiting_for_input):

- **Question**: Agent's question displayed with markdown
- **Response Textarea**: Your answer field
- **Character Count**: Shows characters typed / limit
- **Keyboard Hint**: "⌘↵ to submit"
- **Skip Button**: Skip this question
- **Submit Response Button**: Send answer and resume

#### Expandable Sections:

- **▼ Output** (if completed):
  - Final synthesized result
  - **💾 Save as Note**: Saves output to Notes app
  - **🔁 Run Again**: Start new run with same workspace

- **▼ Messages** (lazy loaded):
  - Full conversation history
  - Shows role (user/assistant/system/tool)
  - Agent names for assistant messages
  - Token usage per message

- **▼ Workflow Steps** (lazy loaded):
  - Visual progress through nodes
  - Completed nodes (✓ green)
  - Failed nodes (✗ red)
  - Current node (highlighted)

- **▼ Expert Council** (if used, lazy loaded):
  - Council members and their votes
  - Reasoning from each model
  - Chairman's synthesis
  - Final recommendation

- **▼ Project Manager** (if enabled, lazy loaded):
  - Questions asked
  - Your answers
  - Assumptions identified
  - Decisions made
  - Conflicts detected
  - Quality scores

- **▼ Tool Calls** (if any, lazy loaded):
  - Tools invoked
  - Parameters sent
  - Results returned
  - Status (success/failed)

#### Run Actions (⋮ Menu):

- **Resume**: Continue paused run
- **View Details**: Expand all sections
- **Run Again**: New run with same config
- **Delete**: Permanently remove run
- **Export**: Download run data as JSON

---

### Agent Builder Modal

#### Basic Information Tab:

- **Name Field**: Required, agent display name
- **Role Dropdown**: Select role (planner, researcher, critic, synthesizer, executor, custom)
- **Description Field**: Optional, internal note

#### Configuration Tab:

- **System Prompt Textarea**: Define agent's behavior and expertise
  - Use prompt library button to insert saved prompts
  - Supports markdown formatting
- **Model Provider Dropdown**: OpenAI, Anthropic, Google, xAI
- **Model Name Dropdown**: Available models for selected provider
- **Temperature Slider**: 0.0 (precise) to 2.0 (creative)
  - Shows current value
  - Default: 0.7
- **Max Tokens Input**: Maximum response length
  - Model-specific defaults shown

#### Tools Tab:

- **Available Tools List**: All tools you can grant
- **Checkboxes**: Select which tools agent can use
- **Tool Description**: Shown on hover
- **Built-in Tools**: web_search, serp_search, read_url, scrape_url, semantic_search, create_deep_research_request, expert_council_execute
- **Custom Tools**: Your created tools

#### Actions:

- **Cancel**: Close without saving
- **Save Agent**: Create or update agent

---

### Workspace Builder Modal

#### Basic Tab:

- **Name Field**: Required, workspace display name
- **Description Field**: Optional, what this workspace does

#### Agents Tab:

- **Available Agents List**: All your agents
- **Checkboxes**: Select agents to include in workspace
- **Agent Info**: Shows role and model
- **Default Agent Dropdown**: Which agent starts (for supervisor/graph)

#### Workflow Tab:

- **Workflow Type Dropdown**: Sequential, Parallel, Supervisor, Graph
- **Max Iterations Input**: Safety limit (default: 10)
- **Workflow Graph Designer** (if Graph selected):
  - **➕ Add Node**: Create new node
  - **Node Types**: Agent, Tool, Human Input, Join, Research Request, End
  - **Connect Nodes**: Click node, then target to create edge
  - **Edge Conditions**: Always, Equals, Contains, Regex
  - **Delete Node**: Click X on node
  - **Delete Edge**: Click X on edge label

Or **Use Prompt-to-Graph**:

- **Natural Language Input**: Describe workflow
- **Model Selection**: Choose AI model to generate graph
- **Generate Button**: Creates workflow graph from description

#### Expert Council Tab:

- **Enable Expert Council Toggle**: Turn feature on/off
- **Default Mode Dropdown**: Full, Quick, Single
- **Allow Mode Override Toggle**: Can runs change mode?
- **Council Models**: Select/configure participating models
  - Default: gpt-4o, claude-haiku, gemini-1.5-pro, grok-4
  - Can customize per model (temperature, etc.)
- **Chairman Model Dropdown**: Which model synthesizes
- **Self-Exclusion Toggle**: Exclude agent's model from council
- **Min Council Size Input**: Minimum models required
- **Max Council Size Input**: Maximum models to include
- **Enable Caching Toggle**: Cache decisions for 24h

#### Project Manager Tab:

- **Enable Project Manager Toggle**: Turn feature on/off
- **Questioning Depth Dropdown**: Light, Standard, Deep
- **Auto Use Expert Council Toggle**: PM can invoke council
- **Expert Council Threshold Slider**: Complexity score triggering council (0-100)
- **Quality Gate Threshold Slider**: Minimum quality to proceed (0-100)
- **Require Assumption Validation Checkbox**: PM challenges assumptions
- **Enable Conflict Detection Checkbox**: PM identifies contradictions
- **Enable User Profiling Checkbox**: PM learns preferences

#### Memory Tab:

- **Memory Message Limit Input**: How many recent messages (default: 100)
- **Explanation**: Higher = more context, higher cost

#### Actions:

- **Cancel**: Close without saving
- **Save Workspace**: Create or update workspace

---

### Run Workspace Modal

#### Goal Input:

- **Goal Textarea**: Required, your task/question/prompt
- **Rich Text Toggle**: Switch between plain text and rich editor
- **Character Count**: Shows length

#### Starting Prompt (Optional):

- **Prompt Textarea**: Custom instructions for first agent
- **Prompt Library Button**: Insert saved prompt

#### Memory Override (Optional):

- **Memory Limit Input**: Override workspace default for this run

#### Context (Optional):

- **Content Type Dropdown** (if supported): Blog Post, LinkedIn, Twitter, etc.
- **Additional Context Textarea**: Structured data as JSON

#### Actions:

- **Cancel**: Close without starting
- **Start Run**: Execute workflow

---

### Workflow Node Modal (Graph View)

When you click a node in workflow graph:

#### Header:

- **Node Type**: Agent, Tool, Human Input, Join, Research Request, End
- **Node ID**: Unique identifier
- **✕ Close**: Close modal

#### Metadata Section:

- **Label**: Node display name
- **Type**: Node type badge
- **Agent** (if agent node): Which agent executes
- **Tool** (if tool node): Which tool executes
- **Prompt** (if human_input): Question to ask user

#### Execution Info (if run is active):

- **Status**: Pending, Running, Completed, Failed
- **Timestamps**: Start time, end time, duration
- **Input**: Data received from previous nodes
- **Output**: Data produced by this node
- **Messages**: Agent conversation for this node
- **Tool Calls**: Tools invoked from this node
- **Error** (if failed): Error message

---

### Template Modals

#### Save as Template Modal:

- **Template Name Input**: Required, descriptive name
- **Template Description Textarea**: Optional, what this template is for
- **Actions**:
  - **Cancel**: Don't save
  - **Save Template**: Create template

#### Template Selector Modal (for instantiation):

- **Built-in Templates Section**: Pre-packaged templates
- **Your Templates Section**: Your saved templates
- **Template Cards**: Click to select
  - Shows name, description
  - Shows agent count (for workspace)
  - Shows features (Expert Council, PM, etc.)
- **Use Template Button**: Instantiate selected template
- **Cancel Button**: Close without selecting

---

### Prompt Library Page (`/agents/prompts`)

#### Header:

- **➕ New Prompt**: Create new prompt template
- **Search Bar**: Filter prompts by name/content
- **Category Filter**: All, Agent, Workflow, Tone, Tool, Synthesis

#### Prompt Card:

- **Name**: Prompt display name
- **Category Badge**: Type of prompt
- **Preview**: First 150 characters of content
- **Variables Badge**: Shows variable count (e.g., "3 variables")
- **Actions**:
  - **✏️ Edit**: Modify prompt
  - **📋 Clone**: Duplicate prompt
  - **🗑️ Delete**: Remove prompt

#### Prompt Editor Modal:

- **Name Input**: Prompt title
- **Category Dropdown**: Agent, Workflow, Tone, Tool, Synthesis
- **Content Textarea**: Prompt text
  - Use `{{variable_name}}` for variables
  - Markdown supported
- **Variables List**: Auto-detected from content
- **Actions**:
  - **Cancel**: Close without saving
  - **Save Prompt**: Create or update

---

### Search Tool API Keys (Settings Page)

The Settings page includes a **Search Tools** panel for managing API keys for the new search/research tools. This is found in the Intelligence section alongside the AI Provider Keys panel.

#### Search Tool Key Cards:

For each tool (Serper, Firecrawl, Exa, Jina Reader):

- **Status Indicator**: Connected (green) / Inactive (gray)
- **Helper Text**: Describes what the tool does
- **API Key Input**: Password-masked field for entering the key
- **Save Button**: Persists key to Firestore (`users/{userId}/settings/searchToolKeys`)
- **Clear Button**: Removes the stored key
- **Test Button**: Verifies the key works by making a lightweight API call to the service

#### Key Priority Chain:

When a search tool runs during an agent workflow, keys are resolved in this order:

1. **User's Firestore key** (set via Settings UI) — highest priority
2. **Firebase Secret** (`defineSecret`) — system-level fallback
3. **Environment variable** (`process.env`) — lowest priority

This means users can supply their own keys for higher rate limits or billing isolation, while the system keys serve as fallbacks.

#### Test Connection:

Each tool has a "Test" button that:

1. Reads the user's stored key from Firestore (or falls back to system key)
2. Makes a minimal API call to the service (e.g., a single search query)
3. Returns success/failure with latency information
4. Displays result inline (green checkmark or red X with error message)

---

### Model Settings Page (`/settings/models`)

#### Header:

- **Model Settings Title**
- **Description**: Configure defaults for new agents
- **Reset to Defaults Button**: Restore factory settings

#### Provider Cards (4 cards):

For each provider (OpenAI, Anthropic, Google, xAI):

**Header:**

- **Provider Name**: e.g., "OpenAI"
- **Description**: Provider's strengths
- **Enable/Disable Toggle**: Turn provider on/off

**Body** (when enabled):

- **Default Model Dropdown**: Select default model
  - Shows available models
  - Shows pricing per 1M tokens
- **Last Updated**: Timestamp of last change
- **Actions** (when modified):
  - **Cancel**: Revert changes
  - **Save Changes**: Apply new default

**Info Card:**

- Explains how defaults work
- Notes about existing agents
- Pricing information
- Provider availability

---

## Navigation Quick Reference

| Page             | URL                | Purpose                           |
| ---------------- | ------------------ | --------------------------------- |
| Agents           | `/agents`          | Manage AI agents                  |
| Workspaces       | `/workspaces`      | Manage collaborative environments |
| Workspace Detail | `/workspaces/:id`  | View runs, start new runs         |
| Prompt Library   | `/agents/prompts`  | Manage reusable prompts           |
| Model Settings   | `/settings/models` | Configure model defaults          |
| Settings         | `/settings`        | System configuration              |

---

## Keyboard Shortcuts

| Shortcut           | Context              | Action             |
| ------------------ | -------------------- | ------------------ |
| `Cmd/Ctrl + Enter` | Agent Question Panel | Submit response    |
| `Esc`              | Any Modal            | Close modal        |
| `Tab`              | Forms                | Move to next field |

---

## Tips & Best Practices

### Agent Design

1. **Specific Prompts**: More specific = better results
2. **Role Clarity**: Make role and responsibilities crystal clear
3. **Temperature Settings**:
   - Creative tasks: 0.7-1.2
   - Analytical tasks: 0.2-0.5
   - Balanced: 0.7
4. **Tool Permissions**: Only grant tools the agent needs

### Workspace Design

1. **Start Simple**: Begin with sequential, add complexity as needed
2. **Test Iterations**: Run workspace multiple times to refine
3. **Memory Balance**: 100 messages is usually sufficient
4. **Expert Council**: Save for important decisions (expensive)
5. **Project Manager**: Use for complex, ambiguous tasks

### Workflow Design

1. **Define End Clearly**: Make success criteria explicit
2. **Human Checkpoints**: Add human_input nodes for critical decisions
3. **Error Handling**: Consider failure paths in graph
4. **Iteration Limits**: Set max iterations to prevent runaway
5. **Agent Specialization**: Each agent should have clear, distinct role

### Cost Management

1. **Model Selection**: Use mini/flash models for simple tasks
2. **Memory Limits**: Lower limits = lower cost
3. **Expert Council**: Use Quick mode for most decisions
4. **Token Monitoring**: Watch token counters during runs
5. **Template Reuse**: Don't recreate agents repeatedly

### Quality Assurance

1. **Review Outputs**: Always review before using
2. **Iterate Prompts**: Refine agent prompts based on outputs
3. **Quality Gates**: Use Project Manager with high thresholds
4. **Critic Agents**: Include reviewer/critic in workflows
5. **Expert Council**: Use for validation of critical outputs

---

_End of User Guide. See companion document: [Test Scenarios & Use Cases](./TEST_SCENARIOS_WORKSPACES_AGENTS.md)_
