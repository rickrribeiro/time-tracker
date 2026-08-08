export interface PriorityDef {
    value: number;
    label: string;
    color: string;
}
/** priority is an INTEGER column: higher = more important (sorts to the top). */
export declare const PRIORITIES: PriorityDef[];
export declare function priorityDef(value: number): PriorityDef;
export declare const STATUSES: readonly ["todo", "doing", "done"];
export type TodoStatus = (typeof STATUSES)[number];
export declare const STATUS_LABELS: Record<string, string>;
export interface DueMeta {
    label: string;
    cls: 'due-overdue' | 'due-today' | 'due-future' | 'due-done';
}
/** Classify a due date relative to today (local time). */
export declare function dueMeta(dueDate: string | null, done: boolean): DueMeta | null;
