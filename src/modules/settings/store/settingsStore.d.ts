interface SettingsState {
    values: Record<string, string>;
    refresh: () => Promise<void>;
    set: (key: string, value: string) => Promise<void>;
    get: (key: string) => string;
}
export declare const useSettingsStore: import("zustand").UseBoundStore<import("zustand").StoreApi<SettingsState>>;
export {};
