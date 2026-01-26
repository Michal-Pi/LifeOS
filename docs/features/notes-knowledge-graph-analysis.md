# Knowledge Graph System - Current State & Enhancement Opportunities

## Current Implementation Status

### ✅ What's Already Built

1. **Core Graph Infrastructure**
   - Domain models: `NoteGraph`, `NoteGraphNode`, `NoteGraphEdge`
   - Graph repository with BFS, shortest path, backlinks
   - Link extraction from ProseMirror content
   - Automatic backlink computation

2. **User Interface**
   - Note link autocomplete (`[[` typing)
   - Graph visualization page (`/notes/graph`)
   - ReactFlow-based graph view
   - Graph search and filtering
   - Graph statistics (centrality, clusters, hubs)
   - Backlinks panel in note editor

3. **Link Management**
   - Explicit links (`note://` protocol)
   - Wiki-style links (`[[Note Title]]`)
   - Title mentions (automatic detection)
   - Shared project/tag edges

4. **Graph Analytics**
   - Node centrality calculation
   - Cluster detection
   - Hub note identification
   - Graph density metrics

### ⚠️ What's Missing or Could Be Improved

## 1. Adding Elements to the Knowledge Graph

### Current State

- **Automatic**: Notes are added to the graph when they have links or are linked to
- **Manual**: Users create links by typing `[[` or using `note://` links
- **Implicit**: Notes sharing projects/tags create edges

### Gaps & Opportunities

#### A. Explicit Graph Management UI

**Problem**: No clear way to see which notes are "in the graph" vs "orphaned"

**Solution**: Add a "Graph Management" panel

- Show graph membership status for each note
- One-click "Add to Graph" button (creates connections)
- "Remove from Graph" option (removes all links)
- Visual indicator of graph connectivity

#### B. Relationship Suggestions

**Problem**: Users may not know which notes should be linked

**Solution**: Add "Suggest Links" feature

- Analyze note content for semantic similarity
- Suggest potential links based on:
  - Shared keywords/concepts
  - Similar topics/projects
  - Temporal proximity (created around same time)
  - Content overlap

#### C. Bulk Link Operations

**Problem**: No way to create multiple links at once

**Solution**: Add bulk linking interface

- Select multiple notes
- "Link Selected Notes" action
- Choose link type (explicit, mention, shared context)
- Batch create relationships

#### D. Link Context/Notes

**Problem**: Links are binary - no way to describe WHY notes are linked

**Solution**: Add link metadata

```typescript
interface NoteGraphEdge {
  fromNoteId: NoteId
  toNoteId: NoteId
  edgeType: NoteGraphEdgeType
  context?: string // Optional: why are these linked?
  strength?: number // 0-1: how strong is the relationship?
  createdAtMs?: number
}
```

## 2. Visualization Enhancements

### Current State

- Basic ReactFlow visualization
- Simple hierarchical layout
- Node clicking navigates to note
- Search highlighting

### Gaps & Opportunities

#### A. Advanced Layout Algorithms

**Problem**: Current layout is basic and may not show structure well

**Solution**: Add multiple layout options

- **Force-directed** (D3 force simulation)
- **Hierarchical** (tree-based, root selection)
- **Circular** (for small graphs)
- **Grid** (for organized viewing)
- **Clustered** (group by topic/project)

#### B. Interactive Features

**Problem**: Limited interactivity

**Solution**: Add more interactions

- **Drag nodes** to reposition
- **Pin nodes** to keep in place
- **Expand/collapse** clusters
- **Focus mode** (highlight one note + connections)
- **Path highlighting** (show shortest path between two notes)
- **Timeline view** (arrange by creation date)

#### C. Filtering & Grouping

**Problem**: Basic filtering only

**Solution**: Enhanced filtering

- Filter by edge type (show only explicit links)
- Filter by date range (show notes created in period)
- Group by topic/project (visual clusters)
- Filter by link strength (if implemented)
- Show only hub notes (high centrality)

#### D. Graph Export UI (Phase 2.2 - Not Done)

**Problem**: Export functions exist but no UI

**Solution**: Add export menu to graph page

- Export as JSON
- Export as GraphML (for Gephi, Cytoscape)
- Export as Mermaid diagram
- Copy Mermaid to clipboard

#### E. Graph Statistics Dashboard

**Problem**: Stats exist but could be more visual

**Solution**: Enhanced statistics panel

- Visual charts (centrality distribution)
- Cluster visualization
- Growth over time graph
- Most connected notes list
- Orphan notes count

## 3. Agent-Based Knowledge Graph Building

### Opportunity: AI-Powered Graph Enhancement

The existing AI Agent Framework can be leveraged to automatically build and enhance the knowledge graph.

### Proposed Agent Tools

#### A. `analyze_note_relationships`

**Purpose**: Analyze note content and suggest relationships

**Input**:

- `noteId`: Note to analyze
- `scope`: 'all' | 'recent' | 'topic' | 'project'
- `minSimilarity`: Minimum similarity threshold (0-1)

**Output**:

```typescript
{
  suggestedLinks: Array<{
    targetNoteId: string
    targetTitle: string
    similarity: number
    reason: string // Why these notes are related
    suggestedEdgeType: 'explicit_link' | 'mention' | 'shared_context'
  }>
}
```

**Implementation**:

- Use embedding model (OpenAI, Anthropic) to compute note embeddings
- Compare embeddings to find similar notes
- Use LLM to explain relationship and suggest edge type
- Return ranked list of suggestions

#### B. `create_note_link`

**Purpose**: Create a link between two notes

**Input**:

- `fromNoteId`: Source note
- `toNoteId`: Target note
- `edgeType`: Type of link
- `context`: Optional context/explanation

**Output**:

```typescript
{
  success: boolean
  linkCreated: boolean // false if link already exists
  message: string
}
```

