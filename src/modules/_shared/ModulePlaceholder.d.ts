import React from 'react';
interface ModulePlaceholderProps {
    icon: string;
    title: string;
    subtitle?: string;
    note?: string;
}
/**
 * Skeleton page used by modules whose logic isn't implemented yet.
 * Keeps navigation working and the visual coherent with the rest of the app.
 */
export declare function ModulePlaceholder({ icon, title, subtitle, note }: ModulePlaceholderProps): React.ReactElement;
export {};
