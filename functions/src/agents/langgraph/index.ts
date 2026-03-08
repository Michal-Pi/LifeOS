/**
 * LangGraph Workflow Infrastructure
 *
 * This module provides unified LangGraph-based workflow execution for all workflow types:
 * - Sequential: Linear agent chain
 * - Parallel: Fan-out/fan-in execution
 * - Supervisor: Delegation-based coordination
 * - Graph: User-defined topology with conditional edges
 * - Custom: Same as graph with preset configurations
 * - Dialectical: 6-phase Hegelian reasoning cycle (Phase 1)
 */

// Re-export workflow state types
export type {
  UnifiedWorkflowState,
  CoreWorkflowState,
  GraphWorkflowState,
  DialecticalWorkflowState,
  ExpertCouncilWorkflowState,
  AgentExecutionStep,
  JoinBufferEntry,
  ThesisOutput,
  NegationOutput,
  ContradictionOutput,
  SublationOutput,
  RewriteOperator,
  RewriteOperatorType,
  KGDiff,
  DialecticalPhase,
  MetaDecision,
} from '@lifeos/agents'

export {
  createInitialCoreState,
  createInitialGraphState,
  createInitialDialecticalState,
  createInitialExpertCouncilState,
} from '@lifeos/agents'

// Export graph implementations
export {
  createSequentialGraph,
  executeSequentialWorkflowLangGraph,
  type SequentialGraphConfig,
} from './sequentialGraph.js'
export {
  createParallelGraph,
  executeParallelWorkflowLangGraph,
  type ParallelGraphConfig,
} from './parallelGraph.js'
export {
  createSupervisorGraph,
  executeSupervisorWorkflowLangGraph,
  type SupervisorGraphConfig,
} from './supervisorGraph.js'
export {
  createGenericGraph,
  executeGenericGraphWorkflowLangGraph,
  GenericGraphStateAnnotation,
  type GenericGraphConfig,
  type GenericGraphState,
} from './genericGraph.js'
export {
  createDialecticalGraph,
  executeDialecticalWorkflowLangGraph,
  type DialecticalGraphConfig,
} from './dialecticalGraph.js'

// Export checkpointer
export { FirestoreCheckpointer, createFirestoreCheckpointer } from './firestoreCheckpointer.js'

// Export Firestore sanitizer
export { sanitizeForFirestore, sanitizeWithWarning } from './firestoreSanitizer.js'

// Export shared utilities
export {
  WorkflowStatus,
  AgentEventStatus,
  executeAgentWithEvents,
  WorkflowExecutionError,
  wrapWorkflowError,
  getErrorMessage,
  type WorkflowStatusType,
  type AgentExecutionContext,
  type AgentExecutionOptions,
} from './utils.js'

// Export unified executor
export {
  executeLangGraphWorkflow,
  isLangGraphSupported,
  getWorkflowTypeDescription,
  createWorkflowCheckpointer,
  type LangGraphExecutionConfig,
  type LangGraphExecutionResult,
} from './executor.js'

// Export shared state annotations
export {
  ParallelStateAnnotation,
  SequentialStateAnnotation,
  SupervisorStateAnnotation,
  DialecticalStateAnnotation,
  type ParallelState,
  type SequentialState,
  type SupervisorState,
  type DialecticalState,
  type FailedAgentRecord,
} from './stateAnnotations.js'

// Export standardized events
export {
  createEvent,
  workflowStartEvent,
  workflowDoneEvent,
  workflowFailedEvent,
  agentStartEvent,
  agentDoneEvent,
  agentFailedEvent,
  nodeStartEvent,
  nodeDoneEvent,
  nodeFailedEvent,
  toolStartEvent,
  toolDoneEvent,
  toolFailedEvent,
  tokenDeltaEvent,
  waitingForInputEvent,
  inputReceivedEvent,
  checkpointSavedEvent,
  checkpointRestoredEvent,
  isFailureEvent,
  isCompletionEvent,
  isStartEvent,
  extractEventError,
  formatEventForLog,
  type WorkflowEvent,
  type WorkflowEventType,
  type EventError,
  type EventMetrics,
} from './events.js'
