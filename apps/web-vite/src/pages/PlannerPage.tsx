import { useState, useEffect, useMemo, startTransition } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useTodoOperations } from '@/hooks/useTodoOperations'
import { useTodoSync } from '@/hooks/useTodoSync'
import { useEventService } from '@/hooks/useEventService'
import { useDialog } from '@/contexts/useDialog'
import { ProjectList } from '@/components/ProjectList'
import { TaskList } from '@/components/TaskList'
import { PriorityView } from '@/components/PriorityView'
import { KanbanView } from '@/components/KanbanView'
import { TaskFormModal } from '@/components/TaskFormModal'
import { TaskBulkImportModal } from '@/components/TaskBulkImportModal'
import { ProjectFormModal } from '@/components/ProjectFormModal'
import { MarkdownImportModal } from '@/components/MarkdownImportModal'
import { ChapterFormModal } from '@/components/ChapterFormModal'
import { TaskDetailSidebar } from '@/components/TaskDetailSidebar'
import { EventFormModal, type EventFormData } from '@/components/EventFormModal'
import { Select, type SelectOption } from '@/components/Select'
import { SegmentedControl } from '@/components/SegmentedControl'
import { DomainBarChart } from '@/components/DomainBarChart'
import { calculateTaskStatistics, formatTimeMinutes } from '@/lib/taskStats'
import { groupTasksByBucket, type TaskFilters, type TimelineFilter } from '@/lib/priorityBuckets'
import type { CanonicalProject, CanonicalChapter, CanonicalTask, Domain } from '@/types/todo'

type ViewMode = 'priority' | 'list' | 'board'

