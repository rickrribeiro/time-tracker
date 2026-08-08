import { TaskWithTag } from '../types';
interface TaskState {
    activeTask: TaskWithTag | null;
    todayTasks: TaskWithTag[];
    isLoading: boolean;
    setActiveTask: (task: TaskWithTag | null) => void;
    setTodayTasks: (tasks: TaskWithTag[]) => void;
    setLoading: (v: boolean) => void;
    startTask: (title: string, tagId: number | null, secondaryTagId?: number | null) => Promise<void>;
    stopActiveTask: () => Promise<void>;
    switchTask: (title: string, tagId: number | null, secondaryTagId?: number | null) => Promise<void>;
    refreshTasks: (date: string) => Promise<void>;
    refreshActive: () => Promise<void>;
    deleteTask: (id: number) => Promise<void>;
    updateTask: (id: number, title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, endTime: string | null) => Promise<void>;
}
export declare const useTaskStore: import("zustand").UseBoundStore<import("zustand").StoreApi<TaskState>>;
export {};
