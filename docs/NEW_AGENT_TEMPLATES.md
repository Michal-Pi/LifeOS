# New Agent Templates (January 2026)

## Overview

Added 4 new specialized agent templates that leverage unique capabilities of different AI models. Each template is designed to provide value that existing agents don't cover.

---

## 1. Real-Time News Analyst 📰

**Model**: Grok 2 (xAI)  
**Role**: Researcher  
**Temperature**: 0.4  
**Max Tokens**: 3000

### Unique Value

- Leverages Grok's real-time access to X/Twitter and recent web content
- Analyzes events from the last 24-48 hours
- Provides up-to-date context on breaking news

### Best Use Cases

- Breaking news analysis
- Current event summaries
- Real-time situation tracking
- Crisis monitoring
- Social media pulse checks

### Output Format

- Current situation summary
- Chronological key updates with timestamps
- Impact analysis
- Stakeholder identification
- Contextual background

### Tools

- `web_search` for sourcing recent information

---

## 2. Trend Analyst 📈

**Model**: Grok 2 (xAI)  
**Role**: Researcher  
**Temperature**: 0.6 (higher for pattern recognition)  
**Max Tokens**: 3000

### Unique Value

- Uses Grok's real-time social signals
- Spots early signals before they go mainstream
- Distinguishes fads from lasting trends

### Best Use Cases

- Trend forecasting
- Market intelligence
- Content strategy planning
- Product development insights
- Cultural shift detection

### Output Format

- Signal strength indicators (momentum, growth, spread)
- Key metrics (social mentions, search volume, coverage)
- Analysis (drivers, barriers, timeline)
- Longevity assessment (fad vs. trend)
- Related trend connections

### Tools

- `web_search` for trend validation

---

## 3. Technical Documentation Writer 📝

**Model**: Gemini 1.5 Pro (Google)  
**Role**: Synthesizer  
**Temperature**: 0.4  
**Max Tokens**: 4000

### Unique Value

- Gemini's strong code understanding
- Fast processing of technical content
- Excellent at balancing detail with clarity

### Best Use Cases

- API documentation
- Developer guides
- Technical tutorials
- Integration docs
- Code examples and patterns

### Output Format

- Overview and quick start
- Core concepts with examples
- API reference with parameters
- Common patterns and best practices
- Troubleshooting guide

### Tools

- None (focuses on synthesis and explanation)

---

## 4. Quick Summarizer ⚡

**Model**: GPT-4o-mini (OpenAI)  
**Role**: Synthesizer  
**Temperature**: 0.3  
**Max Tokens**: 800 (intentionally limited)

### Unique Value

- **94% cheaper** than GPT-4 ($0.15 vs $30 per 1M tokens)
- Fast processing for simple tasks
- Perfect quality for straightforward summarization

### Best Use Cases

- Email/message triage
- Meeting notes summary
- Article quick reads
- Document overviews
- Content screening

### Output Format

- 3-4 sentence summary
- 3-4 key bullet points
- One sentence main takeaway
- Under 200 words total

### Cost Comparison

| Model           | Input Cost  | Output Cost | Use Case            |
| --------------- | ----------- | ----------- | ------------------- |
| GPT-4           | $30.00/M    | $60.00/M    | Complex analysis    |
| GPT-4o          | $2.50/M     | $10.00/M    | General purpose     |
| **GPT-4o-mini** | **$0.15/M** | **$0.60/M** | **Quick summaries** |

**Savings**: ~99% vs GPT-4, ~94% vs GPT-4o for high-volume summarization tasks.

### Tools

- None (focuses on quick extraction)

---

## Model Distribution Summary

After adding these templates, the full agent roster is:

| Provider            | Count | Agent Types                                                 |
| ------------------- | ----- | ----------------------------------------------------------- |
| **OpenAI**          | 8     | Research, coordination, editing, synthesis, quick summaries |
| **Anthropic**       | 6     | Planning, critique, long-form writing, fact-checking        |
| **Google (Gemini)** | 1     | Technical documentation                                     |
| **xAI (Grok)**      | 2     | Real-time news, trend analysis                              |
| **All 4**           | -     | Expert Council diversity                                    |

