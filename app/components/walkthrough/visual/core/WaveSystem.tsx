'use client';

import React from 'react';
import { useControls } from 'leva';
import * as THREE from 'three';

/**
 * Wave Terrain System
 * 
 * Provides wave height calculation for terrain undulation effect.
 * The entire grid (nodes, edges) should call getWaveHeight() to determine Y position.
 * Camera also follows wave height for "boat on ocean" experience.
 */

// Wave configuration hook - call once at scene root level
export function useWaveConfig() {
    const config = useControls('Wave Terrain', {
        waveAmplitude: { value: 1.2, min: 0, max: 5, step: 0.1, label: 'Amplitude' },
        waveFrequency: { value: 0.08, min: 0.01, max: 0.5, step: 0.01, label: 'Frequency' },
        waveSpeed: { value: 1.2, min: 0, max: 5, step: 0.1, label: 'Speed' },
        defaultEyeLevel: { value: 4.0, min: 1, max: 20, step: 0.5, label: 'Eye Level' },
    });

    return config;
}

// Wave height calculation
// Uses multi-sine composition for natural wave look
export function getWaveHeight(
    x: number,
    z: number,
    time: number,
    amplitude: number,
    frequency: number,
    speed: number
): number {
    // Primary wave (large, slow)
    const wave1 = Math.sin(x * frequency + time * speed) * amplitude;

    // Secondary wave (perpendicular, different frequency)
    const wave2 = Math.sin(z * frequency * 0.7 + time * speed * 0.8) * amplitude * 0.5;

    // Tertiary wave (diagonal, faster, smaller)
    const wave3 = Math.sin((x + z) * frequency * 1.3 + time * speed * 1.2) * amplitude * 0.25;

    // Combine waves
    return wave1 + wave2 + wave3;
}

// Precomputed wave data type for passing to children
export interface WaveConfig {
    waveAmplitude: number;
    waveFrequency: number;
    waveSpeed: number;
    defaultEyeLevel: number;
}

// Helper to create wave config context (optional, for deep prop drilling avoidance)
import { useRef, useMemo, createContext, useContext } from 'react';
import { useFrame } from '@react-three/fiber';
import { getInitialValue } from './Persistence';
import { getNodeWorldPosition } from '../../../../../app/lib/tonnetz/tonnetz-grid';

export const WaveConfigContext = createContext<WaveConfig | null>(null);

export function useWaveConfigContext() {
    const ctx = useContext(WaveConfigContext);
    if (!ctx) {
        throw new Error('useWaveConfigContext must be used within WaveConfigContext.Provider');
    }
    return ctx;
}

interface WaveSystemProps {
    children: React.ReactNode;
}

export function WaveSystem({ children }: WaveSystemProps) {
    const config = useWaveConfig();

    // Create simpler config object for context
    const contextValue: WaveConfig = {
        waveAmplitude: config.waveAmplitude,
        waveFrequency: config.waveFrequency,
        waveSpeed: config.waveSpeed,
        defaultEyeLevel: config.defaultEyeLevel,
    };

    return (
        <WaveConfigContext.Provider value={contextValue}>
            {children}
        </WaveConfigContext.Provider>
    );
}
