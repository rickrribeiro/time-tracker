import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useHabitStore } from '../store/habitStore';
export function HabitsPage() {
    const { habits, refresh, create, remove, toggle, isDone, date } = useHabitStore();
    const [name, setName] = useState('');
    useEffect(() => {
        refresh();
    }, []);
    async function handleAdd() {
        if (!name.trim())
            return;
        await create(name.trim(), 'daily', 1);
        setName('');
    }
    const doneCount = habits.filter((h) => isDone(h.id)).length;
    return (_jsxs("div", { className: "module-page", children: [_jsx("div", { className: "module-header", children: _jsxs("div", { children: [_jsx("h2", { style: { fontSize: 18, fontWeight: 700 }, children: "\uD83D\uDD25 H\u00E1bitos" }), _jsxs("p", { style: { fontSize: 13, color: 'var(--text-secondary)' }, children: [date, " \u2014 ", doneCount, "/", habits.length, " conclu\u00EDdos hoje"] })] }) }), _jsxs("div", { className: "quick-add-row", children: [_jsx("input", { type: "text", placeholder: "Novo h\u00E1bito (ex: Academia)", value: name, onChange: (e) => setName(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleAdd() }), _jsx("button", { className: "btn btn-primary", onClick: handleAdd, children: "+ Adicionar" })] }), _jsxs("div", { className: "list-stack", children: [habits.length === 0 && _jsx("div", { className: "empty-hint", children: "Nenhum h\u00E1bito ainda." }), habits.map((h) => {
                        const done = isDone(h.id);
                        return (_jsxs("div", { className: "list-row", children: [_jsx("button", { className: `habit-toggle ${done ? 'done' : ''}`, onClick: () => toggle(h.id), title: done ? 'Concluído' : 'Marcar como concluído', children: done ? '✓' : '' }), _jsx("span", { className: "list-row-title", style: { color: done ? 'var(--success)' : 'var(--text-primary)' }, children: h.name }), _jsx("div", { className: "list-row-actions", children: _jsx("button", { className: "btn btn-danger btn-sm", onClick: () => remove(h.id), children: "Excluir" }) })] }, h.id));
                    })] })] }));
}
