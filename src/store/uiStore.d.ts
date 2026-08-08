import { Page } from '../types';
interface UIState {
    currentPage: Page;
    selectedDate: string;
    selectedMonth: {
        year: number;
        month: number;
    };
    setPage: (page: Page) => void;
    setSelectedDate: (date: string) => void;
    setSelectedMonth: (year: number, month: number) => void;
}
export declare const useUIStore: import("zustand").UseBoundStore<import("zustand").StoreApi<UIState>>;
export {};
