import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { useTagStore } from '../../store/tagStore';
const PRESET_COLORS = [
    '#6366f1', '#3b82f6', '#22c55e', '#f59e0b',
    '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4'
];
const defaultForm = { name: '', color: '#6366f1', isProductive: 1 };
export function TagsManager() {
    const { tags, createTag, updateTag, deleteTag } = useTagStore();
    const [form, setForm] = useState(defaultForm);
    const [editing, setEditing] = useState(null);
    const [showForm, setShowForm] = useState(false);
    function startEdit(tag) {
        setEditing(tag);
        setForm({ name: tag.name, color: tag.color, isProductive: tag.isProductive });
        setShowForm(true);
    }
    function startCreate() {
        setEditing(null);
        setForm(defaultForm);
        setShowForm(true);
    }
    async function handleSubmit() {
        if (!form.name.trim())
            return;
        if (editing) {
            await updateTag(editing.id, form.name.trim(), form.color, form.isProductive);
        }
        else {
            await createTag(form.name.trim(), form.color, form.isProductive);
        }
        setShowForm(false);
        setEditing(null);
        setForm(defaultForm);
    }
    async function handleDelete(tag) {
        if (tag.id <= 3) {
            alert('Cannot delete built-in tags.');
            return;
        }
        if (!confirm(`Delete tag "${tag.name}"? Tasks will be moved to Idle.`))
            return;
        await deleteTag(tag.id);
    }
    return (_jsxs("div", { className: "tags-page", children: [_jsxs("div", { className: "tags-header", children: [_jsx("h2", { style: { fontSize: 18, fontWeight: 700 }, children: "Tags" }), _jsx("button", { className: "btn btn-primary", onClick: startCreate, children: "+ New Tag" })] }), showForm && (_jsxs("div", { className: "tag-form", children: [_jsx("h3", { children: editing ? 'Edit Tag' : 'New Tag' }), _jsxs("div", { className: "tag-form-fields", children: [_jsx("input", { type: "text", placeholder: "Tag name", value: form.name, onChange: (e) => setForm({ ...form, name: e.target.value }), onKeyDown: (e) => e.key === 'Enter' && handleSubmit(), autoFocus: true }), _jsx("input", { type: "color", value: form.color, onChange: (e) => setForm({ ...form, color: e.target.value }) }), _jsx("div", { style: { display: 'flex', gap: 4 }, children: PRESET_COLORS.map((c) => (_jsx("button", { style: {
                                        width: 20,
                                        height: 20,
                                        borderRadius: '50%',
                                        background: c,
                                        border: form.color === c ? '2px solid white' : '2px solid transparent',
                                        cursor: 'pointer'
                                    }, onClick: () => setForm({ ...form, color: c }) }, c))) })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }, children: [_jsx("label", { htmlFor: "productive-select", style: { fontSize: 13 }, children: "Type:" }), _jsxs("select", { id: "productive-select", value: form.isProductive, onChange: (e) => setForm({ ...form, isProductive: Number(e.target.value) }), style: { fontSize: 13, padding: '4px 8px' }, children: [_jsx("option", { value: 0, children: "Non-productive" }), _jsx("option", { value: 1, children: "Productive" }), _jsx("option", { value: 2, children: "Semi-productive" }), _jsx("option", { value: 3, children: "ProductiveEros" })] })] }), _jsxs("div", { className: "tag-form-actions", children: [_jsx("button", { className: "btn btn-secondary btn-sm", onClick: () => { setShowForm(false); setEditing(null); }, children: "Cancel" }), _jsx("button", { className: "btn btn-primary btn-sm", onClick: handleSubmit, children: editing ? 'Save' : 'Create' })] })] })), _jsx("div", { className: "tags-list", children: tags.map((tag) => (_jsxs("div", { className: "tag-item", children: [_jsx("div", { className: "tag-color-dot", style: { background: tag.color } }), _jsx("span", { className: "tag-name", children: tag.name }), _jsx("span", { className: `tag-badge ${tag.isProductive === 1 ? 'productive' : tag.isProductive === 2 ? 'semi-productive' : tag.isProductive === 3 ? 'productive-eros' : 'idle'}`, children: tag.isProductive === 1 ? 'Productive' : tag.isProductive === 2 ? 'Semi-productive' : tag.isProductive === 3 ? 'ProductiveEros' : 'Non-productive' }), _jsxs("div", { className: "tag-actions", children: [_jsx("button", { className: "btn btn-secondary btn-sm", onClick: () => startEdit(tag), children: "Edit" }), tag.id > 3 && (_jsx("button", { className: "btn btn-danger btn-sm", onClick: () => handleDelete(tag), children: "Delete" }))] })] }, tag.id))) })] }));
}
