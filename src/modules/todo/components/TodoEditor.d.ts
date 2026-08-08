import React from 'react';
import { Todo } from '../../../types';
interface TodoEditorProps {
    todo: Todo;
    onClose: () => void;
}
/** Modal to edit every field of a todo. Shared by the TODO list and Inbox processing. */
export declare function TodoEditor({ todo, onClose }: TodoEditorProps): React.ReactElement;
export {};
