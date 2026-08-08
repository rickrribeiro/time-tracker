export interface DbTag {
    id: number;
    name: string;
    color: string;
    isProductive: number;
}
export interface DbTask {
    id: number;
    title: string;
    tagId: number | null;
    secondaryTagId: number | null;
    startTime: string;
    endTime: string | null;
}
export interface DbTaskWithTag extends DbTask {
    tagName: string | null;
    tagColor: string | null;
    tagIsProductive: number | null;
    secondaryTagName: string | null;
    secondaryTagColor: string | null;
}
export interface DailyStats {
    date: string;
    totalMinutes: number;
    productiveMinutes: number;
    semiProductiveMinutes: number;
    productiveErosMinutes: number;
    isWorkDay: number;
}
export interface DayConfig {
    date: string;
    isWorkDay: number;
}
export interface TagStats {
    tagId: number | null;
    tagName: string | null;
    tagColor: string | null;
    isProductive: number | null;
    totalMinutes: number;
}
export declare function getAllTags(): Promise<DbTag[]>;
export declare function createTag(name: string, color: string, isProductive: number): Promise<DbTag>;
export declare function updateTag(id: number, name: string, color: string, isProductive: number): Promise<DbTag>;
export declare function deleteTag(id: number): Promise<void>;
export declare function getTasksForRange(startDate: string, endDate: string): Promise<DbTaskWithTag[]>;
export declare function getAllTasks(): Promise<DbTaskWithTag[]>;
export declare function getActiveTask(): Promise<DbTaskWithTag | null>;
export declare function createTask(title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, endTime?: string | null): Promise<DbTask>;
export declare function updateTask(id: number, title: string, tagId: number | null, secondaryTagId: number | null, startTime: string, endTime: string | null): Promise<DbTask>;
export declare function stopTask(id: number, endTime: string): Promise<void>;
export declare function deleteTask(id: number): Promise<void>;
export declare function stopAllActiveTasks(endTime: string): Promise<void>;
export declare function getDailyStats(startDate: string, endDate: string): Promise<DailyStats[]>;
export declare function getTagStats(startDate: string, endDate: string): Promise<TagStats[]>;
export declare function updateDayConfig(date: string, isWorkDay: number): Promise<void>;
export declare function fillGapsWithIdle(date: string): Promise<void>;
export interface DbProject {
    id: number;
    name: string;
    description: string | null;
    githubRepoUrl: string | null;
    color: string;
    archived: number;
}
export interface DbTodo {
    id: number;
    title: string;
    notes: string | null;
    status: string;
    priority: number;
    dueDate: string | null;
    projectId: number | null;
    source: string;
    createdAt: string;
}
export interface DbHabit {
    id: number;
    name: string;
    frequency: string;
    target: number;
    active: number;
}
export interface DbHabitEntry {
    habitId: number;
    date: string;
    completed: number;
}
export declare function getTodos(status?: string): Promise<DbTodo[]>;
export declare function createTodo(title: string, notes: string | null, status: string, source: string, priority?: number, dueDate?: string | null, projectId?: number | null): Promise<DbTodo>;
export declare function updateTodo(id: number, title: string, notes: string | null, status: string, priority: number, dueDate: string | null, projectId: number | null): Promise<DbTodo>;
export declare function deleteTodo(id: number): Promise<void>;
export declare function getProjects(): Promise<DbProject[]>;
export declare function createProject(name: string, description: string | null, githubRepoUrl: string | null, color: string): Promise<DbProject>;
export declare function updateProject(id: number, name: string, description: string | null, githubRepoUrl: string | null, color: string, archived: number): Promise<DbProject>;
export declare function deleteProject(id: number): Promise<void>;
export declare function getHabits(): Promise<DbHabit[]>;
export declare function createHabit(name: string, frequency: string, target: number): Promise<DbHabit>;
export declare function deleteHabit(id: number): Promise<void>;
export declare function getHabitEntries(date: string): Promise<DbHabitEntry[]>;
export declare function toggleHabitEntry(habitId: number, date: string, completed: number): Promise<void>;
export declare function getSetting(key: string): Promise<string | null>;
export declare function setSetting(key: string, value: string): Promise<void>;
export declare function getAllSettings(): Promise<Record<string, string>>;
export interface DbGithubIssue {
    id: number;
    number: number;
    title: string;
    state: string;
    repo: string;
    url: string | null;
    labels: string | null;
    milestone: string | null;
    updatedAt: string | null;
}
export declare function getGithubIssues(): Promise<DbGithubIssue[]>;
/** Full replace: the table is a read-only mirror of the current assigned issues. */
export declare function replaceGithubIssues(issues: DbGithubIssue[]): Promise<void>;
