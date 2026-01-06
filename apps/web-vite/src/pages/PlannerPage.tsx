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
import { Select, type SelectOption } from '@/components/Select'
import { SegmentedControl } from '@/components/SegmentedControl'
import { DomainBarChart } from '@/components/DomainBarChart'
import { calculateTaskStatistics, formatTimeMinutes } from '@/lib/taskStats'
import { groupTasksByBucket, type TaskFilters, type TimelineFilter } from '@/lib/priorityBuckets'
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
    createTask,
    updateTask,
    deleteTask,
    convertTaskToProject,
  } = useTodoOperations({ userId })

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

  // Filter states
  const [domainFilter, setDomainFilter] = useState<Domain | 'all'>('all')
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all')
  const [completionFilter, setCompletionFilter] = useState<'todo' | 'completed' | 'all'>('todo')
  const [minTimeHours, setMinTimeHours] = useState<number>(0)
  const [minTimeMinutes, setMinTimeMinutes] = useState<number>(0)
  const [maxTimeHours, setMaxTimeHours] = useState<number>(40)
  const [maxTimeMinutes, setMaxTimeMinutes] = useState<number>(0)

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

    let taskToSelect: CanonicalTask | null = null
    let projectToSelect: CanonicalProject | null = null
    let milestoneToSelect: CanonicalMilestone | null = null

    if (taskId) {
      const task = tasks.find((t) => t.id === taskId)
      if (task) {
        taskToSelect = task
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

    startTransition(() => {
      if (taskToSelect) setSelectedTask(taskToSelect)
      if (projectToSelect) setSelectedProject(projectToSelect)
      if (milestoneToSelect) setSelectedMilestone(milestoneToSelect)
      setSearchParams({}, { replace: true })
    })
  }, [tasks, projects, milestones, searchParams, setSearchParams])

  // Build filters object
  const filters: TaskFilters = useMemo(() => {
    return {
      domain: domainFilter,
      projectId: selectedProject?.id,
      milestoneId: selectedMilestone?.id,
      timeline: timelineFilter,
      completionStatus: completionFilter,
      minTimeHours,
      minTimeMinutes,
      maxTimeHours,
      maxTimeMinutes,
    }
  }, [
    domainFilter,
    selectedProject?.id,
    selectedMilestone?.id,
    timelineFilter,
    completionFilter,
    minTimeHours,
    minTimeMinutes,
    maxTimeHours,
    maxTimeMinutes,
  ])

  // Filter tasks based on filters
  const filteredTasks = useMemo(() => {
    if (viewMode === 'priority') {
      // For priority view, use groupTasksByBucket which applies all filters
      const groupedTasks = groupTasksByBucket(tasks, filters)
      const allFilteredTasks: CanonicalTask[] = []
      groupedTasks.forEach((bucketTasks) => {
        allFilteredTasks.push(...bucketTasks)
      })
      return allFilteredTasks
    } else {
      // For list view, apply basic filters
      let filtered = tasks

      if (selectedMilestone) {
        filtered = filtered.filter((t) => t.milestoneId === selectedMilestone.id)
      } else if (selectedProject) {
        filtered = filtered.filter((t) => t.projectId === selectedProject.id)
      }

      return filtered
    }
  }, [tasks, filters, viewMode, selectedProject, selectedMilestone])

  // Calculate statistics based on filtered tasks
  const stats = useMemo(() => calculateTaskStatistics(filteredTasks), [filteredTasks])

  // Prepare filter options
  const domainOptions: SelectOption[] = [
    { value: 'all', label: 'All' },
    { value: 'work', label: 'Work' },
    { value: 'projects', label: 'Projects' },
    { value: 'life', label: 'Life' },
    { value: 'learning', label: 'Learning' },
    { value: 'wellbeing', label: 'Wellbeing' },
  ]

  const timelineOptions: SelectOption[] = [
    { value: 'all', label: 'All' },
    { value: 'today', label: 'Today' },
    { value: 'next_3_days', label: 'Next 3 Days' },
    { value: 'this_week', label: 'This Week' },
    { value: 'this_month', label: 'This Month' },
    { value: 'later', label: 'Later' },
  ]

  const completionOptions = [
    { value: 'todo', label: 'To-Do' },
    { value: 'completed', label: 'Completed' },
    { value: 'all', label: 'All' },
  ]

  // Event handlers
  const handleSelectProject = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (project) {
      setSelectedProject(project)
      setSelectedMilestone(null)
      setSelectedTask(null)
    }
  }

  const handleSelectMilestone = (milestoneId: string) => {
    const milestone = milestones.find((m) => m.id === milestoneId)
    if (milestone) {
      setSelectedMilestone(milestone)
      const parentProject = projects.find((p) => p.id === milestone.projectId)
      if (parentProject) {
        setSelectedProject(parentProject)
      }
      setSelectedTask(null)
    }
  }

  const handleSelectOtherTasks = () => {
    setSelectedProject(null)
    setSelectedMilestone(null)
    setSelectedTask(null)
  }

  const handleClearSelection = () => {
    setSelectedProject(null)
    setSelectedMilestone(null)
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

    const newCalendarEvent = await eventService.createEvent(formData, { taskId: selectedTask.id })

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

  const activeTasks = useMemo(() => {
    return filteredTasks.filter((t) => !t.archived && !t.completed)
  }, [filteredTasks])

  const taskTelemetry = useMemo(() => {
    const completed = tasks.filter((t) => t.completed && !t.archived).length
    const pending = tasks.filter((t) => !t.completed && !t.archived).length
    const total = tasks.filter((t) => !t.archived).length
    return { completed, pending, total }
  }, [tasks])

  return (
    <section className="page-container planner-page">
      {/* ROW 1: View Toggle and Action Buttons */}
      <header className="planner-actions-bar">
        <div className="planner-actions-left">
          {/* View Mode Toggle */}
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

        <div className="planner-actions-right">
          {/* Action Buttons */}
          {selectedProject && (
            <button className="ghost-button" onClick={() => setIsMilestoneModalOpen(true)}>
              + Milestone
            </button>
          )}
          <button className="ghost-button" onClick={() => setIsProjectModalOpen(true)}>
            + Project
          </button>
          <button className="primary-button" onClick={() => setIsTaskModalOpen(true)}>
            + Task
          </button>
        </div>
      </header>

      {/* ROW 2: Filters */}
      <section className="planner-filters-bar">
        <div className="filters-left">
          {/* Filter Dropdowns */}
          <Select
            value={domainFilter}
            onChange={(value) => setDomainFilter(value as Domain | 'all')}
            options={domainOptions}
            placeholder="Domain"
            className="filter-select"
          />
          <Select
            value={timelineFilter}
            onChange={(value) => setTimelineFilter(value as TimelineFilter)}
            options={timelineOptions}
            placeholder="Timeline"
            className="filter-select"
          />
        </div>

        <div className="filters-right">
          {/* Status Toggle */}
          <SegmentedControl
            value={completionFilter}
            onChange={(value) => setCompletionFilter(value as 'todo' | 'completed' | 'all')}
            options={completionOptions}
            className="status-toggle"
          />

          {/* Time Range Inputs */}
          <div className="time-range-filter">
            <input
              type="number"
              min="0"
              max="99"
              value={minTimeHours}
              onChange={(e) => setMinTimeHours(Number(e.target.value))}
              className="time-input-small"
              placeholder="0"
            />
            <span className="time-label">h</span>
            <input
              type="number"
              min="0"
              max="59"
              value={minTimeMinutes}
              onChange={(e) => setMinTimeMinutes(Number(e.target.value))}
              className="time-input-small"
              placeholder="0"
            />
            <span className="time-label">m</span>
            <span className="time-separator">to</span>
            <input
              type="number"
              min="0"
              max="99"
              value={maxTimeHours}
              onChange={(e) => setMaxTimeHours(Number(e.target.value))}
              className="time-input-small"
              placeholder="40"
            />
            <span className="time-label">h</span>
            <input
              type="number"
              min="0"
              max="59"
              value={maxTimeMinutes}
              onChange={(e) => setMaxTimeMinutes(Number(e.target.value))}
              className="time-input-small"
              placeholder="0"
            />
            <span className="time-label">m</span>
          </div>
        </div>
      </section>

      {/* ROW 3: Stats Bar */}
      <section className="planner-stats-bar">
        <div className="stat-card">
          <span className="stat-label">Tasks Remaining</span>
          <strong className="stat-value">{stats.tasksRemaining}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Total Time</span>
          <strong className="stat-value">{formatTimeMinutes(stats.totalTimeMinutes)}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Urgent</span>
          <strong className="stat-value stat-urgent">{stats.urgentCount}</strong>
        </div>
        <div className="stat-card">
          <span className="stat-label">Overdue</span>
          <strong className="stat-value stat-overdue">{stats.overdueCount}</strong>
        </div>
        <div className="stat-card stat-card-7day">
          <span className="stat-label">Created (7d)</span>
          <strong className="stat-value">
            {stats.last7Days.tasksCreated} (
            {formatTimeMinutes(stats.last7Days.tasksCreatedTimeMinutes)})
          </strong>
        </div>
        <div className="stat-card stat-card-7day">
          <span className="stat-label">Completed (7d)</span>
          <strong className="stat-value">
            {stats.last7Days.tasksCompleted} (
            {formatTimeMinutes(stats.last7Days.tasksCompletedTimeMinutes)})
          </strong>
        </div>
        <div className="stat-card stat-card-wide stat-card-domains">
          <span className="stat-label">Domain Split</span>
          <DomainBarChart domainSplit={stats.domainSplit} />
        </div>
      </section>

      {/* ROW 4: Main Content Layout */}
      <section className="planner-layout">
        <aside className="planner-sidebar">
          {loading ? (
            <div className="loading-container">
              <p className="loading-text">Loading...</p>
            </div>
          ) : (
            <ProjectList
              projects={projects}
              milestones={milestones}
              tasks={tasks}
              onSelectProject={handleSelectProject}
              onSelectMilestone={handleSelectMilestone}
              onSelectOtherTasks={handleSelectOtherTasks}
              onClearSelection={handleClearSelection}
              selectedProjectId={selectedProject?.id}
              selectedMilestoneId={selectedMilestone?.id}
            />
          )}
        </aside>

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
                tasks={tasks}
                projects={projects}
                milestones={milestones}
                filters={filters}
                onSelectTask={setSelectedTask}
                onToggleComplete={handleToggleComplete}
                selectedTaskId={selectedTask?.id}
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
        initialTask={null}
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
