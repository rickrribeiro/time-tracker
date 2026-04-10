import React, { useEffect, useCallback } from 'react'
import { useUIStore } from './store/uiStore'
import { useTaskStore } from './store/taskStore'
import { useTagStore } from './store/tagStore'
import { ActiveTask } from './components/ActiveTask/ActiveTask'
import { TimelinePage } from './pages/TimelinePage'
import { CalendarPage } from './pages/CalendarPage'
import { TagsPage } from './pages/TagsPage'
import { DashboardPage } from './pages/DashboardPage'
import { TasksListPage } from './pages/TasksListPage'
import { Page } from './types'

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'timeline', label: 'Timeline', icon: '⏱' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'tasks', label: 'All Tasks', icon: '📋' },
  { id: 'dashboard', label: 'Stats', icon: '📊' },
  { id: 'tags', label: 'Tags', icon: '🏷' }
]

export default function App(): React.ReactElement {
  const { currentPage, setPage, selectedDate } = useUIStore()
  const { refreshActive, startTask, stopActiveTask, activeTask } = useTaskStore()
  const { refreshTags } = useTagStore()

  useEffect(() => {
    refreshTags()
    refreshActive()
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ctrl+Space = stop active task
      if (e.ctrlKey && e.code === 'Space') {
        e.preventDefault()
        if (activeTask) {
          stopActiveTask()
        }
      }
      // Ctrl+1..4 = navigate pages
      if (e.ctrlKey && e.key >= '1' && e.key <= '4') {
        const pages: Page[] = ['timeline', 'calendar', 'dashboard', 'tags']
        setPage(pages[parseInt(e.key) - 1])
      }
    },
    [activeTask, stopActiveTask, setPage]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">⏱</span>
          <span className="logo-text">TimeTracker</span>
        </div>
        <ul className="nav-list">
          {NAV_ITEMS.map((item) => (
            <li key={item.id}>
              <button
                className={`nav-btn ${currentPage === item.id ? 'active' : ''}`}
                onClick={() => setPage(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="sidebar-shortcuts">
          <div className="shortcut-hint">Ctrl+Space: Stop</div>
          <div className="shortcut-hint">Ctrl+1-4: Navigate</div>
        </div>
        <div className="sidebar-footer">
          <button
            className="nav-btn export-btn"
            onClick={async () => {
              const success = await window.api.app.exportDb()
              if (success) {
                alert('Database exported successfully!')
              }
            }}
            title="Export Database Snapshot"
            style={{ marginTop: '8px' }}
          >
            <span className="nav-icon">💾</span>
            <span className="nav-label">Export DB</span>
          </button>
        </div>
      </nav>

      <main className="main-content">
        <ActiveTask />
        <div className="page-content">
          {currentPage === 'timeline' && <TimelinePage />}
          {currentPage === 'calendar' && <CalendarPage />}
          {currentPage === 'dashboard' && <DashboardPage />}
          {currentPage === 'tasks' && <TasksListPage />}
          {currentPage === 'tags' && <TagsPage />}
        </div>
      </main>
    </div>
  )
}
