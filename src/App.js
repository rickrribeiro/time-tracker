import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useCallback } from 'react';
import { useUIStore } from './store/uiStore';
import { useTaskStore } from './store/taskStore';
import { useTagStore } from './store/tagStore';
import { ActiveTask } from './components/ActiveTask/ActiveTask';
import { TimelinePage } from './pages/TimelinePage';
import { CalendarPage } from './pages/CalendarPage';
import { TagsPage } from './pages/TagsPage';
import { DashboardPage } from './pages/DashboardPage';
import { TasksListPage } from './pages/TasksListPage';
import { HomePage } from './modules/home/pages/HomePage';
import { InboxPage } from './modules/inbox/pages/InboxPage';
import { TodoPage } from './modules/todo/pages/TodoPage';
import { ProjectsPage } from './modules/projects/pages/ProjectsPage';
import { IssuesPage } from './modules/projects/pages/IssuesPage';
import { HabitsPage } from './modules/habits/pages/HabitsPage';
import { QuickCapture } from './modules/inbox/components/QuickCapture';
import { FinanceDashboardPage, TransactionsPage, BudgetPage, InvestmentsPage, ReportsPage } from './modules/finance/pages';
import { TripsPage, MonitoringPage, DestinationsPage, DocumentsPage, RecommendationsPage } from './modules/travel/pages';
import { SettingsPage } from './modules/settings/pages/SettingsPage';
const NAV_GROUPS = [
    { label: '', items: [{ id: 'home', label: 'Dashboard', icon: '🏠' }] },
    {
        label: 'Time Tracker',
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
        items: [
            { id: 'inbox', label: 'Inbox', icon: '📥' },
            { id: 'todo', label: 'TODO', icon: '✅' },
            { id: 'habits', label: 'Hábitos', icon: '🔥' }
        ]
    },
    {
        label: 'Projetos',
        items: [
            { id: 'projects', label: 'Projetos', icon: '🗂' },
            { id: 'issues', label: 'Issues (Kanban)', icon: '📌' }
        ]
    },
    {
        label: 'Finanças',
        items: [
            { id: 'finance-dashboard', label: 'Dashboard', icon: '💰' },
            { id: 'transactions', label: 'Transações', icon: '💸' },
            { id: 'budget', label: 'Orçamento', icon: '📉' },
            { id: 'investments', label: 'Investimentos', icon: '📈' },
            { id: 'reports', label: 'Relatórios', icon: '🧾' }
        ]
    },
    {
        label: 'Viagens',
        items: [
            { id: 'trips', label: 'Próximas', icon: '✈️' },
            { id: 'trip-monitoring', label: 'Monitoramento', icon: '🔔' },
            { id: 'destinations', label: 'Destinos', icon: '🗺' },
            { id: 'documents', label: 'Documentos', icon: '📄' },
            { id: 'recommendations', label: 'Recomendações', icon: '⭐' }
        ]
    },
    { label: '', items: [{ id: 'settings', label: 'Configurações', icon: '⚙️' }] }
];
const PAGES = {
    timeline: TimelinePage,
    calendar: CalendarPage,
    tasks: TasksListPage,
    dashboard: DashboardPage,
    tags: TagsPage,
    home: HomePage,
    inbox: InboxPage,
    todo: TodoPage,
    projects: ProjectsPage,
    issues: IssuesPage,
    habits: HabitsPage,
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
    settings: SettingsPage
};
// Ctrl+1..4 quick nav to the most-used pages
const QUICK_NAV = ['home', 'timeline', 'inbox', 'projects'];
const COLLAPSED_KEY = 'rickos:collapsedGroups';
export default function App() {
    const { currentPage, setPage } = useUIStore();
    const { refreshActive, stopActiveTask, activeTask } = useTaskStore();
    const { refreshTags } = useTagStore();
    const [collapsed, setCollapsed] = React.useState(() => {
        try {
            return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}');
        }
        catch {
            return {};
        }
    });
    const toggleGroup = useCallback((label) => {
        setCollapsed((prev) => {
            const next = { ...prev, [label]: !prev[label] };
            localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
            return next;
        });
    }, []);
    useEffect(() => {
        refreshTags();
        refreshActive();
    }, []);
    const handleKeyDown = useCallback((e) => {
        // Ctrl+Space = stop active task (ignore the Ctrl+Shift+Space quick-capture combo)
        if (e.ctrlKey && !e.shiftKey && e.code === 'Space') {
            e.preventDefault();
            if (activeTask)
                stopActiveTask();
        }
        // Ctrl+1..4 = navigate to the most-used pages
        if (e.ctrlKey && e.key >= '1' && e.key <= '4') {
            setPage(QUICK_NAV[parseInt(e.key) - 1]);
        }
    }, [activeTask, stopActiveTask, setPage]);
    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
    const PageComponent = PAGES[currentPage];
    return (_jsxs("div", { className: "app", children: [_jsxs("nav", { className: "sidebar", children: [_jsxs("div", { className: "sidebar-logo", children: [_jsx("span", { className: "logo-icon", children: "\uD83E\uDDED" }), _jsx("span", { className: "logo-text", children: "RickOS" })] }), _jsx("div", { className: "nav-list", children: NAV_GROUPS.map((group, gi) => {
                            const collapsible = !!group.label;
                            const isCollapsed = collapsible && collapsed[group.label];
                            return (_jsxs("div", { className: "nav-group", children: [collapsible && (_jsxs("button", { className: "nav-group-label", onClick: () => toggleGroup(group.label), "aria-expanded": !isCollapsed, children: [_jsx("span", { className: `nav-group-chevron ${isCollapsed ? 'collapsed' : ''}`, children: "\u25BE" }), _jsx("span", { children: group.label })] })), !isCollapsed && (_jsx("ul", { children: group.items.map((item) => (_jsx("li", { children: _jsxs("button", { className: `nav-btn ${currentPage === item.id ? 'active' : ''}`, onClick: () => setPage(item.id), children: [_jsx("span", { className: "nav-icon", children: item.icon }), _jsx("span", { className: "nav-label", children: item.label })] }) }, item.id))) }))] }, group.label || `g${gi}`));
                        }) }), _jsxs("div", { className: "sidebar-shortcuts", children: [_jsx("div", { className: "shortcut-hint", children: "Ctrl+Space: Stop" }), _jsx("div", { className: "shortcut-hint", children: "Ctrl+Shift+Space: Capture" }), _jsx("div", { className: "shortcut-hint", children: "Ctrl+1-4: Navigate" })] }), _jsxs("div", { className: "sidebar-footer", children: [_jsxs("button", { className: "nav-btn export-btn", onClick: async () => {
                                    const success = await window.api.app.exportDb();
                                    if (success) {
                                        alert('Database exported successfully!');
                                    }
                                }, title: "Export Database Snapshot", style: { marginTop: '8px' }, children: [_jsx("span", { className: "nav-icon", children: "\uD83D\uDCBE" }), _jsx("span", { className: "nav-label", children: "Export DB" })] }), _jsxs("button", { className: "nav-btn export-btn", onClick: async () => {
                                    const confirmed = window.confirm('This will replace ALL current data with the imported snapshot. Continue?');
                                    if (!confirmed)
                                        return;
                                    await window.api.app.importDb();
                                }, title: "Import Database Snapshot", style: { marginTop: '4px' }, children: [_jsx("span", { className: "nav-icon", children: "\uD83D\uDCC2" }), _jsx("span", { className: "nav-label", children: "Import DB" })] })] })] }), _jsxs("main", { className: "main-content", children: [_jsx(ActiveTask, {}), _jsx("div", { className: "page-content", children: _jsx(PageComponent, {}) })] }), _jsx(QuickCapture, {})] }));
}
