'use client';

import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Touch-drag camera look control for mobile.
 * Single-finger swipe rotates the camera yaw (horizontal) and pitch (vertical).
 * Replaces PointerLockControls which doesn't work on mobile.
 *
 * Must be used inside <Canvas>.
 */
export function useMobileTouchLook(enabled: boolean) {
    const { camera, gl } = useThree();
    const touchRef = useRef<{ x: number; y: number } | null>(null);
    const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

    useEffect(() => {
        if (!enabled) return;

        const canvas = gl.domElement;
        const SENSITIVITY = 0.003;
        const MAX_PITCH = Math.PI / 2 - 0.1; // prevent full vertical flip

        const onTouchStart = (e: TouchEvent) => {
            if (e.touches.length !== 1) return;
            touchRef.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
            };
        };

        const onTouchMove = (e: TouchEvent) => {
            if (e.touches.length !== 1 || !touchRef.current) return;
            e.preventDefault();

            const dx = e.touches[0].clientX - touchRef.current.x;
            const dy = e.touches[0].clientY - touchRef.current.y;

            touchRef.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
            };

            // Apply rotation
            euler.current.setFromQuaternion(camera.quaternion);
            euler.current.y -= dx * SENSITIVITY;
            euler.current.x -= dy * SENSITIVITY;
            euler.current.x = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, euler.current.x));
            camera.quaternion.setFromEuler(euler.current);
        };

        const onTouchEnd = () => {
            touchRef.current = null;
        };

        canvas.addEventListener('touchstart', onTouchStart, { passive: true });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: true });

        return () => {
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        };
    }, [enabled, camera, gl]);
}
