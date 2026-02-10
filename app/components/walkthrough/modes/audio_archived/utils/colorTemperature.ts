// Color temperature utilities for major/minor distinction
import * as THREE from 'three';

// Warm colors for Major (higher color temperature)
export const MAJOR_COLOR = new THREE.Color(1.0, 0.95, 0.85); // Warm white
export const MAJOR_GLOW = new THREE.Color(1.0, 0.8, 0.6);    // Orange-ish glow

// Cool colors for Minor (lower color temperature)
export const MINOR_COLOR = new THREE.Color(0.85, 0.92, 1.0); // Cool white
export const MINOR_GLOW = new THREE.Color(0.6, 0.8, 1.0);    // Blue-ish glow

// Neutral/default color
export const NEUTRAL_COLOR = new THREE.Color(1.0, 1.0, 1.0);
export const NEUTRAL_GLOW = new THREE.Color(0.9, 0.9, 0.9);

/**
 * Lerp between two colors
 */
export function lerpColor(c1: THREE.Color, c2: THREE.Color, t: number): THREE.Color {
    return new THREE.Color().lerpColors(c1, c2, t);
}

/**
 * Get color based on major/minor with optional intensity
 */
export function getTemperatureColor(
    isMajor: boolean | null,
    intensity: number = 1.0
): THREE.Color {
    if (isMajor === null) {
        return NEUTRAL_COLOR.clone().multiplyScalar(intensity);
    }
    const baseColor = isMajor ? MAJOR_COLOR : MINOR_COLOR;
    return baseColor.clone().multiplyScalar(intensity);
}

/**
 * Get glow color based on major/minor
 */
export function getTemperatureGlow(
    isMajor: boolean | null,
    intensity: number = 1.0
): THREE.Color {
    if (isMajor === null) {
        return NEUTRAL_GLOW.clone().multiplyScalar(intensity);
    }
    const baseColor = isMajor ? MAJOR_GLOW : MINOR_GLOW;
    return baseColor.clone().multiplyScalar(intensity);
}

/**
 * Create a fluctuating color effect (for node mode)
 * Returns a color that oscillates between warm and cool
 */
export function getFluctuatingColor(
    time: number,
    speed: number = 1.0,
    isMajor: boolean = true
): THREE.Color {
    const t = (Math.sin(time * speed) + 1) / 2; // 0 to 1
    const baseColor = isMajor ? MAJOR_COLOR : MINOR_COLOR;
    const accentColor = isMajor ? MINOR_COLOR : MAJOR_COLOR;
    return lerpColor(baseColor, accentColor, t * 0.3); // Subtle fluctuation
}
