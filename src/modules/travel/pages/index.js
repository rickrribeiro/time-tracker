import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ModulePlaceholder } from '../../_shared/ModulePlaceholder';
import flights from '../mock/flights.json';
export function TripsPage() {
    return (_jsx(ModulePlaceholder, { icon: "\u2708\uFE0F", title: "Pr\u00F3ximas viagens", subtitle: "Origem, destino, datas, or\u00E7amento, status", note: "Tabelas trips/flight_watches criadas. CRUD e monitoramento entram numa pr\u00F3xima sess\u00E3o." }));
}
export function MonitoringPage() {
    return (_jsxs("div", { className: "module-page", children: [_jsx("div", { className: "module-header", children: _jsxs("div", { children: [_jsx("h2", { style: { fontSize: 18, fontWeight: 700 }, children: "\uD83D\uDD14 Monitoramento de passagens" }), _jsx("p", { style: { fontSize: 13, color: 'var(--text-secondary)' }, children: "Dados mockados (JSON local)." })] }) }), _jsx("div", { className: "cards-grid", children: flights.map((f, i) => (_jsxs("div", { className: "stat-card", children: [_jsxs("div", { className: "stat-card-label", children: [f.origin, " \u2192 ", f.destination] }), _jsxs("div", { className: "stat-card-value", children: [f.price, " ", f.currency] }), _jsxs("div", { className: "stat-card-sub", children: ["checado: ", f.lastChecked.slice(0, 10)] })] }, i))) })] }));
}
export function DestinationsPage() {
    return _jsx(ModulePlaceholder, { icon: "\uD83D\uDDFA", title: "Destinos", subtitle: "Destinos salvos" });
}
export function DocumentsPage() {
    return (_jsxs("div", { className: "module-page", children: [_jsx("div", { className: "module-header", children: _jsxs("div", { children: [_jsx("h2", { style: { fontSize: 18, fontWeight: 700 }, children: "\uD83D\uDCC4 Documentos" }), _jsx("p", { style: { fontSize: 13, color: 'var(--text-secondary)' }, children: "Checklist mockado." })] }) }), _jsx("div", { className: "list-stack", children: ['Passaporte', 'Visto', 'Vacina', 'Seguro viagem', 'Comprovante de hospedagem'].map((d) => (_jsxs("div", { className: "list-row", children: [_jsx("input", { type: "checkbox", disabled: true }), _jsx("span", { className: "list-row-title", children: d })] }, d))) })] }));
}
export function RecommendationsPage() {
    return (_jsx(ModulePlaceholder, { icon: "\u2B50", title: "Recomenda\u00E7\u00F5es", subtitle: "Baseadas no seu perfil (user-profile.md)", note: "Recomenda\u00E7\u00F5es via IA local (Claude CLI) entram numa pr\u00F3xima sess\u00E3o." }));
}
