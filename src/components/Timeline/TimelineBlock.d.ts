import React from 'react';
import { TaskWithTag } from '../../types';
interface Props {
    task: TaskWithTag;
    pixelsPerMinute: number;
    dayStart: Date;
    selected: boolean;
    onClick: () => void;
    onUpdate: (startTime: string, endTime: string | null) => void;
}
export declare function TimelineBlock({ task, pixelsPerMinute, dayStart, selected, onClick, onUpdate }: Props): React.ReactElement;
export {};
