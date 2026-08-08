import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useCallback } from 'react';
import { useUIStore } from '../store/uiStore';
import { useTaskStore } from '../store/taskStore';
import { useTagStore } from '../store/tagStore';
import { Timeline } from '../components/Timeline/Timeline';
import { localDateStr } from '../utils/dates';
function formatDateDisplay(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const todayStr = localDateStr();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = localDateStr(yesterday);
    if (dateStr === todayStr)
        return 'Today';
    if (dateStr === yesterdayStr)
        return 'Yesterday';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function offsetDate(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}
export function TimelinePage() {
    const { selectedDate, setSelectedDate } = useUIStore();
    const { todayTasks, refreshTasks, startTask, activeTask } = useTaskStore();
    const { tags } = useTagStore();
    const load = useCallback(() => {
        refreshTasks(selectedDate);
    }, [selectedDate]);
    useEffect(() => {
        load();
    }, [load]);
    // Refresh task list when active task changes (start/stop from the ActiveTask bar)
    const activeTaskId = activeTask?.id ?? null;
    useEffect(() => {
        refreshTasks(selectedDate);
    }, [activeTaskId]); // eslint-disable-line react-hooks/exhaustive-deps
    const handleFillGaps = async () => {
        await window.api.tasks.fillGaps(selectedDate);
        load();
    };
    // Quick-start: most used task titles from today + yesterday
    const recentTitles = Array.from(new Set(todayTasks.map((t) => t.title).filter((t) => t !== 'Idle'))).slice(0, 5);
    return (_jsxs("div", { className: "timeline-page", children: [_jsxs("div", { className: "timeline-header", children: [_jsxs("div", { className: "date-nav", children: [_jsx("button", { className: "date-nav-btn", onClick: () => setSelectedDate(offsetDate(selectedDate, -1)), children: "\u2039" }), _jsx("span", { className: "date-display", children: formatDateDisplay(selectedDate) }), _jsx("button", { className: "date-nav-btn", onClick: () => setSelectedDate(offsetDate(selectedDate, 1)), children: "\u203A" })] }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [recentTitles.length > 0 && (_jsx("div", { className: "quick-start", children: recentTitles.map((title) => {
                                    const task = todayTasks.find((t) => t.title === title);
                                    return (_jsxs("button", { className: "quick-start-btn", onClick: () => startTask(title, task?.tagId ?? null), title: `Quick start: ${title}`, children: [task?.tagColor && (_jsx("span", { className: "quick-start-dot", style: { background: task.tagColor } })), title] }, title));
                                }) })), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: handleFillGaps, title: "Fill time gaps with Idle", children: "Fill Gaps" })] })] }), _jsx(Timeline, { tasks: todayTasks, selectedDate: selectedDate, onRefresh: load })] }));
}
