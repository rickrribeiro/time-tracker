import { localDateStr } from '../../utils/dates';
/** priority is an INTEGER column: higher = more important (sorts to the top). */
export const PRIORITIES = [
    { value: 0, label: 'Nenhuma', color: 'var(--text-muted)' },
    { value: 1, label: 'Baixa', color: '#22c55e' },
    { value: 2, label: 'Média', color: '#f59e0b' },
    { value: 3, label: 'Alta', color: '#ef4444' }
];
export function priorityDef(value) {
    return PRIORITIES.find((p) => p.value === value) || PRIORITIES[0];
}
export const STATUSES = ['todo', 'doing', 'done'];
export const STATUS_LABELS = {
    todo: 'A fazer',
    doing: 'Fazendo',
    done: 'Concluído'
};
/** Classify a due date relative to today (local time). */
export function dueMeta(dueDate, done) {
    if (!dueDate)
        return null;
    if (done)
        return { label: dueDate, cls: 'due-done' };
    const today = localDateStr(new Date());
    if (dueDate < today)
        return { label: 'Atrasada', cls: 'due-overdue' };
    if (dueDate === today)
        return { label: 'Hoje', cls: 'due-today' };
    return { label: dueDate, cls: 'due-future' };
}
