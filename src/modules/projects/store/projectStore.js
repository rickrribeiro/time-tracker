import { create } from 'zustand';
export const useProjectStore = create((set, get) => ({
    projects: [],
    refresh: async () => {
        const projects = await window.api.projects.getAll();
        set({ projects });
    },
    create: async (name, description, githubRepoUrl, color) => {
        await window.api.projects.create(name, description, githubRepoUrl, color);
        await get().refresh();
    },
    update: async (project) => {
        await window.api.projects.update(project.id, project.name, project.description, project.githubRepoUrl, project.color, project.archived);
        await get().refresh();
    },
    remove: async (id) => {
        await window.api.projects.delete(id);
        await get().refresh();
    }
}));
