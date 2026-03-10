import { useMemo } from 'react'
import type { Run, WorkflowState } from '@lifeos/agents'
import {
  getWorkflowEvalAdapter,
  resolveWorkflowType,
} from '@/components/evaluation/workflowEvalAdapters'

export function useWorkflowEvalAdapter(run?: Run | null, workflowState?: WorkflowState | null) {
  return useMemo(() => {
    const workflowType = resolveWorkflowType(run, workflowState)
    const adapter = getWorkflowEvalAdapter(workflowType, workflowState)
    return { workflowType, adapter }
  }, [run, workflowState])
}
