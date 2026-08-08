import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTodoStore } from '../../todo/store/todoStore';
import { useHabitStore } from '../../habits/store/habitStore';
import { localDateStr, localDayStartISO, localDayEndISO } from '../../../utils/dates';
import flights from '../../travel/mock/flights.json';
function fmtHours(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
}
export function HomePage() {
    const { todos, refresh: refreshTodos } = useTodoStore();
    const { habits, isDone, refresh: refreshHabits } = useHabitStore();
    const [weekMinutes, setWeekMinutes] = useState(0);
    useEffect(() => {
        refreshTodos();
        refreshHabits();
        const now = new Date();
        const monday = new Date(now);
        const day = (now.getDay() + 6) % 7; // 0 = Monday
        monday.setDate(now.getDate() - day);
        const start = localDayStartISO(localDateStr(monday));
        const end = localDayEndISO(localDateStr(now));
        window.api.stats.daily(start, end).then((rows) => {
            setWeekMinutes(rows.reduce((sum, r) => sum + r.totalMinutes, 0));
        });
    }, []);
    const openTodos = todos.filter((t) => t.status !== 'done' && t.status !== 'inbox');
    const inboxCount = todos.filter((t) => t.status === 'inbox').length;
    const habitsDone = habits.filter((h) => isDone(h.id)).length;
    const nextFlight = flights[0];
    return (_jsxs("div", { className: "module-page", children: [_jsx("div", { className: "module-header", children: _jsxs("div", { children: [_jsx("h2", { style: { fontSize: 20, fontWeight: 700 }, children: "\uD83C\uDFE0 Hoje" }), _jsx("p", { style: { fontSize: 13, color: 'var(--text-secondary)' }, children: localDateStr(new Date()) })] }) }), _jsxs("div", { className: "cards-grid", children: [_jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-label", children: "Horas esta semana" }), _jsx("div", { className: "stat-card-value", children: fmtHours(weekMinutes) })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-label", children: "Tarefas abertas" }), _jsx("div", { className: "stat-card-value", children: openTodos.length }), _jsxs("div", { className: "stat-card-sub", children: [inboxCount, " na inbox p/ processar"] })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-label", children: "H\u00E1bitos hoje" }), _jsxs("div", { className: "stat-card-value", children: [habitsDone, "/", habits.length] })] }), _jsxs("div", { className: "stat-card", style: { opacity: 0.7 }, children: [_jsx("div", { className: "stat-card-label", children: "Issues GitHub (mock)" }), _jsx("div", { className: "stat-card-value", children: "\u2014" }), _jsx("div", { className: "stat-card-sub", children: "integra\u00E7\u00E3o em breve" })] }), _jsxs("div", { className: "stat-card", style: { opacity: 0.7 }, children: [_jsx("div", { className: "stat-card-label", children: "Gastos do m\u00EAs (mock)" }), _jsx("div", { className: "stat-card-value", children: "R$ \u2014" }), _jsx("div", { className: "stat-card-sub", children: "integra\u00E7\u00E3o em breve" })] }), _jsxs("div", { className: "stat-card", children: [_jsx("div", { className: "stat-card-label", children: "Pr\u00F3xima viagem (mock)" }), _jsxs("div", { className: "stat-card-value", style: { fontSize: 15 }, children: [nextFlight.origin, " \u2192 ", nextFlight.destination] }), _jsxs("div", { className: "stat-card-sub", children: ["menor pre\u00E7o: ", nextFlight.price, " ", nextFlight.currency] })] })] }), _jsxs("div", { className: "chart-section", style: { marginTop: 16 }, children: [_jsx("div", { className: "chart-title", children: "Top tarefas" }), _jsxs("div", { className: "list-stack", style: { marginTop: 8 }, children: [openTodos.slice(0, 3).map((t) => (_jsx("div", { className: "list-row", children: _jsx("span", { className: "list-row-title", children: t.title }) }, t.id))), openTodos.length === 0 && _jsx("div", { className: "empty-hint", children: "Nada pendente \uD83C\uDF89" })] })] })] }));
}
