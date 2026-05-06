'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useMobileDetect } from './hooks/useMobileDetect';

interface MobileVerticalControlsProps {
    /** Called continuously while button is held. delta = +0.5 (up) or -0.5 (down) */
    onAdjustEyeLevel: (delta: number) => void;
}

/**
 * Mobile-only up/down touch buttons for eye level control.
 * Renders in the bottom-right corner with glassmorphism style.
 * Continuously fires while held (touch start → interval → touch end).
 */
export function MobileVerticalControls({ onAdjustEyeLevel }: MobileVerticalControlsProps) {
    const isMobile = useMobileDetect();
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    if (!isMobile) return null;

    const startRepeating = (delta: number) => {
        // Fire immediately
        onAdjustEyeLevel(delta);
        // Then repeat every 100ms
        intervalRef.current = setInterval(() => {
            onAdjustEyeLevel(delta);
        }, 100);
    };

    const stopRepeating = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    };

    return (
        <div
            className="fixed bottom-24 right-6 z-30 flex flex-col gap-3 pointer-events-auto"
            style={{ touchAction: 'none' }}
        >
            {/* Up button */}
            <button
                onTouchStart={(e) => {
                    e.preventDefault();
                    startRepeating(0.5);
                }}
                onTouchEnd={stopRepeating}
                onTouchCancel={stopRepeating}
                onMouseDown={() => startRepeating(0.5)}
                onMouseUp={stopRepeating}
                onMouseLeave={stopRepeating}
                style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: 'rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'background 0.15s, transform 0.1s',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                }}
                aria-label="Move up"
            >
                ▲
            </button>

            {/* Down button */}
            <button
                onTouchStart={(e) => {
                    e.preventDefault();
                    startRepeating(-0.5);
                }}
                onTouchEnd={stopRepeating}
                onTouchCancel={stopRepeating}
                onMouseDown={() => startRepeating(-0.5)}
                onMouseUp={stopRepeating}
                onMouseLeave={stopRepeating}
                style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: 'rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: 22,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'background 0.15s, transform 0.1s',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                }}
                aria-label="Move down"
            >
                ▼
            </button>
        </div>
    );
}
