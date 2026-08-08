import { Habit, HabitEntry } from '../../../types';
interface HabitState {
    habits: Habit[];
    entries: HabitEntry[];
    date: string;
    refresh: () => Promise<void>;
    create: (name: string, frequency: string, target: number) => Promise<void>;
    remove: (id: number) => Promise<void>;
    toggle: (habitId: number) => Promise<void>;
    isDone: (habitId: number) => boolean;
}
export declare const useHabitStore: import("zustand").UseBoundStore<import("zustand").StoreApi<HabitState>>;
export {};
