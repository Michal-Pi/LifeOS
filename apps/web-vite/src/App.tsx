import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { GlobalSearch } from './components/GlobalSearch'
import { ErrorBoundary } from './components/ErrorBoundary'

// Pages
import { LoginPage } from './pages/LoginPage'
import { TodayPage } from './pages/TodayPage'
import { CalendarPage } from './pages/CalendarPage'
import { TodoPage } from './pages/TodoPage'
import { SettingsPage } from './pages/SettingsPage'
import { WeeklyReviewPage } from './pages/WeeklyReviewPage'

// Global styles (if any, or import from theme.css)
import './globals.css'

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <AuthProvider>
        <div className="app-container">
          {/* Basic Navigation (can be moved to a separate component) */}
          <nav className="main-nav">
            <NavLink to="/today" className={({ isActive }) => isActive ? 'active' : ''}>Today</NavLink>
            <NavLink to="/calendar" className={({ isActive }) => isActive ? 'active' : ''}>Calendar</NavLink>
            <NavLink to="/todo" className={({ isActive }) => isActive ? 'active' : ''}>To-Do</NavLink>
            <NavLink to="/settings" className={({ isActive }) => isActive ? 'active' : ''}>Settings</NavLink>
            <NavLink to="/review" className={({ isActive }) => isActive ? 'active' : ''}>Review</NavLink>
            <GlobalSearch />
          </nav>

          <div className="app-content">
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />

              {/* Protected Routes */}
              <Route path="/" element={<ProtectedRoute><ErrorBoundary><TodayPage /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/today" element={<ProtectedRoute><ErrorBoundary><TodayPage /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/calendar" element={<ProtectedRoute><ErrorBoundary><CalendarPage /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/todo" element={<ProtectedRoute><ErrorBoundary><TodoPage /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><ErrorBoundary><SettingsPage /></ErrorBoundary></ProtectedRoute>} />
              <Route path="/review" element={<ProtectedRoute><ErrorBoundary><WeeklyReviewPage /></ErrorBoundary></ProtectedRoute>} />

              {/* Fallback for unknown routes */}
              <Route path="*" element={<ProtectedRoute><ErrorBoundary><TodayPage /></ErrorBoundary></ProtectedRoute>} />
            </Routes>
          </div>
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
