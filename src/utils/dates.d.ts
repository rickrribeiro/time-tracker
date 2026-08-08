/** Format a Date as YYYY-MM-DD using LOCAL time (not UTC) */
export declare function localDateStr(date?: Date): string;
/** Start of a local calendar day as UTC ISO string (for DB queries) */
export declare function localDayStartISO(dateStr: string): string;
/** End of a local calendar day as UTC ISO string (for DB queries) */
export declare function localDayEndISO(dateStr: string): string;