---

## Integration Notes

### For New Workspaces

These agents can be added to any workspace type:

- **Sequential**: Add Real-Time News Analyst → Trend Analyst → Content Writer
- **Parallel**: Use multiple analysts (News, Trend, Research) in parallel
- **Supervisor**: Let Project Manager delegate to appropriate specialist
- **Graph**: Create custom workflows with conditional routing

### For Existing Workspaces

Can be added to templates without breaking changes:

- `agentTemplateNames: [...existing, 'Real-Time News Analyst']`
- Agents are independent and don't require special configuration

### Cost Optimization

Replace standard summarization agents with Quick Summarizer for:

- High-volume processing (>100 summaries/day)
- Simple content extraction
- Non-critical summaries
- Budget-conscious projects

**Expected savings**: $135-270 per 100 runs compared to GPT-4.

---

## Testing Recommendations

### Real-Time News Analyst

- Test with breaking news event (within last 24 hours)
- Verify timestamp citations
- Check source quality
- Validate real-time updates

### Trend Analyst

- Test with known emerging trend
- Compare signal strength across topics
- Validate fad vs. trend distinction
- Check cross-domain connections

### Technical Documentation Writer

- Test with API documentation task
- Verify code examples are runnable
- Check clarity for technical audience
- Validate troubleshooting coverage

### Quick Summarizer

- Compare output quality vs GPT-4o
- Test with various content lengths
- Measure processing speed
- Validate 200-word limit adherence

---

## 5. Quick Search Analyst (January 30, 2026)

**Model**: Gemini 1.5 Flash (Google)
**Role**: Researcher
**Temperature**: 0.3
**Max Tokens**: 1200

### Unique Value

- Optimized for fast, sourced answers using advanced search tools
- Uses Serper for SERP results and Jina Reader for full-page extraction
- Concise responses under 300 words with citations

### Best Use Cases

- Quick fact-checking
- Ad-hoc questions needing sourced answers
- Fast lookups with direct citations
- News verification

### Output Format

- Direct answer with inline citations
- Source URLs listed at bottom
- Under 300 words

### Tools

- `serp_search` — Fast web search via Serper
- `read_url` — URL-to-markdown extraction via Jina Reader

---

## 6. Deep Research Analyst (January 30, 2026)

**Model**: GPT-4o (OpenAI)
**Role**: Researcher
**Temperature**: 0.4
**Max Tokens**: 4000

### Unique Value

- Performs thorough multi-angle research combining multiple search strategies
- Uses SERP search for facts, semantic search for conceptual discovery, and full-page extraction for deep reading
- Produces structured findings with confidence levels

### Best Use Cases

- Comprehensive topic research
- Multi-source analysis
- Literature reviews
- Competitive intelligence
- Deep-dive investigations

### Output Format

- Structured findings with sections
- Source citations with URLs
- Confidence levels per finding
- Areas flagged for human follow-up via deep research requests

### Tools

- `serp_search` — Fast SERP results via Serper
- `semantic_search` — Neural/semantic search via Exa
- `read_url` — Clean markdown extraction via Jina Reader
- `scrape_url` — JS-heavy page scraping via Firecrawl
- `create_deep_research_request` — Flag items for human research

---

## New Search & Research Tools (January 30, 2026)

Four new search/research tools were added alongside the existing `web_search` (Google CSE):

| Tool              | Service     | Purpose                                                  | API Key Required          |
| ----------------- | ----------- | -------------------------------------------------------- | ------------------------- |
| `serp_search`     | Serper      | Fast SERP results with People Also Ask, knowledge panels | Yes (`SERPER_API_KEY`)    |
| `read_url`        | Jina Reader | Extract clean markdown from any URL                      | Optional (free tier)      |
| `scrape_url`      | Firecrawl   | Scrape JS-heavy or blocked web pages                     | Yes (`FIRECRAWL_API_KEY`) |
| `semantic_search` | Exa         | Neural/semantic search for conceptual discovery          | Yes (`EXA_API_KEY`)       |

These tools can be assigned to any agent via the Agent Builder's Tools tab. They appear alongside existing tools like `web_search` and `create_deep_research_request`.

