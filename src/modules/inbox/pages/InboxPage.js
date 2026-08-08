import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTodoStore } from '../../todo/store/todoStore';
import { useProjectStore } from '../../projects/store/projectStore';
import { TodoEditor } from '../../todo/components/TodoEditor';
export function InboxPage() {
    const { todos, refresh, create, setStatus, remove } = useTodoStore();
    const { refresh: refreshProjects } = useProjectStore();
    const [text, setText] = useState('');
    const [processing, setProcessing] = useState(null);
    useEffect(() => {
        refresh();
        refreshProjects();
    }, []);
    const items = todos.filter((t) => t.status === 'inbox');
    async function handleAdd() {
        const v = text.trim();
        if (!v)
            return;
        await create(v, 'inbox');
        setText('');
    }
    return (_jsxs("div", { className: "module-page", children: [_jsxs("div", { className: "module-header", children: [_jsxs("div", { children: [_jsx("h2", { style: { fontSize: 18, fontWeight: 700 }, children: "\uD83D\uDCE5 Inbox" }), _jsx("p", { style: { fontSize: 13, color: 'var(--text-secondary)' }, children: "Capture agora, processe depois. Atalho global: Ctrl+Shift+Space." })] }), _jsx("span", { className: "inbox-count", children: items.length })] }), _jsxs("div", { className: "quick-add-row", children: [_jsx("input", { type: "text", placeholder: "O que est\u00E1 na sua cabe\u00E7a?", value: text, onChange: (e) => setText(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleAdd(), autoFocus: true }), _jsx("button", { className: "btn btn-primary", onClick: handleAdd, children: "+ Capturar" })] }), _jsxs("div", { className: "list-stack", children: [items.length === 0 && _jsx("div", { className: "empty-hint", children: "Inbox vazia \u2728" }), items.map((t) => (_jsxs("div", { className: "list-row", children: [_jsx("span", { className: "list-row-title", children: t.title }), _jsxs("div", { className: "list-row-actions", children: [_jsx("button", { className: "btn btn-primary btn-sm", onClick: () => setStatus(t.id, 'todo'), children: "\u2192 TODO" }), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: () => setProcessing(t), children: "Processar\u2026" }), _jsx("button", { className: "btn btn-danger btn-sm", onClick: () => remove(t.id), children: "Excluir" })] })] }, t.id)))] }), processing && _jsx(TodoEditor, { todo: processing, onClose: () => setProcessing(null) })] }));
}
