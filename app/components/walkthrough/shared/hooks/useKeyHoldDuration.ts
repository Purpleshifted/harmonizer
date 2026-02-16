'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

/**
 * Tracks key-hold duration (sec) for WASD movement.
 * Must be used inside Canvas. Updates keyHoldSecRef each frame.
 * Returns a ref: when any movement key is down, value accumulates; when all released, resets to 0.
 */
export function useKeyHoldDuration(isMoving: boolean): React.MutableRefObject<number> {
    const keyHoldSecRef = useRef(0);

    useFrame((_, delta) => {
        if (isMoving) {
            keyHoldSecRef.current += delta;
        } else {
            keyHoldSecRef.current = 0;
        }
    });

    return keyHoldSecRef;
}
