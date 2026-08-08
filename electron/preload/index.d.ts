declare const api: {
    tags: {
        getAll: () => Promise<any>;
        create: (name: string, color: string, isProductive: number) => Promise<any>;
        update: (id: number, name: string, color: string, isProductive: number) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    tasks: {
        getAll: () => Promise<any>;
        getForRange: (startDate: string, endDate: string) => Promise<any>;
        getActive: () => Promise<any>;
        start: (title: string, tagId: number | null, secondaryTagId: number | null, startTime?: string) => Promise<any>;
        stop: (id: number, endTime?: string) => Promise<any>;
        update: (id: number, title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, endTime: string | null) => Promise<any>;
        delete: (id: number) => Promise<any>;
        add: (title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, endTime: string | null) => Promise<any>;
        stopAll: (endTime: string) => Promise<any>;
        fillGaps: (date: string) => Promise<any>;
    };
    stats: {
        daily: (startDate: string, endDate: string) => Promise<any>;
        byTag: (startDate: string, endDate: string) => Promise<any>;
    };
    dayConfig: {
        update: (date: string, isWorkDay: number) => Promise<any>;
    };
    todos: {
        getAll: (status?: string) => Promise<any>;
        create: (title: string, notes: string | null, status: string, source: string, priority?: number, dueDate?: string | null, projectId?: number | null) => Promise<any>;
        update: (id: number, title: string, notes: string | null, status: string, priority: number, dueDate: string | null, projectId: number | null) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    projects: {
        getAll: () => Promise<any>;
        create: (name: string, description: string | null, githubRepoUrl: string | null, color: string) => Promise<any>;
        update: (id: number, name: string, description: string | null, githubRepoUrl: string | null, color: string, archived: number) => Promise<any>;
        delete: (id: number) => Promise<any>;
    };
    habits: {
        getAll: () => Promise<any>;
        create: (name: string, frequency: string, target: number) => Promise<any>;
        delete: (id: number) => Promise<any>;
        getEntries: (date: string) => Promise<any>;
        toggleEntry: (habitId: number, date: string, completed: number) => Promise<any>;
    };
    settings: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: string) => Promise<any>;
        getAll: () => Promise<any>;
    };
    github: {
        getIssues: () => Promise<any>;
        sync: () => Promise<any>;
    };
    on: {
        quickCapture: (cb: () => void) => () => Electron.IpcRenderer;
    };
    app: {
        exportDb: () => Promise<any>;
        importDb: () => Promise<any>;
        openExternal: (url: string) => Promise<any>;
    };
};
export type ElectronAPI = typeof api;
export {};
