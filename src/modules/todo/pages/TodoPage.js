import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { useTodoStore } from '../store/todoStore';
import { useProjectStore } from '../../projects/store/projectStore';
import { TodoEditor } from '../components/TodoEditor';
import { PRIORITIES, STATUSES, STATUS_LABELS, priorityDef, dueMeta } from '../constants';
export function TodoPage() {
    const { todos, refresh, create, setStatus, update, remove } = useTodoStore();
    const { projects, refresh: refreshProjects } = useProjectStore();
    const [text, setText] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [projectFilter, setProjectFilter] = useState('all');
    const [editing, setEditing] = useState(null);
    useEffect(() => {
        refresh();
        refreshProjects();
    }, []);
    const projectName = (id) => id === null ? null : projects.find((p) => p.id === id)?.name ?? null;
    const items = useMemo(() => {
        const q = search.trim().toLowerCase();
        return todos
            .filter((t) => t.status !== 'inbox')
            .filter((t) => statusFilter === 'all' || t.status === statusFilter)
            .filter((t) => projectFilter === 'all' || t.projectId === projectFilter)
            .filter((t) => !q || t.title.toLowerCase().includes(q) || (t.notes ?? '').toLowerCase().includes(q))
            .sort((a, b) => {
            const doneA = a.status === 'done' ? 1 : 0;
            const doneB = b.status === 'done' ? 1 : 0;
            if (doneA !== doneB)
                return doneA - doneB; // done last
            if (b.priority !== a.priority)
                return b.priority - a.priority; // higher priority first
            // due date asc, nulls last
            if (a.dueDate && b.dueDate)
                return a.dueDate.localeCompare(b.dueDate);
            if (a.dueDate)
                return -1;
            if (b.dueDate)
                return 1;
            return b.createdAt.localeCompare(a.createdAt);
        });
    }, [todos, search, statusFilter, projectFilter]);
    async function handleAdd() {
        const v = text.trim();
        if (!v)
            return;
        await create(v, 'todo');
        setText('');
    }
    function cyclePriority(t) {
        const next = (t.priority + 1) % PRIORITIES.length;
        update({ ...t, priority: next });
    }
    return (_jsxs("div", { className: "module-page", children: [_jsx("div", { className: "module-header", children: _jsxs("div", { children: [_jsx("h2", { style: { fontSize: 18, fontWeight: 700 }, children: "\u2705 TODO" }), _jsxs("p", { style: { fontSize: 13, color: 'var(--text-secondary)' }, children: [items.length, " ", items.length === 1 ? 'tarefa' : 'tarefas'] })] }) }), _jsxs("div", { className: "quick-add-row", children: [_jsx("input", { type: "text", placeholder: "Nova tarefa", value: text, onChange: (e) => setText(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleAdd() }), _jsx("button", { className: "btn btn-primary", onClick: handleAdd, children: "+ Adicionar" })] }), _jsxs("div", { className: "todo-toolbar", children: [_jsx("input", { type: "text", placeholder: "\uD83D\uDD0D Buscar\u2026", value: search, onChange: (e) => setSearch(e.target.value), style: { flex: 1, minWidth: 120 } }), _jsxs("select", { value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), children: [_jsx("option", { value: "all", children: "Todos os status" }), STATUSES.map((s) => (_jsx("option", { value: s, children: STATUS_LABELS[s] }, s)))] }), _jsxs("select", { value: projectFilter, onChange: (e) => setProjectFilter(e.target.value === 'all' ? 'all' : Number(e.target.value)), children: [_jsx("option", { value: "all", children: "Todos os projetos" }), projects.map((p) => (_jsx("option", { value: p.id, children: p.name }, p.id)))] })] }), _jsxs("div", { className: "list-stack", children: [items.length === 0 && _jsx("div", { className: "empty-hint", children: "Nenhuma tarefa encontrada." }), items.map((t) => {
                        const done = t.status === 'done';
                        const prio = priorityDef(t.priority);
                        const due = dueMeta(t.dueDate, done);
                        const proj = projectName(t.projectId);
                        return (_jsxs("div", { className: "list-row", children: [_jsx("input", { type: "checkbox", checked: done, onChange: () => setStatus(t.id, done ? 'todo' : 'done') }), _jsx("button", { className: "priority-dot", title: `Prioridade: ${prio.label} (clique p/ alternar)`, style: { background: prio.color }, onClick: () => cyclePriority(t) }), _jsx("span", { className: "list-row-title", style: {
                                        textDecoration: done ? 'line-through' : 'none',
                                        color: done ? 'var(--text-muted)' : 'var(--text-primary)'
                                    }, children: t.title }), proj && _jsx("span", { className: "project-chip", children: proj }), due && _jsx("span", { className: `due-badge ${due.cls}`, children: due.label }), _jsx("select", { value: t.status, onChange: (e) => setStatus(t.id, e.target.value), style: { fontSize: 12, padding: '2px 6px' }, children: STATUSES.map((s) => (_jsx("option", { value: s, children: STATUS_LABELS[s] }, s))) }), _jsxs("div", { className: "list-row-actions", children: [_jsx("button", { className: "btn btn-secondary btn-sm", onClick: () => setEditing(t), children: "Editar" }), _jsx("button", { className: "btn btn-danger btn-sm", onClick: () => remove(t.id), children: "Excluir" })] })] }, t.id));
                    })] }), editing && _jsx(TodoEditor, { todo: editing, onClose: () => setEditing(null) })] }));
}
