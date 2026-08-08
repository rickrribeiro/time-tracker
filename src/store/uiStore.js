import { create } from 'zustand';
import { localDateStr } from '../utils/dates';
const today = new Date();
const todayStr = localDateStr(today);
export const useUIStore = create((set) => ({
    currentPage: 'timeline',
    selectedDate: todayStr,
    selectedMonth: { year: today.getFullYear(), month: today.getMonth() },
    setPage: (page) => set({ currentPage: page }),
    setSelectedDate: (date) => set({ selectedDate: date }),
    setSelectedMonth: (year, month) => set({ selectedMonth: { year, month } })
}));
