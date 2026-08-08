import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { useTodoStore } from '../../todo/store/todoStore';
/**
 * Global quick-capture modal. Opens on the main-process global shortcut
 * (Ctrl/Cmd+Shift+Space) via `window.api.on.quickCapture`, and also on an
 * in-app keydown so it works while the window is focused. Writes to the
 * Inbox (todos with source='quick-capture').
 */
export function QuickCapture() {
    const { capture } = useTodoStore();
    const [open, setOpen] = useState(false);
    const [text, setText] = useState('');
    const inputRef = useRef(null);
    useEffect(() => {
        const off = window.api.on.quickCapture(() => setOpen(true));
        const onKey = (e) => {
            if (e.ctrlKey && e.shiftKey && e.code === 'Space') {
                e.preventDefault();
                setOpen(true);
            }
            if (e.key === 'Escape')
                setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => {
            off();
            window.removeEventListener('keydown', onKey);
        };
    }, []);
    useEffect(() => {
        if (open) {
            setText('');
            // focus after the modal renders
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [open]);
    if (!open)
        return null;
    async function handleSubmit() {
        const v = text.trim();
        if (v)
            await capture(v);
        setText('');
        setOpen(false);
    }
    return (_jsx("div", { className: "modal-overlay", onClick: () => setOpen(false), children: _jsxs("div", { className: "modal", onClick: (e) => e.stopPropagation(), children: [_jsx("h2", { children: "\uD83D\uDCE5 Quick Capture" }), _jsx("input", { ref: inputRef, type: "text", placeholder: "Digite e Enter para jogar na Inbox\u2026", value: text, onChange: (e) => setText(e.target.value), onKeyDown: (e) => e.key === 'Enter' && handleSubmit(), style: { width: '100%', marginTop: 8 } }), _jsxs("div", { className: "modal-actions", children: [_jsx("button", { className: "btn btn-secondary btn-sm", onClick: () => setOpen(false), children: "Cancelar (Esc)" }), _jsx("button", { className: "btn btn-primary btn-sm", onClick: handleSubmit, children: "Capturar" })] })] }) }));
}
