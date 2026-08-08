import React from 'react';
/**
 * Global quick-capture modal. Opens on the main-process global shortcut
 * (Ctrl/Cmd+Shift+Space) via `window.api.on.quickCapture`, and also on an
 * in-app keydown so it works while the window is focused. Writes to the
 * Inbox (todos with source='quick-capture').
 */
export declare function QuickCapture(): React.ReactElement | null;
