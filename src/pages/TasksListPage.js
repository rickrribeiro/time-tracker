import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useMemo } from 'react';
import { useTagStore } from '../store/tagStore';
import { useUIStore } from '../store/uiStore';
import { localDateStr } from '../utils/dates';
function formatTime(iso) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function formatDuration(startIso, endIso) {
    if (!endIso)
        return 'active';
    const mins = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0)
        return `${m}m`;
    if (m === 0)
        return `${h}h`;
    return `${h}h ${m}m`;
}
function formatDateHeader(dateStr) {
    const today = localDateStr();
    const yesterday = localDateStr(new Date(new Date().setDate(new Date().getDate() - 1)));
    if (dateStr === today)
        return 'Today';
    if (dateStr === yesterday)
        return 'Yesterday';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}
function toLocalInput(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function TasksListPage() {
    const [tasks, setTasks] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [editState, setEditState] = useState(null);
    const { tags } = useTagStore();
    const { setSelectedDate, setPage } = useUIStore();
    async function load() {
        setLoading(true);
        const all = await window.api.tasks.getAll();
        setTasks(all);
        setLoading(false);
    }
    useEffect(() => { load(); }, []);
    const filtered = useMemo(() => {
        if (!search.trim())
            return tasks;
        const q = search.toLowerCase();
        return tasks.filter((t) => t.title.toLowerCase().includes(q) ||
            (t.tagName ?? '').toLowerCase().includes(q) ||
            (t.secondaryTagName ?? '').toLowerCase().includes(q));
    }, [tasks, search]);
    // Group by local date
    const grouped = useMemo(() => {
        const map = new Map();
        for (const t of filtered) {
            const date = localDateStr(new Date(t.startTime));
            if (!map.has(date))
                map.set(date, []);
            map.get(date).push(t);
        }
        return map;
    }, [filtered]);
    function openEdit(task) {
        setEditState({
            task,
            title: task.title,
            tagId: task.tagId,
            secondaryTagId: task.secondaryTagId,
            startTime: toLocalInput(task.startTime),
            endTime: task.endTime ? toLocalInput(task.endTime) : ''
        });
    }
    async function handleSave() {
        if (!editState)
            return;
        const startISO = new Date(editState.startTime).toISOString();
        const endISO = editState.endTime ? new Date(editState.endTime).toISOString() : null;
        await window.api.tasks.update(editState.task.id, editState.title, editState.tagId, editState.secondaryTagId, startISO, endISO);
        setEditState(null);
        load();
    }
    async function handleDelete() {
        if (!editState)
            return;
        if (!confirm(`Delete "${editState.task.title}"?`))
            return;
        await window.api.tasks.delete(editState.task.id);
        setEditState(null);
        load();
    }
    function goToDate(dateStr) {
        setSelectedDate(dateStr);
        setPage('timeline');
    }
    const totalTasks = tasks.length;
    const totalDays = grouped.size;
    return (_jsxs("div", { className: "tasks-list-page", children: [_jsxs("div", { className: "tasks-list-header", children: [_jsxs("div", { children: [_jsx("h2", { className: "tasks-list-title", children: "All Tasks" }), _jsxs("span", { className: "tasks-list-meta", children: [totalTasks, " tasks across ", totalDays, " days"] })] }), _jsx("input", { className: "tasks-list-search", type: "text", placeholder: "Search by title or tag...", value: search, onChange: (e) => setSearch(e.target.value), autoFocus: true })] }), editState && (_jsxs("div", { className: "task-edit-panel", children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, children: [_jsx("h3", { style: { margin: 0 }, children: "Edit Task" }), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: () => setEditState(null), children: "\u2715" })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Title" }), _jsx("input", { type: "text", value: editState.title, onChange: (e) => setEditState({ ...editState, title: e.target.value }), onKeyDown: (e) => e.key === 'Enter' && handleSave(), autoFocus: true })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Tag 1" }), _jsxs("select", { value: editState.tagId ?? '', onChange: (e) => setEditState({ ...editState, tagId: e.target.value ? Number(e.target.value) : null }), children: [_jsx("option", { value: "", children: "None" }), tags.map((t) => _jsx("option", { value: t.id, children: t.name }, t.id))] })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Tag 2" }), _jsxs("select", { value: editState.secondaryTagId ?? '', onChange: (e) => setEditState({ ...editState, secondaryTagId: e.target.value ? Number(e.target.value) : null }), children: [_jsx("option", { value: "", children: "None" }), tags.map((t) => _jsx("option", { value: t.id, children: t.name }, t.id))] })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Start" }), _jsx("input", { type: "datetime-local", value: editState.startTime, onChange: (e) => setEditState({ ...editState, startTime: e.target.value }) })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "End" }), _jsx("input", { type: "datetime-local", value: editState.endTime, onChange: (e) => setEditState({ ...editState, endTime: e.target.value }) })] }), _jsxs("div", { style: { display: 'flex', gap: 8, marginTop: 8 }, children: [_jsx("button", { className: "btn btn-primary btn-sm", onClick: handleSave, children: "Save" }), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: () => setEditState(null), children: "Cancel" }), _jsx("button", { className: "btn btn-danger btn-sm", style: { marginLeft: 'auto' }, onClick: handleDelete, children: "Delete" })] })] })), loading ? (_jsx("div", { style: { color: 'var(--text-muted)', textAlign: 'center', padding: 40 }, children: "Loading..." })) : filtered.length === 0 ? (_jsx("div", { style: { color: 'var(--text-muted)', textAlign: 'center', padding: 40 }, children: search ? 'No tasks match your search.' : 'No tasks yet.' })) : (_jsx("div", { className: "tasks-list-groups", children: Array.from(grouped.entries()).map(([date, dayTasks]) => (_jsxs("div", { className: "tasks-day-group", children: [_jsxs("div", { className: "tasks-day-header", children: [_jsx("span", { className: "tasks-day-label", children: formatDateHeader(date) }), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: () => goToDate(date), title: "Open this day in Timeline", children: "Open timeline \u2192" })] }), _jsx("div", { className: "tasks-day-list", children: dayTasks.map((task) => (_jsxs("div", { className: `task-row ${editState?.task.id === task.id ? 'selected' : ''}`, onClick: () => openEdit(task), children: [_jsx("div", { className: "task-row-color", style: { background: task.tagColor || 'var(--bg-tertiary)' } }), _jsxs("div", { className: "task-row-main", children: [_jsx("span", { className: "task-row-title", children: task.title }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [task.tagName && (_jsx("span", { className: "task-row-tag", style: { background: task.tagColor + '33', color: task.tagColor || undefined }, children: task.tagName })), task.secondaryTagName && (_jsx("span", { className: "task-row-tag", style: { background: task.secondaryTagColor + '33', color: task.secondaryTagColor || undefined, opacity: 0.8 }, children: task.secondaryTagName }))] })] }), _jsxs("div", { className: "task-row-times", children: [_jsx("span", { children: formatTime(task.startTime) }), _jsx("span", { style: { color: 'var(--text-muted)' }, children: "\u2192" }), _jsx("span", { children: task.endTime ? formatTime(task.endTime) : _jsx("span", { style: { color: 'var(--success)' }, children: "active" }) })] }), _jsx("div", { className: "task-row-duration", children: formatDuration(task.startTime, task.endTime) })] }, task.id))) })] }, date))) }))] }));
}
