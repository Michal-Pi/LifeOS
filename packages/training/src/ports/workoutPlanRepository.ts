import type { WorkoutPlan, PlanId, CreatePlanInput, UpdatePlanInput } from '../domain/models'

export interface WorkoutPlanRepository {
  create(userId: string, input: CreatePlanInput): Promise<WorkoutPlan>
  update(userId: string, planId: PlanId, updates: UpdatePlanInput): Promise<WorkoutPlan>
  delete(userId: string, planId: PlanId): Promise<void>
  get(userId: string, planId: PlanId): Promise<WorkoutPlan | null>
  getActive(userId: string): Promise<WorkoutPlan | null>
  list(userId: string): Promise<WorkoutPlan[]>
}
