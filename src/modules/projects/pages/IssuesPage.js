import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
import { useGithubStore, columnFor, parseLabels } from '../store/githubStore';
const COLUMNS = [
    { key: 'backlog', label: 'Backlog' },
    { key: 'in-progress', label: 'Em andamento' },
    { key: 'blocked', label: 'Bloqueado' },
    { key: 'done', label: 'Concluído' }
];
function IssueCard({ issue }) {
    const labels = parseLabels(issue);
    return (_jsxs("div", { className: "kanban-card", children: [_jsx("div", { className: "kanban-card-repo", children: issue.repo }), _jsxs("button", { className: "kanban-card-title", onClick: () => issue.url && window.api.app.openExternal(issue.url), title: "Abrir no GitHub", children: ["#", issue.number, " ", issue.title] }), labels.length > 0 && (_jsx("div", { className: "kanban-card-labels", children: labels.map((l) => (_jsx("span", { className: "project-chip", children: l }, l))) }))] }));
}
export function IssuesPage() {
    const { issues, refresh, sync, syncing, error, lastCount } = useGithubStore();
    useEffect(() => {
        refresh();
    }, []);
    const grouped = {
        backlog: [],
        'in-progress': [],
        blocked: [],
        done: []
    };
    for (const i of issues)
        grouped[columnFor(i)].push(i);
    return (_jsxs("div", { className: "module-page", children: [_jsxs("div", { className: "module-header", children: [_jsxs("div", { children: [_jsx("h2", { style: { fontSize: 18, fontWeight: 700 }, children: "\uD83D\uDCCC Issues (Kanban)" }), _jsx("p", { style: { fontSize: 13, color: 'var(--text-secondary)' }, children: "Issues atribu\u00EDdas a voc\u00EA no GitHub (somente leitura)." })] }), _jsx("button", { className: "btn btn-primary btn-sm", onClick: sync, disabled: syncing, children: syncing ? 'Sincronizando…' : '🔄 Sincronizar' })] }), error && _jsx("div", { className: "empty-hint", style: { color: 'var(--danger)' }, children: error }), issues.length === 0 && !error && (_jsxs("div", { className: "empty-hint", children: ["Nenhuma issue. Configure o token do GitHub em ", _jsx("strong", { children: "Configura\u00E7\u00F5es" }), " e clique em Sincronizar."] })), issues.length > 0 && (_jsx("div", { className: "kanban-board", children: COLUMNS.map((col) => (_jsxs("div", { className: "kanban-column", children: [_jsxs("div", { className: "kanban-column-header", children: [col.label, " ", _jsx("span", { className: "kanban-count", children: grouped[col.key].length })] }), _jsx("div", { className: "kanban-column-body", children: grouped[col.key].map((i) => (_jsx(IssueCard, { issue: i }, i.id))) })] }, col.key))) })), lastCount !== null && !error && (_jsxs("p", { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }, children: ["\u00DAltima sincroniza\u00E7\u00E3o: ", lastCount, " issues."] }))] }));
}
