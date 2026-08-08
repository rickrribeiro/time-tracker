import { create } from 'zustand';
/** Map an issue to a Kanban column from its state + labels (read-only in MVP). */
export function columnFor(issue) {
    if (issue.state === 'closed')
        return 'done';
    const labels = parseLabels(issue).map((l) => l.toLowerCase());
    if (labels.some((l) => l.includes('block') || l.includes('bloq')))
        return 'blocked';
    if (labels.some((l) => l.includes('progress') || l.includes('doing') || l.includes('andamento')))
        return 'in-progress';
    return 'backlog';
}
export function parseLabels(issue) {
    if (!issue.labels)
        return [];
    try {
        return JSON.parse(issue.labels);
    }
    catch {
        return [];
    }
}
export const useGithubStore = create((set) => ({
    issues: [],
    syncing: false,
    error: null,
    lastCount: null,
    refresh: async () => {
        const issues = await window.api.github.getIssues();
        set({ issues });
    },
    sync: async () => {
        set({ syncing: true, error: null });
        try {
            const count = await window.api.github.sync();
            const issues = await window.api.github.getIssues();
            set({ issues, lastCount: count, syncing: false });
        }
        catch (e) {
            set({ error: e instanceof Error ? e.message : String(e), syncing: false });
        }
    }
}));