**Implementation**:

- Call note repository to update `linkedNoteIds`
- Trigger backlink recomputation
- Invalidate graph cache

#### C. `analyze_graph_structure`

**Purpose**: Analyze entire graph and suggest improvements

**Input**:

- `focusArea`: 'orphans' | 'clusters' | 'hubs' | 'all'
- `maxSuggestions`: Maximum number of suggestions

**Output**:

```typescript
{
  insights: Array<{
    type: 'orphan_note' | 'missing_link' | 'cluster_opportunity' | 'hub_candidate'
    noteId?: string
    noteIds?: string[]
    suggestion: string
    confidence: number
  }>
  graphMetrics: {
    density: number
    averageCentrality: number
    clusterCount: number
    orphanCount: number
  }
}
```

**Implementation**:

- Load full graph
- Run graph analytics
- Use LLM to identify patterns and suggest improvements
- Return actionable insights

#### D. `suggest_note_clusters`

**Purpose**: Identify groups of related notes that should be clustered

**Input**:

- `minClusterSize`: Minimum notes per cluster
- `maxClusters`: Maximum number of clusters to return

**Output**:

```typescript
{
  clusters: Array<{
    noteIds: string[]
    theme: string // What connects these notes
    suggestedHubNoteId?: string // Central note for cluster
    confidence: number
  }>
}
```

**Implementation**:

- Use clustering algorithm (e.g., community detection)
- Use LLM to identify themes
- Suggest hub notes for each cluster

### Agent Workflow: "Build Knowledge Graph"

**Goal**: Automatically analyze all notes and suggest/create relationships

**Steps**:

1. **Discovery Phase**
   - Agent calls `list_notes` to get all notes
   - Identifies orphan notes (no links)
   - Identifies notes with few connections

2. **Analysis Phase**
   - For each note, call `analyze_note_relationships`
   - Collect all relationship suggestions
   - Rank by similarity/confidence

3. **Review Phase**
   - Present suggestions to user
   - Allow user to approve/reject
   - Batch create approved links

4. **Enhancement Phase**
   - Call `analyze_graph_structure` to find gaps
   - Suggest missing links
   - Identify cluster opportunities

### Agent Template: "Knowledge Graph Builder"

**Agent Configuration**:

```typescript
{
  name: "Knowledge Graph Builder",
  role: "graph_analyst",
  systemPrompt: `You are a knowledge graph specialist. Your goal is to analyze notes and identify meaningful relationships between them. You should:

1. Analyze note content to find semantic similarities
2. Suggest links between related notes
3. Explain WHY notes should be linked
4. Identify clusters and themes
5. Find orphan notes that should be connected

Be conservative - only suggest links when there's a clear relationship.`,
  modelProvider: "openai",
  modelName: "gpt-4o",
  toolIds: [
    "tool:list_notes",
    "tool:read_note",
    "tool:analyze_note_relationships",
    "tool:create_note_link",
    "tool:analyze_graph_structure",
    "tool:suggest_note_clusters"
  ]
}
```

**Workspace Configuration**:

```typescript
{
  name: "Knowledge Graph Enhancement",
  workflowType: "sequential",
  agents: ["knowledge_graph_builder"],
  maxIterations: 10
}
```

**Example Run**:

```
Goal: Analyze my notes and suggest relationships to build a knowledge graph

Context: {
  focusArea: "orphans", // Start with orphan notes
  autoApprove: false // Require user approval
}
```

## 4. Implementation Priority

### Phase 2.2: Graph Export UI (High Priority)

- Quick win
- Users can export graphs for external analysis
- Estimated: 2-3 hours

### Phase 2.3: Performance Optimization (Medium Priority)

- Improves scalability
- Better UX for large note collections
- Estimated: 4-6 hours

### Phase 3: Agent-Based Graph Building (High Value)

- **3.1**: Add agent tools (`analyze_note_relationships`, `create_note_link`)
- **3.2**: Create "Knowledge Graph Builder" agent template
- **3.3**: Add UI for running graph analysis
- **3.4**: Batch link creation interface
- Estimated: 8-12 hours

### Phase 4: Visualization Enhancements (Medium Priority)

- **4.1**: Advanced layout algorithms
- **4.2**: Interactive features (drag, pin, expand)
- **4.3**: Enhanced filtering/grouping
- **4.4**: Graph statistics dashboard
- Estimated: 12-16 hours

### Phase 5: Explicit Graph Management (Low Priority)

- **5.1**: Graph membership UI
- **5.2**: Link context/metadata
- **5.3**: Bulk operations
- Estimated: 6-8 hours

## 5. Quick Wins

1. **Add "View in Graph" button to note editor** ✅ (Already done)
2. **Add graph export menu** (Phase 2.2)
3. **Add "Suggest Links" button** (Uses agent tools)
4. **Show graph connectivity in note list** (Visual indicator)
5. **Add "Related Notes" panel** (Uses graph to find related notes)

## Summary

### Current State

- ✅ Core graph infrastructure is solid
- ✅ Basic visualization works
- ✅ Link creation is manual but functional
- ⚠️ No automated relationship discovery
- ⚠️ Limited visualization options
- ⚠️ No graph export UI

### Biggest Opportunities

1. **Agent-powered graph building** - Automatically discover and create relationships
2. **Better visualization** - More layout options and interactivity
3. **Graph export** - Easy to implement, high user value
4. **Relationship suggestions** - Help users discover connections

### Recommended Next Steps

1. Complete Phase 2.2 (Graph Export UI) - Quick win
2. Implement Phase 3 (Agent Tools) - High value, leverages existing agent framework
3. Add "Suggest Links" feature - Uses agent tools, immediate value
4. Enhance visualization incrementally - Based on user feedback
