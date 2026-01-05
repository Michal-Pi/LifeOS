import { useState, useEffect, useMemo, startTransition } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { useEventService } from '@/hooks/useEventService'
import { ProjectList } from '@/components/ProjectList'
import { TaskList } from '@/components/TaskList'
import { PriorityView } from '@/components/PriorityView'
import { TaskFormModal } from '@/components/TaskFormModal'
import { ProjectFormModal } from '@/components/ProjectFormModal'
import { MilestoneFormModal } from '@/components/MilestoneFormModal'
import { TaskDetailSidebar } from '@/components/TaskDetailSidebar'
import { EventFormModal, type EventFormData } from '@/components/EventFormModal'
import type { CanonicalProject, CanonicalMilestone, CanonicalTask, Domain } from '@/types/todo'

export function PlannerPage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = user?.uid ?? ''

  const {
    projects,
    milestones,
    tasks,
    loading,
    loadData,
    loadTasks,
    createProject,
    createMilestone,
    createTask, // Will be used by Add Task button
    updateTask,
    deleteTask,
    convertTaskToProject,
  } = useTodoOperations({ userId })

  // Event operations for scheduling - using clean service layer
  const eventService = useEventService({ userId })

  const [selectedProject, setSelectedProject] = useState<CanonicalProject | null>(null)
  const [selectedMilestone, setSelectedMilestone] = useState<CanonicalMilestone | null>(null)
  const [selectedTask, setSelectedTask] = useState<CanonicalTask | null>(null)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false)
  const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [scheduleDefaults, setScheduleDefaults] = useState<{
    durationMinutes: number
    formData: Partial<EventFormData>
  } | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'priority'>('list')
  const [priorityDomainFilter, setPriorityDomainFilter] = useState<'all' | Domain>('all')

  // Initial load
  useEffect(() => {
    if (userId) {
      void loadData({ includeTasks: false })
    }
  }, [userId, loadData])

  useEffect(() => {
    if (!userId) return
    const taskId = searchParams.get('taskId')
    const milestoneId = selectedMilestone?.id ?? searchParams.get('milestoneId')
    const projectId = selectedProject?.id ?? searchParams.get('projectId')

    if (taskId) {
      void loadTasks()
      return
    }

    if (milestoneId) {
      void loadTasks({ milestoneId })
      return
    }

    if (projectId) {
      void loadTasks({ projectId })
      return
    }

    void loadTasks()
  }, [userId, selectedMilestone, selectedProject, searchParams, loadTasks])

  // Handle incoming taskId from URL to auto-select a task
  useEffect(() => {
    const taskId = searchParams.get('taskId')
    const projectId = searchParams.get('projectId')
    const milestoneId = searchParams.get('milestoneId')

    if (!(taskId || projectId || milestoneId)) {
      return
    }
    if (taskId && tasks.length === 0) return
    if (projectId && projects.length === 0) return
    if (milestoneId && milestones.length === 0) return

    // Compute all selections first to avoid cascading state updates
    let taskToSelect: CanonicalTask | null = null
    let projectToSelect: CanonicalProject | null = null
    let milestoneToSelect: CanonicalMilestone | null = null

    if (taskId) {
      const task = tasks.find((t) => t.id === taskId)
      if (task) {
        taskToSelect = task
        // Also select the project/milestone to make it visible
        if (task.projectId) {
          const project = projects.find((p) => p.id === task.projectId)
          if (project) projectToSelect = project
        }
        if (task.milestoneId) {
          const milestone = milestones.find((m) => m.id === task.milestoneId)
          if (milestone) milestoneToSelect = milestone
        }
      }
    } else if (milestoneId) {
      const milestone = milestones.find((m) => m.id === milestoneId)
      if (milestone) {
        milestoneToSelect = milestone
        const project = projects.find((p) => p.id === milestone.projectId)
        if (project) projectToSelect = project
      }
    } else if (projectId) {
      const project = projects.find((p) => p.id === projectId)
      if (project) projectToSelect = project
    }

    // Batch all state updates together using startTransition
    startTransition(() => {
      if (taskToSelect) setSelectedTask(taskToSelect)
      if (projectToSelect) setSelectedProject(projectToSelect)
      if (milestoneToSelect) setSelectedMilestone(milestoneToSelect)
      // Clean up the URL
      setSearchParams({}, { replace: true })
    })
  }, [tasks, projects, milestones, searchParams, setSearchParams])

  // Filter tasks based on selection
  const filteredTasks = useMemo(() => {
    let filtered = tasks

    if (selectedMilestone) {
      filtered = filtered.filter((t) => t.milestoneId === selectedMilestone.id)
    } else if (selectedProject) {
      filtered = filtered.filter((t) => t.projectId === selectedProject.id)
    }

    return filtered
  }, [tasks, selectedProject, selectedMilestone])

  const activeTasks = useMemo(() => {
    return filteredTasks.filter((t) => !t.archived && !t.completed)
  }, [filteredTasks])

  const taskTelemetry = useMemo(() => {
    const completed = tasks.filter((t) => t.completed && !t.archived).length
    const pending = tasks.filter((t) => !t.completed && !t.archived).length
    const total = tasks.filter((t) => !t.archived).length
    return { completed, pending, total }
  }, [tasks])

  const handleSelectProject = (project: CanonicalProject) => {
    setSelectedProject(project)
    setSelectedMilestone(null) // Clear milestone selection when switching projects
    setSelectedTask(null)
  }

  const handleSelectMilestone = (milestone: CanonicalMilestone) => {
    setSelectedMilestone(milestone)
    // Auto-select parent project if not already selected
    const parentProject = projects.find((p) => p.id === milestone.projectId)
    if (parentProject) {
      setSelectedProject(parentProject)
    }
    setSelectedTask(null)
  }

  const handleToggleComplete = async (task: CanonicalTask) => {
    const updatedTask: CanonicalTask = {
      ...task,
      completed: !task.completed,
    }
    await updateTask(updatedTask)
  }

  const handleCreateTask = async (
    taskData: Omit<CanonicalTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => {
    await createTask(taskData)
    setIsTaskModalOpen(false)
  }

  const handleCreateProject = async (
    projectData: Omit<CanonicalProject, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => {
    await createProject(projectData)
    setIsProjectModalOpen(false)
  }

  const handleCreateMilestone = async (
    milestoneData: Omit<CanonicalMilestone, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => {
    await createMilestone(milestoneData)
    setIsMilestoneModalOpen(false)
  }

  const handleDeleteTask = async (taskId: string) => {
    await deleteTask(taskId)
    setSelectedTask(null)
  }

  const handleConvertTask = async (task: CanonicalTask) => {
    await convertTaskToProject(task)
    setSelectedTask(null)
  }

  const handleScheduleTask = (task: CanonicalTask) => {
    setSelectedTask(task)
    const durationMinutes =
      task.allocatedTimeMinutes && task.allocatedTimeMinutes > 0 ? task.allocatedTimeMinutes : 60
    setScheduleDefaults({
      durationMinutes,
      formData: {
        title: task.title,
        description: task.description,
        allDay: false,
      },
    })
    setIsScheduleModalOpen(true)
  }

  const handleSaveSchedule = async (formData: EventFormData) => {
    if (!selectedTask) return

    // 1. Create the event and get the created event object back
    const newCalendarEvent = await eventService.createEvent(formData, { taskId: selectedTask.id })

    // 2. Update the task
    const updatedTask: CanonicalTask = {
      ...selectedTask,
      status: 'scheduled',
      calendarEventIds: [
        ...(selectedTask.calendarEventIds || []),
        newCalendarEvent.canonicalEventId,
      ],
    }
    await updateTask(updatedTask)
    setIsScheduleModalOpen(false)
    setScheduleDefaults(null)
  }

  // Add state for project sidebar toggle
  const [isProjectSidebarOpen, setIsProjectSidebarOpen] = useState(true)

  return (
    <section className="page-container planner-page">
      <header className="planner-header">
        <div>
          <p className="section-label">
            Planner ·{' '}
            {selectedMilestone
              ? selectedMilestone.title
              : selectedProject
                ? selectedProject.title
                : 'All Tasks'}
          </p>
          <div className="planner-header-controls">
            <button
              className="ghost-button"
              onClick={() => setIsProjectSidebarOpen(!isProjectSidebarOpen)}
              title={isProjectSidebarOpen ? 'Hide projects' : 'Show projects'}
            >
              {isProjectSidebarOpen ? '‹ Hide' : '› Projects'}
            </button>
            <div className="view-toggles">
              <button
                className={`view-toggle ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
              >
                List
              </button>
              <button
                className={`view-toggle ${viewMode === 'priority' ? 'active' : ''}`}
                onClick={() => setViewMode('priority')}
              >
                Priority
              </button>
            </div>
          </div>
        </div>
        <div className="header-actions">
          {selectedProject && (
            <button className="ghost-button" onClick={() => setIsMilestoneModalOpen(true)}>
              + Milestone
            </button>
          )}
          <button className="ghost-button" onClick={() => setIsProjectModalOpen(true)}>
            + Project
          </button>
          <button className="primary-button" onClick={() => setIsTaskModalOpen(true)}>
            + New Task
          </button>
        </div>
      </header>

      <section className="planner-stats">
        <div>
          <p className="section-label">Active</p>
          <strong>{taskTelemetry.pending}</strong>
          <p>tasks remaining</p>
        </div>
        <div>
          <p className="section-label">Completed</p>
          <strong>{taskTelemetry.completed}</strong>
          <p>tasks done</p>
        </div>
        <div>
          <p className="section-label">Progress</p>
          <strong>
            {taskTelemetry.total > 0
              ? Math.round((taskTelemetry.completed / taskTelemetry.total) * 100)
              : 0}
            %
          </strong>
          <p className="planner-meta">
            {taskTelemetry.completed} of {taskTelemetry.total}
          </p>
        </div>
      </section>

      <section className="planner-layout">
        {isProjectSidebarOpen && (
          <aside className="planner-sidebar">
            <div className="sidebar-header">
              <h3>Projects</h3>
            </div>

            {loading ? (
              <p className="loading-text">Loading...</p>
            ) : (
              <ProjectList
                projects={projects}
                milestones={milestones}
                tasks={tasks}
                onSelectProject={handleSelectProject}
                onSelectMilestone={handleSelectMilestone}
                selectedProjectId={selectedProject?.id}
                selectedMilestoneId={selectedMilestone?.id}
              />
            )}
          </aside>
        )}

        <div className="planner-main-panel">
          <main className="planner-main">
            {selectedProject && (
              <div className="okr-display">
                {selectedMilestone ? (
                  <>
                    <h3>Milestone Objective</h3>
                    <p className="okr-objective">{selectedMilestone.objective || 'Not set'}</p>
                    {selectedMilestone.keyResults && selectedMilestone.keyResults.length > 0 && (
                      <ul className="key-results-list">
                        {selectedMilestone.keyResults.map((kr) => {
                          const linkedTasks = tasks.filter((t) => t.keyResultId === kr.id)
                          const completedTasks = linkedTasks.filter((t) => t.completed)
                          const progress =
                            linkedTasks.length > 0
                              ? (completedTasks.length / linkedTasks.length) * 100
                              : 0
                          return (
                            <li key={kr.id}>
                              <span>{kr.text}</span>
                              {linkedTasks.length > 0 && (
                                <div className="kr-progress">
                                  <span className="progress-text">
                                    {completedTasks.length}/{linkedTasks.length}
                                  </span>
                                  <div
                                    className="mini-progress-bar"
                                    title={`${Math.round(progress)}% complete`}
                                  >
                                    <div
                                      className="mini-progress-fill"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </>
                ) : (
                  <>
                    <h3>Project Objective</h3>
                    <p className="okr-objective">{selectedProject.objective || 'Not set'}</p>
                    {selectedProject.keyResults && selectedProject.keyResults.length > 0 && (
                      <ul className="key-results-list">
                        {selectedProject.keyResults.map((kr) => {
                          const linkedTasks = tasks.filter((t) => t.keyResultId === kr.id)
                          const completedTasks = linkedTasks.filter((t) => t.completed)
                          const progress =
                            linkedTasks.length > 0
                              ? (completedTasks.length / linkedTasks.length) * 100
                              : 0
                          return (
                            <li key={kr.id}>
                              <span>{kr.text}</span>
                              {linkedTasks.length > 0 && (
                                <div className="kr-progress">
                                  <span className="progress-text">
                                    {completedTasks.length}/{linkedTasks.length}
                                  </span>
                                  <div
                                    className="mini-progress-bar"
                                    title={`${Math.round(progress)}% complete`}
                                  >
                                    <div
                                      className="mini-progress-fill"
                                      style={{ width: `${progress}%` }}
                                    />
                                  </div>
                                </div>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            {viewMode === 'list' ? (
              <TaskList
                tasks={activeTasks}
                onSelectTask={setSelectedTask}
                onToggleComplete={handleToggleComplete}
                selectedTaskId={selectedTask?.id}
                onCreateTask={() => setIsTaskModalOpen(true)}
              />
            ) : (
              <PriorityView
                tasks={activeTasks}
                projects={projects}
                milestones={milestones}
                onSelectTask={setSelectedTask}
                onToggleComplete={handleToggleComplete}
                selectedTaskId={selectedTask?.id}
                domainFilter={priorityDomainFilter}
                onDomainFilterChange={setPriorityDomainFilter}
              />
            )}
          </main>
        </div>

        <TaskDetailSidebar
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={updateTask}
          onDelete={handleDeleteTask}
          onSchedule={handleScheduleTask}
          onConvert={handleConvertTask}
          telemetry={taskTelemetry}
        />
      </section>

      {/* Modals */}
      <TaskFormModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleCreateTask}
        projects={projects}
        milestones={milestones}
        initialTask={null} // Or pass selectedTask if editing
      />

      <ProjectFormModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onSave={handleCreateProject}
      />

      {selectedProject && (
        <MilestoneFormModal
          isOpen={isMilestoneModalOpen}
          onClose={() => setIsMilestoneModalOpen(false)}
          onSave={handleCreateMilestone}
          projectId={selectedProject.id}
        />
      )}

      {/* Reuse EventFormModal for scheduling */}
      <EventFormModal
        isOpen={isScheduleModalOpen}
        onClose={() => {
          setIsScheduleModalOpen(false)
          setScheduleDefaults(null)
        }}
        onSave={handleSaveSchedule}
        initialFormData={scheduleDefaults?.formData}
        defaultDurationMinutes={scheduleDefaults?.durationMinutes}
        mode="create"
      />
    </section>
  )
}
