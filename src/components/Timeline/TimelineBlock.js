import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef } from 'react';
function toMinutes(date, base) {
    return (date.getTime() - base.getTime()) / 60000;
}
function formatTime(iso) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function TimelineBlock({ task, pixelsPerMinute, dayStart, selected, onClick, onUpdate }) {
    const startMin = toMinutes(new Date(task.startTime), dayStart);
    const endMin = task.endTime
        ? toMinutes(new Date(task.endTime), dayStart)
        : toMinutes(new Date(), dayStart);
    const top = Math.max(0, startMin * pixelsPerMinute);
    const height = Math.max(4, (endMin - startMin) * pixelsPerMinute);
    const color = task.tagColor || '#6366f1';
    const dragRef = useRef(null);
    const resizeRef = useRef(null);
    const handleDragStart = (e) => {
        e.stopPropagation();
        dragRef.current = {
            startY: e.clientY,
            origStart: new Date(task.startTime),
            origEnd: task.endTime ? new Date(task.endTime) : null
        };
        const onMove = (ev) => {
            if (!dragRef.current)
                return;
            const deltaMin = (ev.clientY - dragRef.current.startY) / pixelsPerMinute;
            const newStart = new Date(dragRef.current.origStart.getTime() + deltaMin * 60000);
            const newEnd = dragRef.current.origEnd
                ? new Date(dragRef.current.origEnd.getTime() + deltaMin * 60000)
                : null;
            // Clamp to day
            if (newStart < dayStart)
                return;
            onUpdate(newStart.toISOString(), newEnd?.toISOString() ?? null);
        };
        const onUp = () => {
            dragRef.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };
    const handleResizeStart = (e) => {
        e.stopPropagation();
        if (!task.endTime)
            return;
        resizeRef.current = {
            startY: e.clientY,
            origEnd: new Date(task.endTime)
        };
        const onMove = (ev) => {
            if (!resizeRef.current)
                return;
            const deltaMin = (ev.clientY - resizeRef.current.startY) / pixelsPerMinute;
            const newEnd = new Date(resizeRef.current.origEnd.getTime() + deltaMin * 60000);
            const start = new Date(task.startTime);
            if (newEnd.getTime() - start.getTime() < 60000)
                return; // min 1 min
            onUpdate(task.startTime, newEnd.toISOString());
        };
        const onUp = () => {
            resizeRef.current = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };
    return (_jsxs("div", { className: `timeline-block ${selected ? 'selected' : ''}`, style: {
            top,
            height,
            background: color,
            opacity: task.endTime ? 1 : 0.9
        }, onClick: onClick, onMouseDown: handleDragStart, children: [_jsxs("div", { className: "timeline-block-content", children: [height > 20 && (_jsx("div", { className: "timeline-block-title", children: task.title })), height > 40 && (task.tagName || task.secondaryTagName) && (_jsxs("div", { style: { display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 2 }, children: [task.tagName && (_jsx("span", { style: { fontSize: 9, background: 'rgba(255,255,255,0.2)', padding: '1px 4px', borderRadius: 4 }, children: task.tagName })), task.secondaryTagName && (_jsx("span", { style: { fontSize: 9, background: 'rgba(255,255,255,0.2)', padding: '1px 4px', borderRadius: 4 }, children: task.secondaryTagName }))] })), height > 50 && (_jsxs("div", { className: "timeline-block-time", children: [formatTime(task.startTime), task.endTime ? ` – ${formatTime(task.endTime)}` : ' (active)'] }))] }), task.endTime && (_jsx("div", { className: "timeline-block-resize", onMouseDown: handleResizeStart }))] }));
}