export function PlannerPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const userId = user?.uid ?? ''

  const {
    projects,
    chapters,
    tasks,
    loading,
    loadData,
    loadTasks,
    createProject,
    createChapter,
    createTask,
    updateTask,
    deleteTask,
    deleteProject,
    convertTaskToProject,
  } = useTodoOperations({ userId })

  // Start todo sync worker
  useTodoSync()

  const eventService = useEventService({ userId })
  const { confirm } = useDialog()

  const [selectedProject, setSelectedProject] = useState<CanonicalProject | null>(null)
  const [selectedChapter, setSelectedChapter] = useState<CanonicalChapter | null>(null)
  const [selectedTask, setSelectedTask] = useState<CanonicalTask | null>(null)
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false)
  const [isTaskBulkImportModalOpen, setIsTaskBulkImportModalOpen] = useState(false)
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false)
  const [isProjectBulkImportModalOpen, setIsProjectBulkImportModalOpen] = useState(false)
  const [isChapterModalOpen, setIsChapterModalOpen] = useState(false)
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false)
  const [scheduleDefaults, setScheduleDefaults] = useState<{
    durationMinutes: number
    formData: Partial<EventFormData>
  } | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('priority')

  // Handle view mode change - clear project filters when switching to List
  const handleViewModeChange = (mode: string) => {
    const m = mode as ViewMode
    if (m === 'list') {
      // Clear project-related filters when switching to List view
      setSelectedProject(null)
      setSelectedChapter(null)
      setSelectedTask(null)
    }
    setViewMode(m)
  }

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
    const chapterParam = searchParams.get('chapterId') ?? searchParams.get('milestoneId')
    const chapterId = selectedChapter?.id ?? chapterParam
    const projectId = selectedProject?.id ?? searchParams.get('projectId')

    if (taskId) {
      void loadTasks()
      return
    }

    if (chapterId) {
      void loadTasks({ chapterId })
      return
    }

    if (projectId) {
      void loadTasks({ projectId })
      return
    }

    void loadTasks()
  }, [userId, selectedChapter, selectedProject, searchParams, loadTasks])

  // Handle incoming taskId from URL to auto-select a task
  useEffect(() => {
    const taskId = searchParams.get('taskId')
    const projectId = searchParams.get('projectId')
    const chapterId = searchParams.get('chapterId') ?? searchParams.get('milestoneId')

    if (!(taskId || projectId || chapterId)) {
      return
    }
    if (taskId && tasks.length === 0) return
    if (projectId && projects.length === 0) return
    if (chapterId && chapters.length === 0) return

    let taskToSelect: CanonicalTask | null = null
    let projectToSelect: CanonicalProject | null = null
    let chapterToSelect: CanonicalChapter | null = null

    if (taskId) {
      const task = tasks.find((t) => t.id === taskId)
      if (task) {
        taskToSelect = task
        if (task.projectId) {
          const project = projects.find((p) => p.id === task.projectId)
          if (project) projectToSelect = project
        }
        if (task.chapterId) {
          const chapter = chapters.find((m) => m.id === task.chapterId)
          if (chapter) chapterToSelect = chapter
        }
      }
    } else if (chapterId) {
      const chapter = chapters.find((m) => m.id === chapterId)
      if (chapter) {
        chapterToSelect = chapter
        const project = projects.find((p) => p.id === chapter.projectId)
        if (project) projectToSelect = project
      }
    } else if (projectId) {
      const project = projects.find((p) => p.id === projectId)
      if (project) projectToSelect = project
    }

    startTransition(() => {
      if (taskToSelect) setSelectedTask(taskToSelect)
      if (projectToSelect) setSelectedProject(projectToSelect)
      if (chapterToSelect) setSelectedChapter(chapterToSelect)
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('taskId')
      nextParams.delete('projectId')
      nextParams.delete('chapterId')
      nextParams.delete('milestoneId')
      setSearchParams(nextParams, { replace: true })
    })
  }, [tasks, projects, chapters, searchParams, setSearchParams])

  // Build filters object
  const filters: TaskFilters = useMemo(() => {
    return {
      domain: domainFilter,
      projectId: selectedProject?.id,
      chapterId: selectedChapter?.id,
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
    selectedChapter?.id,
    timelineFilter,
    completionFilter,
    minTimeHours,
    minTimeMinutes,
    maxTimeHours,
    maxTimeMinutes,
  ])

  // Filter tasks based on filters
  const filteredTasks = useMemo(() => {
    const groupedTasks = groupTasksByBucket(tasks, filters)
    const allFilteredTasks: CanonicalTask[] = []
    groupedTasks.forEach((bucketTasks) => {
      allFilteredTasks.push(...bucketTasks)
    })
    return allFilteredTasks
  }, [tasks, filters])

  // Calculate statistics: current-state stats from filtered, 7-day activity from all tasks
  const stats = useMemo(() => calculateTaskStatistics(filteredTasks, tasks), [filteredTasks, tasks])

  // Prepare filter options
  const domainOptions: SelectOption[] = [
    { value: 'all', label: 'All Domains' },
    { value: 'work', label: 'Work' },
    { value: 'projects', label: 'Projects' },
    { value: 'life', label: 'Life' },
    { value: 'learning', label: 'Learning' },
    { value: 'wellbeing', label: 'Wellbeing' },
  ]

  const timelineOptions: SelectOption[] = [
    { value: 'all', label: 'All time' },
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
      setSelectedChapter(null)
      setSelectedTask(null)
    }
  }

  const handleSelectChapter = (chapterId: string) => {
    const chapter = chapters.find((m) => m.id === chapterId)
    if (chapter) {
      setSelectedChapter(chapter)
      const parentProject = projects.find((p) => p.id === chapter.projectId)
      if (parentProject) {
        setSelectedProject(parentProject)
      }
      setSelectedTask(null)
    }
  }

  const handleSelectOtherTasks = () => {
    setSelectedProject(null)
    setSelectedChapter(null)
    setSelectedTask(null)
  }

  const handleClearSelection = () => {
    setSelectedProject(null)
    setSelectedChapter(null)
    setSelectedTask(null)
  }

  const handleToggleComplete = async (task: CanonicalTask) => {
    const updatedTask: CanonicalTask = {
      ...task,
      completed: !task.completed,
    }
    await updateTask(updatedTask)
  }

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    const statusMap: Record<string, CanonicalTask['status']> = {
      inbox: 'inbox',
      pending: 'inbox',
      active: 'next_action',
      todo: 'next_action',
      in_progress: 'scheduled',
      started: 'scheduled',
      completed: 'done',
      done: 'done',
    }
    const mappedStatus = statusMap[newStatus] ?? task.status
    const completed = mappedStatus === 'done'
    await updateTask({
      ...task,
      status: mappedStatus,
      completed,
      completedAt: completed ? new Date().toISOString().split('T')[0] : task.completedAt,
    })
  }

  const handleCreateTask = async (
    taskData: Omit<CanonicalTask, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => {
    try {
      await createTask(taskData)
    } catch {
      // Error is already handled and shown via toast in useTodoOperations
    } finally {
      setIsTaskModalOpen(false)
    }
  }

  const handleCreateProject = async (
    projectData: Omit<CanonicalProject, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => {
    const id = await createProject(projectData)
    setIsProjectModalOpen(false)
    return id as string
  }

  const handleCreateChapter = async (
    chapterData: Omit<CanonicalChapter, 'id' | 'userId' | 'createdAt' | 'updatedAt'>
  ) => {
    await createChapter(chapterData)
    setIsChapterModalOpen(false)
  }

  const handleDeleteTask = async (taskId: string) => {
    await deleteTask(taskId)
    setSelectedTask(null)
  }

  const handleDeleteProject = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId)
    if (!project) return

    const projectTasks = tasks.filter((t) => t.projectId === projectId)
    const projectChapters = chapters.filter((c) => c.projectId === projectId)

    const confirmed = await confirm({
      title: 'Delete project',
      description: `Delete "${project.title}"? This will also delete ${projectChapters.length} chapter(s) and ${projectTasks.length} task(s). This cannot be undone.`,
      confirmLabel: 'Delete',
      confirmVariant: 'danger',
    })

    if (!confirmed) return

    await deleteProject(projectId)

    if (selectedProject?.id === projectId) {
      setSelectedProject(null)
      setSelectedChapter(null)
      setSelectedTask(null)
    }
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

  const taskTelemetry = useMemo(() => {
    const completed = tasks.filter((t) => t.completed && !t.archived).length
    const pending = tasks.filter((t) => !t.completed && !t.archived).length
    const total = tasks.filter((t) => !t.archived).length
    return { completed, pending, total }
  }, [tasks])

  const showSidebar = viewMode !== 'list' && viewMode !== 'board'

  return (
    <section className="page-container planner-page">
      {/* ROW 1: View Toggle and Action Buttons */}
      <header className="planner-actions-bar">
        <div className="planner-actions-left">
          <SegmentedControl
            value={viewMode}
            onChange={handleViewModeChange}
            options={[
              { value: 'priority', label: 'Priority' },
              { value: 'list', label: 'List' },
              { value: 'board', label: 'Board' },
            ]}
            className="status-toggle"
          />
        </div>

        <div className="planner-actions-right">
          <button className="ghost-button" onClick={() => navigate('/plan')}>
            Training
          </button>
          <button className="ghost-button" onClick={() => navigate('/habits')}>
            Habits
          </button>
          {selectedProject && (
            <button className="ghost-button" onClick={() => setIsChapterModalOpen(true)}>
              + Chapter
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
          <SegmentedControl
            value={completionFilter}
            onChange={(value) => setCompletionFilter(value as 'todo' | 'completed' | 'all')}
            options={completionOptions}
            className="status-toggle"
          />

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
      <section
        className={`planner-layout ${viewMode === 'list' ? 'planner-layout-list' : ''} ${viewMode === 'board' ? 'planner-layout-board' : ''}`}
      >
        {showSidebar && (
          <aside className="planner-sidebar">
            {loading ? (
              <div className="loading-container">
                <p className="loading-text">Loading...</p>
              </div>
            ) : (
              <ProjectList
                projects={projects}
                chapters={chapters}
                tasks={tasks}
                onSelectProject={handleSelectProject}
                onSelectChapter={handleSelectChapter}
                onSelectOtherTasks={handleSelectOtherTasks}
                onClearSelection={handleClearSelection}
                onDeleteProject={handleDeleteProject}
                selectedProjectId={selectedProject?.id}
                selectedChapterId={selectedChapter?.id}
              />
            )}
          </aside>
        )}

        <div className="planner-main-panel">
          <main className="planner-main">
            {showSidebar && selectedProject && (
              <div className="okr-display">
                {selectedChapter ? (
                  <>
                    <h3>Chapter Objective</h3>
                    <p className="okr-objective">{selectedChapter.objective || 'Not set'}</p>
                    {selectedChapter.keyResults && selectedChapter.keyResults.length > 0 && (
                      <ul className="key-results-list">
                        {selectedChapter.keyResults.map((kr) => {
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
                tasks={filteredTasks}
                projects={projects}
                onSelectTask={setSelectedTask}
                onToggleComplete={handleToggleComplete}
                selectedTaskId={selectedTask?.id}
                onCreateTask={() => setIsTaskModalOpen(true)}
                completionFilter={completionFilter}
              />
            ) : viewMode === 'board' ? (
              <KanbanView
                tasks={filteredTasks}
                projects={projects}
                onTaskClick={setSelectedTask}
                onStatusChange={handleStatusChange}
              />
            ) : (
              <PriorityView
                tasks={tasks}
                projects={projects}
                chapters={chapters}
                filters={filters}
                onSelectTask={setSelectedTask}
                onToggleComplete={handleToggleComplete}
                selectedTaskId={selectedTask?.id}
              />
            )}
          </main>
        </div>

        {showSidebar && (
          <TaskDetailSidebar
            key={`${selectedTask?.id ?? 'none'}:${selectedTask?.updatedAt ?? '0'}`}
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onUpdate={updateTask}
            onDelete={handleDeleteTask}
            onSchedule={handleScheduleTask}
            onConvert={handleConvertTask}
            telemetry={taskTelemetry}
          />
        )}
      </section>

      {/* Modals */}
      <TaskFormModal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        onSave={handleCreateTask}
        projects={projects}
        chapters={chapters}
        initialTask={null}
        onImportTasks={() => {
          setIsTaskModalOpen(false)
          setIsTaskBulkImportModalOpen(true)
        }}
        onImportComplete={() => {
          loadTasks()
        }}
      />

      <TaskBulkImportModal
        isOpen={isTaskBulkImportModalOpen}
        onClose={() => setIsTaskBulkImportModalOpen(false)}
        onImportComplete={() => {
          loadTasks()
        }}
        projects={projects}
        chapters={chapters}
      />

      <ProjectFormModal
        isOpen={isProjectModalOpen}
        onClose={() => setIsProjectModalOpen(false)}
        onSave={handleCreateProject}
        onSaveChapter={createChapter}
        onImportProjects={() => {
          setIsProjectModalOpen(false)
          setIsProjectBulkImportModalOpen(true)
        }}
        onImportComplete={() => {
          loadData()
        }}
      />

      <MarkdownImportModal
        isOpen={isProjectBulkImportModalOpen}
        onClose={() => setIsProjectBulkImportModalOpen(false)}
        onImportComplete={() => {
          setIsProjectBulkImportModalOpen(false)
          loadData()
        }}
      />

      {selectedProject && (
        <ChapterFormModal
          isOpen={isChapterModalOpen}
          onClose={() => setIsChapterModalOpen(false)}
          onSave={handleCreateChapter}
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
