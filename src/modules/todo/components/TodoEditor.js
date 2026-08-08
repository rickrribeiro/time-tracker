import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTodoStore } from '../store/todoStore';
import { useProjectStore } from '../../projects/store/projectStore';
import { PRIORITIES, STATUSES, STATUS_LABELS } from '../constants';
/** Modal to edit every field of a todo. Shared by the TODO list and Inbox processing. */
export function TodoEditor({ todo, onClose }) {
    const { update } = useTodoStore();
    const { projects, refresh: refreshProjects } = useProjectStore();
    const [title, setTitle] = useState(todo.title);
    const [notes, setNotes] = useState(todo.notes ?? '');
    const [status, setStatus] = useState(todo.status === 'inbox' ? 'todo' : todo.status);
    const [priority, setPriority] = useState(todo.priority);
    const [dueDate, setDueDate] = useState(todo.dueDate ?? '');
    const [projectId, setProjectId] = useState(todo.projectId);
    useEffect(() => {
        if (projects.length === 0)
            refreshProjects();
    }, []);
    async function handleSave() {
        if (!title.trim())
            return;
        await update({
            ...todo,
            title: title.trim(),
            notes: notes.trim() || null,
            status,
            priority,
            dueDate: dueDate || null,
            projectId
        });
        onClose();
    }
    return (_jsx("div", { className: "modal-overlay", onClick: onClose, children: _jsxs("div", { className: "modal", onClick: (e) => e.stopPropagation(), style: { minWidth: 380 }, children: [_jsx("h2", { children: todo.status === 'inbox' ? 'Processar item' : 'Editar tarefa' }), _jsxs("div", { className: "editor-field", children: [_jsx("label", { children: "T\u00EDtulo" }), _jsx("input", { value: title, onChange: (e) => setTitle(e.target.value), autoFocus: true })] }), _jsxs("div", { className: "editor-field", children: [_jsx("label", { children: "Notas" }), _jsx("textarea", { rows: 3, value: notes, onChange: (e) => setNotes(e.target.value) })] }), _jsxs("div", { className: "editor-row", children: [_jsxs("div", { className: "editor-field", children: [_jsx("label", { children: "Status" }), _jsx("select", { value: status, onChange: (e) => setStatus(e.target.value), children: STATUSES.map((s) => (_jsx("option", { value: s, children: STATUS_LABELS[s] }, s))) })] }), _jsxs("div", { className: "editor-field", children: [_jsx("label", { children: "Prioridade" }), _jsx("select", { value: priority, onChange: (e) => setPriority(Number(e.target.value)), children: PRIORITIES.map((p) => (_jsx("option", { value: p.value, children: p.label }, p.value))) })] })] }), _jsxs("div", { className: "editor-row", children: [_jsxs("div", { className: "editor-field", children: [_jsx("label", { children: "Vencimento" }), _jsx("input", { type: "date", value: dueDate, onChange: (e) => setDueDate(e.target.value) })] }), _jsxs("div", { className: "editor-field", children: [_jsx("label", { children: "Projeto" }), _jsxs("select", { value: projectId ?? '', onChange: (e) => setProjectId(e.target.value ? Number(e.target.value) : null), children: [_jsx("option", { value: "", children: "Nenhum" }), projects.map((p) => (_jsx("option", { value: p.id, children: p.name }, p.id)))] })] })] }), _jsxs("div", { className: "modal-actions", children: [_jsx("button", { className: "btn btn-secondary btn-sm", onClick: onClose, children: "Cancelar" }), _jsx("button", { className: "btn btn-primary btn-sm", onClick: handleSave, children: "Salvar" })] })] }) }));
}
