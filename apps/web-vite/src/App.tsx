import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Toaster } from 'sonner'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { GlobalSearch } from './components/GlobalSearch'
import { ErrorBoundary } from './components/ErrorBoundary'

// Global styles (if any, or import from theme.css)
import './globals.css'

// Lazy-loaded pages for code splitting
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })))
const TodayPage = lazy(() => import('./pages/TodayPage').then((m) => ({ default: m.TodayPage })))
const CalendarPage = lazy(() =>
  import('./pages/CalendarPage').then((m) => ({ default: m.CalendarPage }))
)
const TodoPage = lazy(() => import('./pages/TodoPage').then((m) => ({ default: m.TodoPage })))
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
)
const WeeklyReviewPage = lazy(() =>
  import('./pages/WeeklyReviewPage').then((m) => ({ default: m.WeeklyReviewPage }))
)
const HabitsPage = lazy(() => import('./pages/HabitsPage').then((m) => ({ default: m.HabitsPage })))
const ExerciseLibraryPage = lazy(() =>
  import('./pages/ExerciseLibraryPage').then((m) => ({ default: m.ExerciseLibraryPage }))
)
const WorkoutTemplatePage = lazy(() =>
  import('./pages/WorkoutTemplatePage').then((m) => ({ default: m.WorkoutTemplatePage }))
)
const WorkoutPlanPage = lazy(() =>
  import('./pages/WorkoutPlanPage').then((m) => ({ default: m.WorkoutPlanPage }))
)

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
        <p className="mt-2 text-sm text-gray-600">Loading...</p>
      </div>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <AuthProvider>
        <div className="app-container">
          {/* Basic Navigation (can be moved to a separate component) */}
          <nav className="main-nav">
            <NavLink to="/today" className={({ isActive }) => (isActive ? 'active' : '')}>
              Today
            </NavLink>
            <NavLink to="/calendar" className={({ isActive }) => (isActive ? 'active' : '')}>
              Calendar
            </NavLink>
            <NavLink to="/todo" className={({ isActive }) => (isActive ? 'active' : '')}>
              To-Do
            </NavLink>
            <NavLink to="/habits" className={({ isActive }) => (isActive ? 'active' : '')}>
              Habits
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? 'active' : '')}>
              Settings
            </NavLink>
            <NavLink to="/review" className={({ isActive }) => (isActive ? 'active' : '')}>
              Review
            </NavLink>
            <GlobalSearch />
          </nav>

          <div className="app-content">
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
                  path="/todo"
                  element={
                    <ProtectedRoute>
                      <ErrorBoundary>
                        <TodoPage />
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
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
