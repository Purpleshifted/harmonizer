import { useThree, useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// Sensitivity settings
const PAN_SPEED = 0.05; // Scroll pixels to World Units
const ZOOM_SPEED = 0.05;
const MIN_ZOOM = 5;
const MAX_ZOOM = 50;

export function ScrollPanControls() {
    const { camera, gl } = useThree();
    const targetZoom = useRef(camera.position.z);

    // Initialize target zoom
    useEffect(() => {
        targetZoom.current = camera.position.z;

        // Ensure accurate initial rotation for top-down
        // (Though TonnetzGrid setup sets it, force it here to be safe)
        camera.rotation.set(0, 0, 0);
    }, [camera]);

    useEffect(() => {
        const canvas = gl.domElement;

        const onWheel = (e: WheelEvent) => {
            // Aggressively prevent default to stop browser navigation (Swipe Back)
            e.preventDefault();
            e.stopPropagation();

            // Check for Pinch (Ctrl Key often indicates pinch-zoom on Touchpads / or standard wheel zoom behavior)
            // Note: On Mac Trackpad, "Pinch" gesture often fires wheel with ctrlKey=true in browsers.
            if (e.ctrlKey || e.metaKey) {
                // Zoom Logic
                // We adjust the Z position (distance) for perspective camera
                const zoomDelta = e.deltaY * ZOOM_SPEED * (targetZoom.current * 0.1);
                targetZoom.current = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, targetZoom.current + zoomDelta));
            } else {
                // Pan Logic (Scroll)
                const zoomFactor = camera.position.z / 20;
                // Invert X because swiping left (fingers right) usually means "move camera left" (pan right)
                // But let's stick to standard behavior: scroll right -> camera moves right.
                camera.position.x += e.deltaX * PAN_SPEED * zoomFactor;
                camera.position.y -= e.deltaY * PAN_SPEED * zoomFactor;
            }
        };

        // Attach to window to capture ALL scroll events on the page while this component is active
        window.addEventListener('wheel', onWheel, { passive: false });

        return () => {
            window.removeEventListener('wheel', onWheel);
        };
    }, [camera, gl]);

    // Smooth Zoom interpolation
    useFrame(() => {
        if (Math.abs(camera.position.z - targetZoom.current) > 0.01) {
            camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZoom.current, 0.1);
        }
    });

    return null;
}
