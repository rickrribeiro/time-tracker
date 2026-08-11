import React, { useEffect, useCallback } from 'react'
import { useUIStore } from './store/uiStore'
import { useTaskStore } from './modules/timetracker/store/taskStore'
import { useTagStore } from './modules/timetracker/store/tagStore'
import { ActiveTask } from './modules/timetracker/components/ActiveTask/ActiveTask'
import { TimelinePage } from './modules/timetracker/pages/TimelinePage'
import { CalendarPage } from './modules/timetracker/pages/CalendarPage'
import { TagsPage } from './modules/timetracker/pages/TagsPage'
import { DashboardPage } from './modules/timetracker/pages/DashboardPage'
import { TasksListPage } from './modules/timetracker/pages/TasksListPage'
import { HomePage } from './modules/home/pages/HomePage'
import { InboxPage } from './modules/inbox/pages/InboxPage'
import { TodoPage } from './modules/todo/pages/TodoPage'
import { BrainDumpPage } from './modules/braindump/pages/BrainDumpPage'
import { GoalsPage } from './modules/goals/pages/GoalsPage'
import { EstudosDashboardPage } from './modules/estudos/pages/EstudosDashboardPage'
import { TopicWorkspacePage } from './modules/estudos/pages/TopicWorkspacePage'
import { RevisoesPage } from './modules/estudos/pages/RevisoesPage'
import { ProjectsPage } from './modules/projects/pages/ProjectsPage'
import { IssuesPage } from './modules/projects/pages/IssuesPage'
import { HabitsPage } from './modules/habits/pages/HabitsPage'
import { KnowledgePage } from './modules/knowledge/pages/KnowledgePage'
import { QuickCapture } from './modules/inbox/components/QuickCapture'
import {
  FinanceDashboardPage,
  TransactionsPage,
  BudgetPage,
  InvestmentsPage,
  ReportsPage
} from './modules/finance/pages'
import {
  TripsPage,
  MonitoringPage,
  DestinationsPage,
  DocumentsPage,
  RecommendationsPage
} from './modules/travel/pages'
import { SettingsPage } from './modules/settings/pages/SettingsPage'
import { LinksPage } from './modules/links/pages/LinksPage'
import { AIPage } from './modules/ai/pages/AIPage'
import { SkillsPage } from './modules/ai/pages/SkillsPage'
import { AgentsPage } from './modules/ai/pages/AgentsPage'
import { PromptRunnerPage } from './modules/ai/pages/PromptRunnerPage'
import { HistoryPage } from './modules/ai/pages/HistoryPage'
import { Page } from './types'

interface NavItem {
  id: Page
  label: string
  icon: string
}

