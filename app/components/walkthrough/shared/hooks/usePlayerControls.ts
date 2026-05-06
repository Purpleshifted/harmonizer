'use client';

import { useState, useEffect, useMemo } from 'react';
import { useMobileAccelerometer } from './useMobileAccelerometer';
import { useMobileDetect } from './useMobileDetect';

export interface MovementState {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
}

/**
 * Hook to handle WASD keyboard controls for player movement.
 * On mobile, also merges accelerometer-based tilt input.
 */
export function usePlayerControls(): MovementState {
    const isMobile = useMobileDetect();

    // Keyboard state (works on all devices)
    const [keyboard, setKeyboard] = useState<MovementState>({
        forward: false,
        backward: false,
        left: false,
        right: false,
    });

    // Accelerometer state (only active on mobile)
    const accel = useMobileAccelerometer(isMobile);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'KeyW':
                    setKeyboard((m) => ({ ...m, forward: true }));
                    break;
                case 'KeyS':
                    setKeyboard((m) => ({ ...m, backward: true }));
                    break;
                case 'KeyA':
                    setKeyboard((m) => ({ ...m, left: true }));
                    break;
                case 'KeyD':
                    setKeyboard((m) => ({ ...m, right: true }));
                    break;
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'KeyW':
                    setKeyboard((m) => ({ ...m, forward: false }));
                    break;
                case 'KeyS':
                    setKeyboard((m) => ({ ...m, backward: false }));
                    break;
                case 'KeyA':
                    setKeyboard((m) => ({ ...m, left: false }));
                    break;
                case 'KeyD':
                    setKeyboard((m) => ({ ...m, right: false }));
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // Merge: either keyboard OR accelerometer triggers movement
    return useMemo(() => ({
        forward: keyboard.forward || accel.forward,
        backward: keyboard.backward || accel.backward,
        left: keyboard.left || accel.left,
        right: keyboard.right || accel.right,
    }), [keyboard, accel]);
}
