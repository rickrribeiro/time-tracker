import { Database } from 'sql.js';
export declare function getDb(): Promise<Database>;
export declare function saveDb(): void;
export declare function closeDb(): void;