const NAV_GROUPS: { label: string; groupIcon?: string; items: NavItem[] }[] = [
  { label: '', items: [{ id: 'home', label: 'Dashboard', icon: '🏠' }] },
  {
    label: 'Time Tracker',
    groupIcon: '⏱',
    items: [
      { id: 'timeline', label: 'Timeline', icon: '⏱' },
      { id: 'calendar', label: 'Calendar', icon: '📅' },
      { id: 'tasks', label: 'Tasks', icon: '📋' },
      { id: 'tags', label: 'Tags', icon: '🏷' },
      { id: 'dashboard', label: 'Stats', icon: '📊' }
    ]
  },
  {
    label: 'Organização',
    groupIcon: '🗂',
    items: [
      { id: 'inbox', label: 'Inbox', icon: '📥' },
      { id: 'todo', label: 'TODO', icon: '✅' },
      { id: 'braindump', label: 'Brain Dump', icon: '🧠' },
      { id: 'goals', label: 'Metas', icon: '🎯' },
      { id: 'habits', label: 'Hábitos', icon: '🔥' },
      { id: 'knowledge', label: 'Base de Conhecimento', icon: '📚' }
    ]
  },
  {
    label: 'Estudos',
    groupIcon: '🎓',
    items: [
      { id: 'estudos', label: 'Dashboard', icon: '🎓' },
      { id: 'estudos-review', label: 'Revisões', icon: '🔁' }
    ]
  },
   {
    label: 'Finanças',
    groupIcon: '💰',
    items: [
      { id: 'finance-dashboard', label: 'Dashboard', icon: '💰' },
      { id: 'transactions', label: 'Transações', icon: '💸' },
      { id: 'budget', label: 'Orçamento', icon: '📉' },
      { id: 'investments', label: 'Investimentos', icon: '📈' },
      { id: 'reports', label: 'Relatórios', icon: '🧾' }
    ]
  },
  {
    label: 'Projetos',
    groupIcon: '📁',
    items: [
      { id: 'projects', label: 'Projetos', icon: '🗂' },
      { id: 'issues', label: 'Issues (Kanban)', icon: '📌' }
    ]
  },
  
  {
    label: 'Viagens',
    groupIcon: '✈️',
    items: [
      { id: 'trips', label: 'Próximas', icon: '✈️' },
      { id: 'trip-monitoring', label: 'Monitoramento', icon: '🔔' },
      { id: 'destinations', label: 'Destinos', icon: '🗺' },
      { id: 'documents', label: 'Documentos', icon: '📄' },
      { id: 'recommendations', label: 'Recomendações', icon: '⭐' }
    ]
  },
  {
    label: 'IA',
    groupIcon: '🤖',
    items: [
      { id: 'ai', label: 'Assistente', icon: '🤖' },
      { id: 'ai-skills', label: 'Skills', icon: '🧩' },
      { id: 'ai-agents', label: 'Agentes', icon: '🤝' },
      { id: 'ai-runner', label: 'Prompt Runner', icon: '▶️' },
      { id: 'ai-history', label: 'Histórico', icon: '🕐' }
    ]
  },
  { label: '', items: [{ id: 'settings', label: 'Configurações', icon: '⚙️' }] },
  { label: '', items: [{ id: 'links', label: 'Links', icon: '🔗' }] }
]

const PAGES: Record<Page, React.ComponentType> = {
  timeline: TimelinePage,
  calendar: CalendarPage,
  tasks: TasksListPage,
  dashboard: DashboardPage,
  tags: TagsPage,
  home: HomePage,
  inbox: InboxPage,
  todo: TodoPage,
  braindump: BrainDumpPage,
  goals: GoalsPage,
  estudos: EstudosDashboardPage,
  'estudos-topic': TopicWorkspacePage,
  'estudos-review': RevisoesPage,
  projects: ProjectsPage,
  issues: IssuesPage,
  habits: HabitsPage,
  knowledge: KnowledgePage,
  'finance-dashboard': FinanceDashboardPage,
  transactions: TransactionsPage,
  budget: BudgetPage,
  investments: InvestmentsPage,
  reports: ReportsPage,
  trips: TripsPage,
  'trip-monitoring': MonitoringPage,
  destinations: DestinationsPage,
  documents: DocumentsPage,
  recommendations: RecommendationsPage,
  ai: AIPage,
  'ai-skills': SkillsPage,
  'ai-agents': AgentsPage,
  'ai-runner': PromptRunnerPage,
  'ai-history': HistoryPage,
  settings: SettingsPage,
  links: LinksPage
}

// Ctrl+1..4 quick nav to the most-used pages
const QUICK_NAV: Page[] = ['home', 'timeline', 'inbox', 'projects']

const COLLAPSED_KEY = 'rickos:collapsedGroups'

