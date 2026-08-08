import React from 'react';
interface Props {
    year: number;
    month: number;
    selectedDate: string;
    onSelectDate: (date: string) => void;
    onPrevMonth: () => void;
    onNextMonth: () => void;
}
export declare function CalendarView({ year, month, selectedDate, onSelectDate, onPrevMonth, onNextMonth }: Props): React.ReactElement;
export {};