### Updated Existing Agents

- **Trend Analyst**: Now also has `semantic_search` for deeper pattern discovery
- **Real-Time News Analyst**: Now also has `serp_search` for supplementary SERP data

---

## New Workspace Templates (January 30, 2026)

### Quick Search Workspace

- **Category**: Research
- **Agents**: Quick Search Analyst (1 agent)
- **Workflow**: Sequential
- **Max Iterations**: 3
- **Use Case**: Fast, sourced answers to ad-hoc questions

### Deep Research Report Workspace

- **Category**: Research
- **Agents**: Deep Research Analyst, Critical Reviewer, Executive Synthesizer (3 agents)
- **Workflow**: Sequential (research → critique → synthesize)
- **Max Iterations**: 10
- **Use Case**: Comprehensive multi-source research reports

---

## 7. Deep Research (KG + Dialectical) — Workflow Template (February 2026)

**Workflow Type**: `deep_research` (dedicated LangGraph pipeline)
**Category**: Research
**Agents**: 9 (4 research + 5 dialectical)

### What's New

Unlike the existing Deep Research template (Scenario 26) which uses a `graph` workflow with human-in-the-loop checkpoints, this new template is a **fully automated pipeline** powered by a dedicated LangGraph executor. It introduces:

- **Knowledge Graph construction** — Claims, concepts, and causal links extracted from sources
- **Multi-lens dialectical reasoning** — Economic, systems, and adversarial thesis agents debate evidence
- **Budget-aware iteration** — Automatic gap analysis and iterative search until budget exhaustion
- **Source traceability** — Every claim links back to its source document and quote

### Agents Included

| Agent                          | Provider                      | Role               | Purpose                                        |
| ------------------------------ | ----------------------------- | ------------------ | ---------------------------------------------- |
| Deep Research Planner          | Anthropic (Claude Sonnet 4.5) | research_planner   | Query decomposition, search planning           |
| Deep Research Claim Extractor  | OpenAI (GPT-4o-mini)          | claim_extractor    | Atomic claim extraction with evidence metadata |
| Deep Research Gap Analyst      | OpenAI (GPT-4o-mini)          | gap_analyst        | Coverage gap identification, follow-up queries |
| Deep Research Answer Generator | OpenAI (GPT-4o)               | answer_generator   | Final structured report synthesis              |
| Dialectical Economic Thesis    | Anthropic (Claude Sonnet 4.5) | thesis_economic    | Economic lens analysis                         |
| Dialectical Systems Thesis     | OpenAI (GPT-4o)               | thesis_systems     | Systems/complexity lens analysis               |
| Dialectical Adversarial Thesis | Google (Gemini 1.5 Pro)       | thesis_adversarial | Adversarial/contrarian lens analysis           |
| Dialectical Synthesis          | OpenAI (o3-mini)              | synthesis          | Contradiction resolution across lenses         |
| Dialectical Meta-Reflection    | OpenAI (o3-mini)              | meta_reflection    | Reasoning quality assessment                   |

### Pipeline Phases

```
Search Planning → Source Ingestion → Claim Extraction
    → KG Construction → Dialectical Reasoning
    → Gap Analysis → [Iterate] → Answer Generation
```

### Testing

