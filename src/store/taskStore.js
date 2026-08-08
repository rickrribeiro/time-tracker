import { create } from 'zustand';
import { localDayStartISO, localDayEndISO } from '../utils/dates';
export const useTaskStore = create((set, get) => ({
    activeTask: null,
    todayTasks: [],
    isLoading: false,
    setActiveTask: (task) => set({ activeTask: task }),
    setTodayTasks: (tasks) => set({ todayTasks: tasks }),
    setLoading: (v) => set({ isLoading: v }),
    refreshActive: async () => {
        const active = await window.api.tasks.getActive();
        set({ activeTask: active });
    },
    refreshTasks: async (date) => {
        set({ isLoading: true });
        const tasks = await window.api.tasks.getForRange(localDayStartISO(date), localDayEndISO(date));
        set({ todayTasks: tasks, isLoading: false });
    },
    startTask: async (title, tagId, secondaryTagId = null) => {
        await window.api.tasks.start(title, tagId, secondaryTagId);
        await get().refreshActive();
    },
    stopActiveTask: async () => {
        const { activeTask } = get();
        if (!activeTask)
            return;
        await window.api.tasks.stop(activeTask.id);
        await get().refreshActive();
    },
    switchTask: async (title, tagId, secondaryTagId = null) => {
        await window.api.tasks.start(title, tagId, secondaryTagId);
        await get().refreshActive();
    },
    deleteTask: async (id) => {
        await window.api.tasks.delete(id);
    },
    updateTask: async (id, title, tagId, secondaryTagId, startTime, endTime) => {
        await window.api.tasks.update(id, title, tagId, secondaryTagId, startTime, endTime);
    }
}));
