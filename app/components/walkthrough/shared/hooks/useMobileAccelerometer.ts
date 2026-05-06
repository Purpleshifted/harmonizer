'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { isMobileDevice } from './useMobileDetect';

interface MovementState {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
}

const DEAD_ZONE = 15; // degrees — ignore tilts smaller than this

/**
 * Uses DeviceOrientationEvent to map device tilt to movement state.
 * Only activates on mobile devices. Returns all-false on desktop.
 *
 * beta  = front/back tilt (positive = tilted forward)
 * gamma = left/right tilt (positive = tilted right)
 *
 * Calibrates the "zero" orientation when the hook first receives data,
 * so the user can hold the phone at any comfortable angle.
 */
export function useMobileAccelerometer(enabled: boolean = true): MovementState {
    const [movement, setMovement] = useState<MovementState>({
        forward: false,
        backward: false,
        left: false,
        right: false,
    });

    // Calibration: store the initial orientation as "zero"
    const calibrationRef = useRef<{ beta: number; gamma: number } | null>(null);

    useEffect(() => {
        if (!enabled || !isMobileDevice()) return;

        const handler = (e: DeviceOrientationEvent) => {
            const beta = e.beta ?? 0;   // -180 to 180
            const gamma = e.gamma ?? 0; // -90 to 90

            // Calibrate on first reading
            if (!calibrationRef.current) {
                calibrationRef.current = { beta, gamma };
            }

            const relBeta = beta - calibrationRef.current.beta;
            const relGamma = gamma - calibrationRef.current.gamma;

            setMovement({
                forward: relBeta < -DEAD_ZONE,
                backward: relBeta > DEAD_ZONE,
                left: relGamma < -DEAD_ZONE,
                right: relGamma > DEAD_ZONE,
            });
        };

        window.addEventListener('deviceorientation', handler);
        return () => {
            window.removeEventListener('deviceorientation', handler);
            calibrationRef.current = null;
        };
    }, [enabled]);

    return movement;
}

/**
 * Request DeviceOrientation permission on iOS 13+.
 * Must be called from a user gesture (click/tap handler).
 * Returns true if permission granted or not required.
 */
export async function requestOrientationPermission(): Promise<boolean> {
    // iOS 13+ requires explicit permission
    const DOE = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
    };

    if (typeof DOE.requestPermission === 'function') {
        try {
            const result = await DOE.requestPermission();
            return result === 'granted';
        } catch {
            console.warn('DeviceOrientation permission request failed');
            return false;
        }
    }

    // Non-iOS or older iOS — permission not required
    return true;
}