export default function App(): React.ReactElement {
  const { currentPage, setPage } = useUIStore()
  const { refreshActive, stopActiveTask, activeTask } = useTaskStore()
  const { refreshTags } = useTagStore()

  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}')
    } catch {
      return {}
    }
  })

  const toggleGroup = useCallback((label: string) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] }
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const labeledGroups = NAV_GROUPS.filter((g) => g.label).map((g) => g.label)
  const allCollapsed = labeledGroups.every((l) => collapsed[l])

  const toggleAll = useCallback(() => {
    setCollapsed(() => {
      const next: Record<string, boolean> = {}
      // if everything is already collapsed, expand all; otherwise collapse all
      for (const l of labeledGroups) next[l] = !allCollapsed
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
      return next
    })
  }, [allCollapsed]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refreshTags()
    refreshActive()
  }, [])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ctrl+Space = stop active task (ignore the Ctrl+Shift+Space quick-capture combo)
      if (e.ctrlKey && !e.shiftKey && e.code === 'Space') {
        e.preventDefault()
        if (activeTask) stopActiveTask()
      }
      // Ctrl+1..4 = navigate to the most-used pages
      if (e.ctrlKey && e.key >= '1' && e.key <= '4') {
        setPage(QUICK_NAV[parseInt(e.key) - 1])
      }
    },
    [activeTask, stopActiveTask, setPage]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const PageComponent = PAGES[currentPage]

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">🧭</span>
          <span className="logo-text">RickOS</span>
        </div>
        <div className="nav-list">
          <button
            className="collapse-all-btn"
            onClick={toggleAll}
            title={allCollapsed ? 'Expandir todos os grupos' : 'Colapsar todos os grupos'}
          >
            {allCollapsed ? '⊞ Expandir tudo' : '⊟ Colapsar tudo'}
          </button>
          {NAV_GROUPS.map((group, gi) => {
            const collapsible = !!group.label
            const isCollapsed = collapsible && collapsed[group.label]
            return (
              <div className="nav-group" key={group.label || `g${gi}`}>
                {collapsible && (
                  <button
                    className="nav-group-label"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={!isCollapsed}
                  >
                    <span className={`nav-group-chevron ${isCollapsed ? 'collapsed' : ''}`}>▾</span>
                    {group.groupIcon && <span className="nav-group-icon">{group.groupIcon}</span>}
                    <span>{group.label}</span>
                  </button>
                )}
                {!isCollapsed && (
                  <ul>
                    {group.items.map((item) => (
                      <li key={item.id}>
                        <button
                          className={`nav-btn ${currentPage === item.id ? 'active' : ''}`}
                          onClick={() => setPage(item.id)}
                        >
                          {!group.label && <span className="nav-icon">{item.icon}</span>}
                          <span className="nav-label">{item.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
        <div className="sidebar-shortcuts">
          <div className="shortcut-hint">Ctrl+Space: Stop</div>
          <div className="shortcut-hint">Ctrl+Shift+Space: Capture</div>
          <div className="shortcut-hint">Ctrl+1-4: Navigate</div>
        </div>
        <div className="sidebar-footer">
          <button
            className="nav-btn export-btn"
            onClick={async () => {
              const res = await window.api.app.exportDb()
              if (res.ok) alert(res.message || 'Backup exportado!')
              else if (res.error) alert('Falha ao exportar: ' + res.error)
            }}
            title="Exportar backup (local ou Google Drive)"
            style={{ marginTop: '8px' }}
          >
            <span className="nav-icon">💾</span>
            <span className="nav-label">Export DB</span>
          </button>
          <button
            className="nav-btn export-btn"
            onClick={async () => {
              const confirmed = window.confirm(
                'This will replace ALL current data with the imported snapshot. Continue?'
              )
              if (!confirmed) return
              await window.api.app.importDb()
            }}
            title="Import Database Snapshot"
            style={{ marginTop: '4px' }}
          >
            <span className="nav-icon">📂</span>
            <span className="nav-label">Import DB</span>
          </button>
        </div>
      </nav>

      <main className="main-content">
        <ActiveTask />
        <div className="page-content">
          <PageComponent />
        </div>
      </main>

      <QuickCapture />
    </div>
  )
}
