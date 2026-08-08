import { Tag } from '../types';
interface TagState {
    tags: Tag[];
    refreshTags: () => Promise<void>;
    createTag: (name: string, color: string, isProductive: number) => Promise<void>;
    updateTag: (id: number, name: string, color: string, isProductive: number) => Promise<void>;
    deleteTag: (id: number) => Promise<void>;
    getTagById: (id: number | null) => Tag | undefined;
}
export declare const useTagStore: import("zustand").UseBoundStore<import("zustand").StoreApi<TagState>>;
export {};
