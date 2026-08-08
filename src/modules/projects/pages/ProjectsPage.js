import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useProjectStore } from '../store/projectStore';
const PRESET_COLORS = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4'];
const emptyForm = { name: '', description: '', githubRepoUrl: '', color: '#6366f1' };
export function ProjectsPage() {
    const { projects, refresh, create, update, remove } = useProjectStore();
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(emptyForm);
    useEffect(() => {
        refresh();
    }, []);
    function startCreate() {
        setEditing(null);
        setForm(emptyForm);
        setShowForm(true);
    }
    function startEdit(p) {
        setEditing(p);
        setForm({
            name: p.name,
            description: p.description ?? '',
            githubRepoUrl: p.githubRepoUrl ?? '',
            color: p.color
        });
        setShowForm(true);
    }
    async function handleSubmit() {
        if (!form.name.trim())
            return;
        if (editing) {
            await update({
                ...editing,
                name: form.name.trim(),
                description: form.description.trim() || null,
                githubRepoUrl: form.githubRepoUrl.trim() || null,
                color: form.color
            });
        }
        else {
            await create(form.name.trim(), form.description.trim() || null, form.githubRepoUrl.trim() || null, form.color);
        }
        setShowForm(false);
        setEditing(null);
        setForm(emptyForm);
    }
    async function toggleArchive(p) {
        await update({ ...p, archived: p.archived ? 0 : 1 });
    }
    const active = projects.filter((p) => !p.archived);
    const archived = projects.filter((p) => p.archived);
    function renderCard(p) {
        return (_jsxs("div", { className: "stat-card", style: { borderLeft: `3px solid ${p.color}`, opacity: p.archived ? 0.55 : 1 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, children: [_jsx("span", { className: "stat-card-value", style: { fontSize: 15 }, children: p.name }), _jsx("button", { className: "btn btn-danger btn-sm", onClick: () => remove(p.id), children: "\u2715" })] }), p.description && _jsx("div", { className: "stat-card-sub", children: p.description }), p.githubRepoUrl && (_jsx("div", { className: "stat-card-sub", style: { wordBreak: 'break-all' }, children: p.githubRepoUrl })), _jsxs("div", { style: { display: 'flex', gap: 6, marginTop: 8 }, children: [_jsx("button", { className: "btn btn-secondary btn-sm", onClick: () => startEdit(p), children: "Editar" }), _jsx("button", { className: "btn btn-secondary btn-sm", onClick: () => toggleArchive(p), children: p.archived ? 'Desarquivar' : 'Arquivar' })] })] }, p.id));
    }
    return (_jsxs("div", { className: "module-page", children: [_jsxs("div", { className: "module-header", children: [_jsxs("div", { children: [_jsx("h2", { style: { fontSize: 18, fontWeight: 700 }, children: "\uD83D\uDDC2 Projetos" }), _jsxs("p", { style: { fontSize: 13, color: 'var(--text-secondary)' }, children: ["Associe um repo do GitHub e veja as issues em ", _jsx("strong", { children: "Issues (Kanban)" }), "."] })] }), _jsx("button", { className: "btn btn-primary", onClick: startCreate, children: "+ Novo Projeto" })] }), showForm && (_jsxs("div", { className: "chart-section", style: { marginBottom: 16, maxWidth: 520 }, children: [_jsx("div", { className: "chart-title", children: editing ? 'Editar projeto' : 'Novo projeto' }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }, children: [_jsx("input", { placeholder: "Nome", value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), autoFocus: true }), _jsx("input", { placeholder: "Descri\u00E7\u00E3o (opcional)", value: form.description, onChange: (e) => setForm({ ...form, description: e.target.value }) }), _jsx("input", { placeholder: "GitHub repo URL (opcional)", value: form.githubRepoUrl, onChange: (e) => setForm({ ...form, githubRepoUrl: e.target.value }) }), _jsx("div", { style: { display: 'flex', gap: 4 }, children: PRESET_COLORS.map((c) => (_jsx("button", { onClick: () => setForm({ ...form, color: c }), style: {
                                        width: 20,
                                        height: 20,
                                        borderRadius: '50%',
                                        background: c,
                                        border: form.color === c ? '2px solid white' : '2px solid transparent',
                                        cursor: 'pointer'
                                    } }, c))) }), _jsxs("div", { style: { display: 'flex', gap: 8, justifyContent: 'flex-end' }, children: [_jsx("button", { className: "btn btn-secondary btn-sm", onClick: () => setShowForm(false), children: "Cancelar" }), _jsx("button", { className: "btn btn-primary btn-sm", onClick: handleSubmit, children: editing ? 'Salvar' : 'Criar' })] })] })] })), _jsxs("div", { className: "cards-grid", children: [active.length === 0 && _jsx("div", { className: "empty-hint", children: "Nenhum projeto ativo." }), active.map(renderCard)] }), archived.length > 0 && (_jsxs(_Fragment, { children: [_jsx("div", { className: "nav-group-label", style: { marginTop: 20 }, children: "Arquivados" }), _jsx("div", { className: "cards-grid", children: archived.map(renderCard) })] }))] }));
}
