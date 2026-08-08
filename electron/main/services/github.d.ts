/**
 * Sync issues assigned to the authenticated user (open + closed, recent).
 * Reads the token from settings. Throws a clear error if unconfigured or on API failure.
 * Returns the number of issues synced.
 */
export declare function syncGithubIssues(): Promise<number>;
