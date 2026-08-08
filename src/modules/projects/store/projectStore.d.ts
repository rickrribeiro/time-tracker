import { Project } from '../../../types';
interface ProjectState {
    projects: Project[];
    refresh: () => Promise<void>;
    create: (name: string, description: string | null, githubRepoUrl: string | null, color: string) => Promise<void>;
    update: (project: Project) => Promise<void>;
    remove: (id: number) => Promise<void>;
}
export declare const useProjectStore: import("zustand").UseBoundStore<import("zustand").StoreApi<ProjectState>>;
export {};
