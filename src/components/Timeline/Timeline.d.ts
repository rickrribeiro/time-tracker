import React from 'react';
import { TaskWithTag } from '../../types';
interface Props {
    tasks: TaskWithTag[];
    selectedDate: string;
    onRefresh: () => void;
}
export declare function Timeline({ tasks, selectedDate, onRefresh }: Props): React.ReactElement;
export {};
