import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Skeleton page used by modules whose logic isn't implemented yet.
 * Keeps navigation working and the visual coherent with the rest of the app.
 */
export function ModulePlaceholder({ icon, title, subtitle, note }) {
    return (_jsxs("div", { style: { padding: 4 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }, children: [_jsx("span", { style: { fontSize: 22 }, children: icon }), _jsxs("div", { children: [_jsx("h2", { style: { fontSize: 18, fontWeight: 700 }, children: title }), subtitle && (_jsx("p", { style: { fontSize: 13, color: 'var(--text-secondary)' }, children: subtitle }))] })] }), _jsxs("div", { className: "chart-section", children: [_jsx("div", { className: "chart-title", children: "\uD83D\uDEA7 Em breve" }), _jsx("p", { style: { fontSize: 13, color: 'var(--text-secondary)', marginTop: 8 }, children: note ||
                            'Fundação criada — tabela no banco e navegação prontas. A lógica deste módulo entra numa próxima sessão.' })] })] }));
}
