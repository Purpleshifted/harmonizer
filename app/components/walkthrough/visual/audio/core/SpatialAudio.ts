/**
 * Spatial audio utilities - HRTF Panner factory and listener management
 */

import * as Tone from 'tone';
import * as THREE from 'three';

export interface SpatialPannerOptions {
    refDistance?: number;
    maxDistance?: number;
    rolloffFactor?: number;
    distanceModel?: 'linear' | 'inverse' | 'exponential';
    useHRTF?: boolean; // Set to true for realistic 3D, false for lighter CPU load
}

const DEFAULT_PANNER_OPTIONS: SpatialPannerOptions = {
    refDistance: 2,
    maxDistance: 30,
    rolloffFactor: 1,
    distanceModel: 'inverse',
    useHRTF: false, // Default to lighter panning to avoid crackling
};

/**
 * Create a HRTF-enabled 3D panner
 */
export function createSpatialPanner(options?: SpatialPannerOptions): Tone.Panner3D {
    const opts = { ...DEFAULT_PANNER_OPTIONS, ...options };
    return new Tone.Panner3D({
        panningModel: opts.useHRTF ? 'HRTF' : 'equalpower',
        distanceModel: opts.distanceModel,
        refDistance: opts.refDistance,
        maxDistance: opts.maxDistance,
        rolloffFactor: opts.rolloffFactor,
    });
}

/**
 * Update panner position with smooth ramping
 * OPTIMIZATION: Skips update if position change is below threshold
 */
export function updatePannerPosition(
    panner: Tone.Panner3D,
    position: THREE.Vector3,
    rampTime = 0.1,
    threshold = 0.05 // Skip if movement is less than this
): void {
    // Check if position change is significant
    const dx = panner.positionX.value - position.x;
    const dy = panner.positionY.value - position.y;
    const dz = panner.positionZ.value - position.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < threshold * threshold) return; // Skip insignificant changes

    const now = Tone.now();
    panner.positionX.rampTo(position.x, rampTime, now);
    panner.positionY.rampTo(position.y, rampTime, now);
    panner.positionZ.rampTo(position.z, rampTime, now);
}

/**
 * Update Tone.js listener position and orientation
 */
export function updateListener(
    position: THREE.Vector3,
    forward: THREE.Vector3
): void {
    const listener = Tone.getListener();
    listener.positionX.value = position.x;
    listener.positionY.value = position.y;
    listener.positionZ.value = position.z;
    listener.forwardX.value = forward.x;
    listener.forwardY.value = forward.y;
    listener.forwardZ.value = forward.z;
}
