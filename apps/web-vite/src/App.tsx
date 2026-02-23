import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { Toaster } from 'sonner'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TopNav } from './components/TopNav'
import { useNotifications } from './hooks/useNotifications'
import { Providers } from './components/Providers'

// Global styles (if any, or import from theme.css)
import './globals.css'

// Helper to handle chunk loading errors (e.g., after deployment when old chunks are cached)
function lazyWithRetry<T extends React.ComponentType>(
  importFn: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(() =>
    importFn().catch((error) => {
      // Check if it's a chunk loading error (usually means new deployment or offline)
      const isChunkError =
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.message?.includes('Loading chunk') ||
        error?.message?.includes('Unable to preload CSS') ||
        error?.name === 'ChunkLoadError'

      if (isChunkError) {
        // Check if we're offline - don't reload, just show error boundary
        if (!navigator.onLine) {
          throw new Error('This page is not available offline. Please reconnect to the internet.')
        }
        // Clear service worker cache and reload
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
        }
        // Clear all caches
        if ('caches' in window) {
          caches.keys().then((keys) => {
            keys.forEach((key) => caches.delete(key))
          })
        }
        // Reload the page to get fresh chunks
        window.location.reload()
        // Return a promise that never resolves to prevent further errors
        return new Promise(() => {})
      }
      // For other errors, rethrow
      throw error
    })
  )
}

// Lazy-loaded pages for code splitting
const LoginPage = lazyWithRetry(() =>
  import('./pages/LoginPage').then((m) => ({ default: m.LoginPage }))
)
const TodayPage = lazyWithRetry(() =>
  import('./pages/TodayPage').then((m) => ({ default: m.TodayPage }))
)
const CalendarPage = lazyWithRetry(() =>
  import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage }))
)
const PlannerPage = lazyWithRetry(() =>
  import('./pages/PlannerPage').then((m) => ({ default: m.PlannerPage }))
)
const NotesPage = lazyWithRetry(() =>
  import('./pages/NotesPage').then((m) => ({ default: m.NotesPage }))
)
const NoteGraphPage = lazyWithRetry(() =>
  import('./pages/NoteGraphPage').then((m) => ({ default: m.NoteGraphPage }))
)
const SettingsPage = lazyWithRetry(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
)
const WeeklyReviewPage = lazyWithRetry(() =>
  import('./pages/WeeklyReviewPage').then((m) => ({ default: m.WeeklyReviewPage }))
)
const HabitsPage = lazyWithRetry(() =>
  import('./pages/HabitsPage').then((m) => ({ default: m.HabitsPage }))
)
const ExerciseLibraryPage = lazyWithRetry(() =>
  import('./pages/ExerciseLibraryPage').then((m) => ({ default: m.ExerciseLibraryPage }))
)
const WorkoutTemplatePage = lazyWithRetry(() =>
  import('./pages/WorkoutTemplatePage').then((m) => ({ default: m.WorkoutTemplatePage }))
)
const WorkoutPlanPage = lazyWithRetry(() =>
  import('./pages/WorkoutPlanPage').then((m) => ({ default: m.WorkoutPlanPage }))
)
const AgentsPage = lazyWithRetry(() =>
  import('./pages/AgentsPage').then((m) => ({ default: m.AgentsPage }))
)
const WorkflowsPage = lazyWithRetry(() =>
  import('./pages/WorkflowsPage').then((m) => ({ default: m.WorkflowsPage }))
)
const WorkflowDetailPage = lazyWithRetry(() =>
  import('./pages/WorkflowDetailPage').then((m) => ({ default: m.WorkflowDetailPage }))
)
const PromptLibraryPage = lazyWithRetry(() =>
  import('./pages/PromptLibraryPage').then((m) => ({ default: m.PromptLibraryPage }))
)
const ModelSettingsPage = lazyWithRetry(() =>
  import('./pages/ModelSettingsPage').then((m) => ({ default: m.ModelSettingsPage }))
)
const AIToolSettingsPage = lazyWithRetry(() =>
  import('./pages/AIToolSettingsPage').then((m) => ({ default: m.AIToolSettingsPage }))
)
const MailboxPage = lazyWithRetry(() =>
  import('./pages/MailboxPage').then((m) => ({ default: m.MailboxPage }))
)
const PeoplePage = lazyWithRetry(() =>
  import('./pages/PeoplePage').then((m) => ({ default: m.PeoplePage }))
)

// Loading fallback component
function PageLoader() {
  return (
    <div className="page-loader">
      <div className="page-loader__content">
        <div className="page-loader__spinner" />
        <p className="page-loader__label">Loading...</p>
      </div>
    </div>
  )
}

/**
 * Notification Listener Component
 * Listens for and displays notifications when user is authenticated
 */
function NotificationListener() {
  useNotifications()
  return null
}

function AppRoutes() {
  const location = useLocation()
  const isLoginRoute = location.pathname === '/login'
  const contentClass = isLoginRoute ? 'app-content app-content--public' : 'app-content'

  useEffect(() => {
    const removeInjectedSurvey = (root: ParentNode) => {
      const forms = root.querySelectorAll('#surveyForm')
      forms.forEach((form) => {
        let wrapper: HTMLElement | null = form.closest('div')
        while (wrapper && wrapper !== document.body) {
          if (wrapper.querySelector('style') && wrapper.contains(form)) break
          wrapper = wrapper.parentElement
        }
        if (wrapper && wrapper !== document.body) {
          wrapper.remove()
          return
        }
        form.remove()
      })
    }

    removeInjectedSurvey(document)
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return
          if (node.id === 'surveyForm' || node.querySelector?.('#surveyForm')) {
            removeInjectedSurvey(node)
          }
        })
      })
    })
    observer.observe(document.body, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [])

  return (
    <>
      <Toaster position="top-right" richColors />
      <NotificationListener />
      <div className="app-container">
        {!isLoginRoute && <TopNav />}

        <div className={contentClass}>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected Routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <TodayPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/today"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <TodayPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/mailbox"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <MailboxPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/people"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <PeoplePage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/calendar"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <CalendarPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/planner"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <PlannerPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              {/* Redirect old /todo route to /planner for backward compatibility */}
              <Route
                path="/todo"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <PlannerPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notes"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <NotesPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/notes/graph"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <NoteGraphPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/learning"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <NotesPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/habits"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <HabitsPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/agents"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <AgentsPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/agents/prompts"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <PromptLibraryPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/workflows"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <WorkflowsPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/workflows/:workflowId"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <WorkflowDetailPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/exercises"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <ExerciseLibraryPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/templates"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <WorkoutTemplatePage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/plan"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <WorkoutPlanPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <SettingsPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/models"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <ModelSettingsPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings/ai-tools"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <AIToolSettingsPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/review"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <WeeklyReviewPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />

              {/* Fallback for unknown routes */}
              <Route
                path="*"
                element={
                  <ProtectedRoute>
                    <ErrorBoundary>
                      <TodayPage />
                    </ErrorBoundary>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </div>
      </div>
    </>
  )
}

function App() {
  return (
    <Providers>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </Providers>
  )
}

export default App
