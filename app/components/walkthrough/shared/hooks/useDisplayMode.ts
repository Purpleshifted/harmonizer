'use client';

import { useState, useEffect, useCallback } from 'react';

/**
 * Display mode: hides all UI (Leva, HUD, Exit, play button) for a clean fullscreen view.
 * Toggle: Backtick ` (ESC is reserved for pointer unlock).
 * Initial: use ?display=1 in URL for display-only links (e.g. polished branch).
 */
export function useDisplayMode(): [boolean, (value: boolean) => void] {
    const [displayMode, setDisplayMode] = useState(false);

    // Sync from URL on mount (e.g. ?display=1 for polished/display-only links)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('display') === '1' || params.get('display') === 'true') {
            setDisplayMode(true);
        }
    }, []);

    const toggle = useCallback(() => {
        setDisplayMode((prev) => !prev);
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== '`' && e.key !== 'Backquote') return;
            const target = e.target as HTMLElement;
            if (target?.closest('input, textarea, [contenteditable="true"]')) return;
            e.preventDefault();
            toggle();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [toggle]);

    return [displayMode, setDisplayMode];
}
