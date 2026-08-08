import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useTaskStore } from '../../store/taskStore';
import { useTagStore } from '../../store/tagStore';
function formatDuration(startTime) {
    const diff = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    if (h > 0)
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export function ActiveTask() {
    const { activeTask, startTask, stopActiveTask, switchTask } = useTaskStore();
    const { tags } = useTagStore();
    const [timer, setTimer] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [newTagId, setNewTagId] = useState(null);
    const [newSecondaryTagId, setNewSecondaryTagId] = useState(null);
    const intervalRef = useRef(null);
    useEffect(() => {
        if (activeTask) {
            const update = () => setTimer(formatDuration(activeTask.startTime));
            update();
            intervalRef.current = setInterval(update, 1000);
        }
        else {
            setTimer('');
            if (intervalRef.current)
                clearInterval(intervalRef.current);
        }
        return () => {
            if (intervalRef.current)
                clearInterval(intervalRef.current);
        };
    }, [activeTask]);
    const handleStart = async () => {
        if (!newTitle.trim())
            return;
        await startTask(newTitle.trim(), newTagId, newSecondaryTagId);
        setNewTitle('');
    };
    const handleSwitch = async () => {
        if (!newTitle.trim())
            return;
        await switchTask(newTitle.trim(), newTagId, newSecondaryTagId);
        setNewTitle('');
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            if (activeTask)
                handleSwitch();
            else
                handleStart();
        }
    };
    return (_jsx("div", { className: "active-task-bar", children: activeTask ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "active-task-info", children: [_jsx("div", { className: "active-task-dot" }), _jsx("span", { className: "active-task-title", children: activeTask.title }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [activeTask.tagName && (_jsx("span", { className: "active-task-tag", style: { background: activeTask.tagColor || '#6b7280' }, children: activeTask.tagName })), activeTask.secondaryTagName && (_jsx("span", { className: "active-task-tag", style: { background: activeTask.secondaryTagColor || '#6b7280', opacity: 0.8 }, children: activeTask.secondaryTagName }))] })] }), _jsx("div", { className: "active-task-timer", children: timer }), _jsxs("div", { className: "active-task-controls", children: [_jsxs("div", { className: "task-input-row", children: [_jsx("input", { type: "text", placeholder: "Switch to...", value: newTitle, onChange: (e) => setNewTitle(e.target.value), onKeyDown: handleKeyDown }), _jsxs("select", { value: newTagId ?? '', onChange: (e) => setNewTagId(e.target.value ? Number(e.target.value) : null), children: [_jsx("option", { value: "", children: "Tag 1" }), tags.map((t) => (_jsx("option", { value: t.id, children: t.name }, t.id)))] }), _jsxs("select", { value: newSecondaryTagId ?? '', onChange: (e) => setNewSecondaryTagId(e.target.value ? Number(e.target.value) : null), children: [_jsx("option", { value: "", children: "Tag 2" }), tags.map((t) => (_jsx("option", { value: t.id, children: t.name }, t.id)))] }), _jsx("button", { className: "btn btn-primary", onClick: handleSwitch, children: "Switch" })] }), _jsx("button", { className: "btn btn-danger", onClick: stopActiveTask, children: "\u25A0 Stop" })] })] })) : (_jsxs("div", { className: "task-input-row", style: { flex: 1 }, children: [_jsx("span", { style: { color: 'var(--text-muted)', fontSize: 13 }, children: "No active task" }), _jsx("input", { type: "text", placeholder: "What are you working on?", value: newTitle, onChange: (e) => setNewTitle(e.target.value), onKeyDown: handleKeyDown, style: { flex: 1 }, autoFocus: true }), _jsxs("select", { value: newTagId ?? '', onChange: (e) => setNewTagId(e.target.value ? Number(e.target.value) : null), children: [_jsx("option", { value: "", children: "Tag 1" }), tags.map((t) => (_jsx("option", { value: t.id, children: t.name }, t.id)))] }), _jsxs("select", { value: newSecondaryTagId ?? '', onChange: (e) => setNewSecondaryTagId(e.target.value ? Number(e.target.value) : null), children: [_jsx("option", { value: "", children: "Tag 2" }), tags.map((t) => (_jsx("option", { value: t.id, children: t.name }, t.id)))] }), _jsx("button", { className: "btn btn-primary", onClick: handleStart, children: "\u25B6 Start" })] })) }));
}
