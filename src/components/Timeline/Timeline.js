import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { useEffect, useRef, useState } from 'react';
import { TimelineBlock } from './TimelineBlock';
import { useTaskStore } from '../../store/taskStore';
import { useTagStore } from '../../store/tagStore';
import { localDateStr } from '../../utils/dates';
const PIXELS_PER_MINUTE = 1.5;
const HOURS = Array.from({ length: 24 }, (_, i) => i);
function toLocalInput(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function Timeline({ tasks, selectedDate, onRefresh }) {
    const { updateTask, deleteTask } = useTaskStore();
    const { tags } = useTagStore();
    const [selected, setSelected] = useState(null);
    const [form, setForm] = useState(null);
    const containerRef = useRef(null);
    const dayStart = new Date(`${selectedDate}T00:00:00`);
    const isToday = selectedDate === localDateStr();
    useEffect(() => {
        if (!isToday || !containerRef.current)
            return;
        const nowMin = (Date.now() - dayStart.getTime()) / 60000;
        containerRef.current.scrollTop = Math.max(0, nowMin * PIXELS_PER_MINUTE - 200);
    }, [selectedDate]);
    const nowMinutes = isToday ? (Date.now() - dayStart.getTime()) / 60000 : null;
    function openEdit(task) {
        setSelected(task.id);
        setForm({
            task,
            title: task.title,
            tagId: task.tagId,
            secondaryTagId: task.secondaryTagId,
            startTime: toLocalInput(task.startTime),
            endTime: task.endTime ? toLocalInput(task.endTime) : ''
        });
    }
    function openCreate() {
        // Pre-fill start time: now if today, else 09:00 of selected date
        const defaultStart = isToday
            ? toLocalInput(new Date().toISOString())
            : `${selectedDate}T09:00`;
        setSelected(null);
        setForm({ task: null, title: '', tagId: null, secondaryTagId: null, startTime: defaultStart, endTime: '' });
    }
    function closeForm() {
        setForm(null);
        setSelected(null);
    }
    async function handleSave() {
        if (!form || !form.title.trim())
            return;
        if (!form.startTime)
            return;
        const startISO = new Date(form.startTime).toISOString();
        const endISO = form.endTime ? new Date(form.endTime).toISOString() : null;
        try {
            if (form.task) {
                await updateTask(form.task.id, form.title.trim(), form.tagId, form.secondaryTagId, startISO, endISO);
            }
            else {
                await window.api.tasks.add(form.title.trim(), form.tagId, form.secondaryTagId, startISO, endISO);
            }
            closeForm();
            onRefresh();
        }
        catch (err) {
            console.error('Failed to save task:', err);
            alert('Error saving task: ' + String(err));
        }
    }
    async function handleDelete() {
        if (!form?.task)
            return;
        await deleteTask(form.task.id);
        closeForm();
        onRefresh();
    }
    async function handleBlockUpdate(task, startTime, endTime) {
        await updateTask(task.id, task.title, task.tagId, task.secondaryTagId, startTime, endTime);
        onRefresh();
    }
    const isCreating = form !== null && form.task === null;
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 12, flex: 1, overflow: 'hidden' }, children: [form && (_jsxs("div", { className: "task-edit-panel", children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }, children: [_jsx("h3", { style: { margin: 0 }, children: isCreating ? 'New Task' : 'Edit Task' }), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: closeForm, children: "\u2715" })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Title" }), _jsx("input", { type: "text", value: form.title, onChange: (e) => setForm({ ...form, title: e.target.value }), onKeyDown: (e) => e.key === 'Enter' && handleSave(), autoFocus: true, placeholder: "Task name" })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Tag 1" }), _jsxs("select", { value: form.tagId ?? '', onChange: (e) => setForm({ ...form, tagId: e.target.value ? Number(e.target.value) : null }), children: [_jsx("option", { value: "", children: "None" }), tags.map((t) => (_jsx("option", { value: t.id, children: t.name }, t.id)))] })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Tag 2" }), _jsxs("select", { value: form.secondaryTagId ?? '', onChange: (e) => setForm({ ...form, secondaryTagId: e.target.value ? Number(e.target.value) : null }), children: [_jsx("option", { value: "", children: "None" }), tags.map((t) => (_jsx("option", { value: t.id, children: t.name }, t.id)))] })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "Start" }), _jsx("input", { type: "datetime-local", value: form.startTime, onChange: (e) => setForm({ ...form, startTime: e.target.value }) })] }), _jsxs("div", { className: "form-row", children: [_jsx("label", { children: "End" }), _jsx("input", { type: "datetime-local", value: form.endTime, onChange: (e) => setForm({ ...form, endTime: e.target.value }), placeholder: "Leave empty if still active" })] }), _jsxs("div", { style: { display: 'flex', gap: 8, marginTop: 8 }, children: [_jsx("button", { className: "btn btn-primary btn-sm", onClick: handleSave, children: isCreating ? 'Create' : 'Save' }), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: closeForm, children: "Cancel" }), !isCreating && (_jsx("button", { className: "btn btn-danger btn-sm", style: { marginLeft: 'auto' }, onClick: handleDelete, children: "Delete" }))] })] })), _jsx("div", { style: { display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }, children: _jsx("button", { className: "btn btn-primary btn-sm", onClick: openCreate, children: "+ Add Task" }) }), _jsx("div", { className: "timeline-container", ref: containerRef, children: _jsxs("div", { className: "timeline-scroll", style: { height: 1440 * PIXELS_PER_MINUTE }, children: [HOURS.map((h) => (_jsxs(React.Fragment, { children: [_jsxs("div", { className: "timeline-hour-label", style: { top: h * 60 * PIXELS_PER_MINUTE }, children: [String(h).padStart(2, '0'), ":00"] }), _jsx("div", { className: "timeline-hour-line", style: { top: h * 60 * PIXELS_PER_MINUTE } })] }, h))), nowMinutes !== null && (_jsx("div", { className: "timeline-now-line", style: { top: nowMinutes * PIXELS_PER_MINUTE, left: 60 }, children: _jsx("div", { className: "timeline-now-dot" }) })), _jsx("div", { className: "timeline-tasks", children: tasks.map((task) => (_jsx(TimelineBlock, { task: task, pixelsPerMinute: PIXELS_PER_MINUTE, dayStart: dayStart, selected: selected === task.id, onClick: () => openEdit(task), onUpdate: (st, et) => handleBlockUpdate(task, st, et) }, task.id))) })] }) })] }));
}