- See [Test Scenario 39: Deep Research KG + Dialectical Template](./TEST_SCENARIOS_WORKSPACES_AGENTS.md#scenario-39-deep-research-kg--dialectical-template)
- See [Test Scenario 40: Deep Research Budget Control](./TEST_SCENARIOS_WORKSPACES_AGENTS.md#scenario-40-deep-research-budget-control)
- See [Test Scenario 41: Deep Research Knowledge Graph Inspection](./TEST_SCENARIOS_WORKSPACES_AGENTS.md#scenario-41-deep-research-knowledge-graph-inspection)
- See [Deep Research User Guide](./features/deep-research-user-guide.md)

---

## Future Enhancements

### Potential Additions

1. **Multimodal Analyst** (Gemini) - when image analysis is needed
2. **Code Review Agent** (Claude) - leverages code expertise
3. **Data Analyst** (GPT-4o) - with data visualization tools
4. **Research Coordinator** (GPT-4o) - orchestrates deep research requests

### Model-Specific Features

- Enable Gemini's multimodal capabilities when available
- Add Grok's real-time X integration when API supports it
- Leverage Claude's extended context (200K tokens) for long documents

---

## Changelog

**2026-02-26** - Automated Deep Research (KG + Dialectical) Pipeline

- **New Workflow Template**: "Deep Research (KG + Dialectical)" — fully automated research pipeline
- **9 new agent templates**: 4 research agents (Planner, Claim Extractor, Gap Analyst, Answer Generator) + 5 dialectical agents (Economic, Systems, Adversarial thesis + Synthesis + Meta-Reflection)
- **New workflow type**: `deep_research` — dedicated LangGraph executor with phase-based execution
- **Knowledge Graph**: Claims, concepts, mechanisms, contradictions, and causal links with source traceability
- **Budget control**: Token/search/LLM call tracking with automatic phase downgrade (full → reduced → minimal)
- **Gap analysis loop**: Identifies under-supported claims and generates targeted follow-up searches
- **New run event type**: `deep_research_phase` for phase-level observability
- **Updated documentation**: Deep Research User Guide v2.0, 3 new test scenarios (39–41)

**2026-02-01** - Major Model & Tool Coverage Update

- **Model Updates**: Added reasoning models (o1, o3-mini) and updated all agents with inline capability labels
  - Added OpenAI o1, o3-mini reasoning models for complex tasks
  - Added Gemini 2.0 Flash experimental model
  - Updated all agent names with inline labels: (Thinking), (Balanced), (Fast), (Fast/Low-Cost), (Real-Time)
- **Agent Model Optimizations**:
  - Updated Project Structure Planner to o3-mini (Thinking)
  - Updated Risk Analyst to o3-mini (Thinking)
  - Updated Plan Quality Reviewer to o1 (Thinking)
  - All other agents optimized for cost/performance balance
- **New Tool-Specific Agents** (Complete tool coverage):
  - Calendar Assistant (Fast/Low-Cost) — Gemini 1.5 Flash with calendar tools
  - Meeting Coordinator (Balanced) — GPT-4o with calendar + notes
  - Knowledge Manager (Balanced) — Claude 3.5 Sonnet with note analysis/tagging
  - Personal Data Analyst (Balanced) — GPT-4o with Firestore + calculations
  - Quick Calculator (Fast/Low-Cost) — GPT-4o-mini for fast math
  - Time-Aware Planner (Balanced) — GPT-4o with time + calendar awareness
- **UI Fix**: Agent template cards now have buttons anchored to bottom
- **Documentation**: Updated model comparison tables and cost guidance

**2026-01-30**

- Added Quick Search Analyst (Gemini 1.5 Flash) — fast sourced answers
- Added Deep Research Analyst (GPT-4o) — multi-angle deep research
- Added 4 new search/research tools: `serp_search`, `read_url`, `scrape_url`, `semantic_search`
- Added 2 new workspace templates: Quick Search, Deep Research Report
- Updated Trend Analyst with `semantic_search` tool
- Updated Real-Time News Analyst with `serp_search` tool
- Added Search Tool API Key management in Settings UI with test connection buttons
- Added backend test endpoints for verifying search tool and agent configurations

**2026-01-29**

- Added Real-Time News Analyst (Grok 2)
- Added Trend Analyst (Grok 2)
- Added Technical Documentation Writer (Gemini 1.5 Pro)
- Added Quick Summarizer (GPT-4o-mini)
- Updated model distribution across 4 providers
- Updated comprehensive documentation
- Updated Expert Council configurations with consistent naming

**Model Count**: 18 → 20 (+2) → 27 (+7) → 33 (+6) → 42 (+9) agent templates
**Workspace Templates**: 2 → 4 → 5 workspace templates
**Search Tools**: 1 → 5 search/research tools
**Workflow Types**: sequential, parallel, supervisor, graph, custom, **deep_research** (new)
**Provider Coverage**: 4 providers (OpenAI, Anthropic, Google, xAI)
**Tool Coverage**: 100% - Every tool has at least one dedicated agent
