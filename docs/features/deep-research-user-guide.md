# Deep Research User Guide

**Version 2.0** | Last Updated: February 26, 2026

---

## Overview

Deep Research in LifeOS supports two modes:

1. **Manual Deep Research** — Agents pause a run and request external research. Users upload findings to resume.
2. **Automated Deep Research (KG + Dialectical)** — A fully automated pipeline that searches sources, extracts claims into a Knowledge Graph, runs multi-lens dialectical reasoning, and iteratively fills knowledge gaps.

---

## Mode 1: Manual Deep Research

### How Requests Are Created

- Agents call the deep research tool with a topic and questions.
- The run pauses until results are uploaded.

### Research Queue

- Open the Research page to view pending requests.
- Each request includes topic, questions, priority, and estimated time.

### Uploading Results

- Paste text or upload a `.txt`/`.md` file.
- Choose the source (claude, chatgpt, gemini, other).
- Provide the model name used.

### Completing Requests

- Mark requests completed after reviewing coverage.
- Synthesized findings are added to the run context.

### Run Resumption

- Completed research updates the paused run.
- The run resumes automatically once findings are integrated.

### Best Practices

- Answer all listed questions for completeness.
- Provide citations or source notes when possible.
- Keep research outputs structured and concise.

---

## Mode 2: Automated Deep Research (KG + Dialectical)

### What It Does

This workflow automates the entire deep research process end-to-end:

1. **Search Planning** — Analyzes your query, decomposes it into sub-questions, and generates diverse search plans (SERP, academic, semantic).
2. **Source Ingestion** — Executes searches in parallel, retrieves and chunks source documents.
3. **Claim Extraction** — Extracts atomic, verifiable claims from each source with evidence type, confidence scores, and source quotes.
4. **Knowledge Graph Construction** — Builds a hypergraph of claims, concepts, mechanisms, contradictions, and causal links with full source traceability.
5. **Dialectical Reasoning** — Multiple thesis agents (economic, systems, adversarial) analyze claims through different lenses. A synthesis agent resolves contradictions. A meta-reflection agent evaluates reasoning quality.
6. **Gap Analysis** — Identifies under-supported claims, missing perspectives, and unresolved contradictions. Generates targeted follow-up queries.
7. **Iteration** — Loops back to search with gap-filling queries until the budget is exhausted or coverage is sufficient.
8. **Answer Generation** — Produces a structured final report with confidence levels, source citations, and a knowledge graph snapshot.

### How to Use It

1. Go to **Agents** > **Workflows** tab
2. Click **Create from Template**
3. Select **"Deep Research (KG + Dialectical)"**
4. Review the 9 pre-configured agents:
   - Deep Research Planner (Anthropic) — query decomposition and search planning
   - Deep Research Claim Extractor (Fast) — atomic claim extraction
   - Deep Research Gap Analyst (Fast) — gap identification and follow-up queries
   - Deep Research Answer Generator (Strong) — final report synthesis
   - Dialectical Economic Thesis Agent (Anthropic) — economic lens analysis
   - Dialectical Systems Thesis Agent (OpenAI) — systems lens analysis
   - Dialectical Adversarial Thesis Agent (Google) — adversarial lens analysis
   - Dialectical Synthesis Agent (Thinking) — contradiction resolution
   - Dialectical Meta-Reflection Agent (Thinking) — reasoning quality assessment
5. Click **Create Workspace**
6. Start a run with your research question, e.g.:
   ```
   What are the long-term economic and societal implications
   of widespread AI adoption in healthcare diagnostics?
   ```

### Pipeline Phases

```
Search Planning
    ↓
Source Ingestion (parallel search execution)
    ↓
Claim Extraction (per-source atomic claims)
    ↓
Knowledge Graph Construction (claims → nodes + edges)
    ↓
Dialectical Reasoning (3 thesis lenses → synthesis → meta-reflection)
    ↓
Gap Analysis (coverage gaps → follow-up queries)
    ↓
[Loop back to Source Ingestion if budget remains]
    ↓
Answer Generation (structured report with citations)
```

### Budget Control

The workflow is budget-aware and will stop when the configured budget is exhausted. Each phase tracks:

- **Token spend** — input + output tokens across all LLM calls
- **Search calls** — SERP, semantic, and academic queries used
- **LLM calls** — total provider API calls
- **Gap iterations** — number of gap-fill cycles completed

Budget phases:

| Phase     | Behavior                                                          |
| --------- | ----------------------------------------------------------------- |
| `full`    | All phases active (search, extraction, dialectical, gap analysis) |
| `reduced` | Skip dialectical reasoning, focus on search + extraction          |
| `minimal` | Answer generation only from existing knowledge graph              |

### What to Watch During a Run

- **Phase events** appear in the run log as `deep_research_phase` events
- **Knowledge Graph** populates with claim nodes, concept nodes, and edges
- **Dialectical cycles** show thesis → antithesis → synthesis progression
- **Gap iterations** show what the system identified as missing and what queries it generated
- **Final report** includes confidence assessments per section and full source citations

### Output Structure

The final answer includes:

- Executive summary with overall confidence level
- Detailed findings organized by sub-question
- Evidence map linking claims to sources
- Contradictions identified and how they were resolved
- Knowledge gaps that remain after budget exhaustion
- Source bibliography with URLs and retrieval timestamps

### Prerequisites

- At least one AI provider key configured (OpenAI, Anthropic, or Google)
- Search tool API keys for web search (Serper and/or Exa recommended)
- The `serp_search`, `semantic_search`, and `read_url` tools are used by the planner agent

### When to Use Which Mode

| Scenario                                           | Recommended Mode                        |
| -------------------------------------------------- | --------------------------------------- |
| Quick factual lookup                               | Quick Search template                   |
| Multi-source report with human curation            | Manual Deep Research (Mode 1)           |
| Comprehensive analysis with competing perspectives | **Automated KG + Dialectical (Mode 2)** |
| Time-sensitive research needing human judgment     | Manual Deep Research (Mode 1)           |
| Academic-style literature review                   | **Automated KG + Dialectical (Mode 2)** |

### Best Practices

- Start with specific, well-scoped research questions for best results
- Broader questions will use more budget due to additional gap iterations
- Review the knowledge graph after completion to explore claim relationships
- The dialectical reasoning phase works best on topics with genuine debate or competing perspectives
- For purely factual lookups, use the simpler **Quick Search** or **Deep Research Report** templates instead
