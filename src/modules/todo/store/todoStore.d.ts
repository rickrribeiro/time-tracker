import { Todo } from '../../../types';
interface TodoState {
    todos: Todo[];
    refresh: () => Promise<void>;
    capture: (title: string) => Promise<void>;
    create: (title: string, status?: string) => Promise<void>;
    setStatus: (id: number, status: string) => Promise<void>;
    update: (todo: Todo) => Promise<void>;
    remove: (id: number) => Promise<void>;
    inbox: () => Todo[];
    active: () => Todo[];
}
/** Single store backing both the Inbox and the TODO views (they share the `todos` table). */
export declare const useTodoStore: import("zustand").UseBoundStore<import("zustand").StoreApi<TodoState>>;
export {};
