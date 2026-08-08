import { GithubIssue } from '../../../types';
export type BoardColumn = 'backlog' | 'in-progress' | 'blocked' | 'done';
interface GithubState {
    issues: GithubIssue[];
    syncing: boolean;
    error: string | null;
    lastCount: number | null;
    refresh: () => Promise<void>;
    sync: () => Promise<void>;
}
/** Map an issue to a Kanban column from its state + labels (read-only in MVP). */
export declare function columnFor(issue: GithubIssue): BoardColumn;
export declare function parseLabels(issue: GithubIssue): string[];
export declare const useGithubStore: import("zustand").UseBoundStore<import("zustand").StoreApi<GithubState>>;
export {};
