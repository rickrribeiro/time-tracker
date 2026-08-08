import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { useGithubStore } from '../../projects/store/githubStore';
export function SettingsPage() {
    const { values, refresh, set } = useSettingsStore();
    const { sync, syncing, error, lastCount } = useGithubStore();
    const [token, setToken] = useState('');
    const [username, setUsername] = useState('');
    const [saved, setSaved] = useState(false);
    useEffect(() => {
        refresh();
    }, []);
    useEffect(() => {
        setToken(values.github_token ?? '');
        setUsername(values.github_username ?? '');
    }, [values.github_token, values.github_username]);
    async function handleSave() {
        await set('github_token', token.trim());
        await set('github_username', username.trim());
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    }
    return (_jsxs("div", { className: "module-page", children: [_jsx("div", { className: "module-header", children: _jsxs("div", { children: [_jsx("h2", { style: { fontSize: 18, fontWeight: 700 }, children: "\u2699\uFE0F Configura\u00E7\u00F5es" }), _jsx("p", { style: { fontSize: 13, color: 'var(--text-secondary)' }, children: "Integra\u00E7\u00F5es e prefer\u00EAncias. Tokens ficam no banco local (userData)." })] }) }), _jsxs("div", { className: "chart-section", style: { maxWidth: 560 }, children: [_jsx("div", { className: "chart-title", children: "\uD83D\uDC19 GitHub" }), _jsxs("p", { style: { fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 12px' }, children: ["Crie um ", _jsx("strong", { children: "Personal Access Token" }), " (classic) com escopo ", _jsx("code", { children: "repo" }), " em github.com \u2192 Settings \u2192 Developer settings. Ele \u00E9 usado s\u00F3 localmente para ler suas issues atribu\u00EDdas."] }), _jsxs("div", { className: "editor-field", children: [_jsx("label", { children: "Personal Access Token" }), _jsx("input", { type: "password", placeholder: "ghp_\u2026", value: token, onChange: (e) => setToken(e.target.value) })] }), _jsxs("div", { className: "editor-field", children: [_jsx("label", { children: "Username (opcional)" }), _jsx("input", { type: "text", placeholder: "seu-usuario", value: username, onChange: (e) => setUsername(e.target.value) })] }), _jsxs("div", { style: { display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }, children: [_jsx("button", { className: "btn btn-primary btn-sm", onClick: handleSave, children: saved ? '✓ Salvo' : 'Salvar' }), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: sync, disabled: syncing || !token.trim(), children: syncing ? 'Sincronizando…' : '🔄 Testar / Sincronizar Issues' }), lastCount !== null && !error && (_jsxs("span", { style: { fontSize: 12, color: 'var(--success)' }, children: [lastCount, " issues sincronizadas"] }))] }), error && (_jsx("div", { style: { fontSize: 12, color: 'var(--danger)', marginTop: 8 }, children: error }))] })] }));
}
