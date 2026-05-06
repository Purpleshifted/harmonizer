'use client';

import { useState, useEffect } from 'react';

/**
 * Detects whether the current device is a mobile/touch device.
 * Returns false during SSR to avoid hydration mismatch.
 */
export function useMobileDetect(): boolean {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const check =
            navigator.maxTouchPoints > 0 ||
            /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator.userAgent
            );
        setIsMobile(check);
    }, []);

    return isMobile;
}

/**
 * Synchronous check (not SSR-safe). Use only in event handlers / effects.
 */
export function isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    return (
        navigator.maxTouchPoints > 0 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
            navigator.userAgent
        )
    );
}
