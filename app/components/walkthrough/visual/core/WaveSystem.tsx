'use client';

import React, { useEffect } from 'react';
import { useControls } from 'leva';
import * as THREE from 'three';
import { AudioMetrics } from '../../../../lib/audio/AudioMetrics';

/**
 * Wave Terrain System
 * 
 * Provides wave height calculation for terrain undulation effect.
 * The entire grid (nodes, edges) should call getWaveHeight() to determine Y position.
 * Camera also follows wave height for "boat on ocean" experience.
 */

// Wave configuration hook - call once at scene root level
export function useWaveConfig() {
    const [config, setConfig] = useControls('Wave Terrain', () => ({
        waveAmplitude: { value: 0.7, min: 0, max: 5, step: 0.1, label: 'Amplitude' },
        waveFrequency: { value: 0.05, min: 0.01, max: 0.5, step: 0.01, label: 'Frequency' },
        waveSpeed: { value: 0.9, min: 0, max: 5, step: 0.1, label: 'Speed' },
        defaultEyeLevel: { value: 5.0, min: 1, max: 20, step: 0.5, label: 'Eye Level' },
    }));

    // Eye level sync (Audio & Control)
    useEffect(() => {
        AudioMetrics.defaultEyeLevel = config.defaultEyeLevel;
        AudioMetrics.waveParams.amplitude = config.waveAmplitude;
        AudioMetrics.waveParams.frequency = config.waveFrequency;
        AudioMetrics.waveParams.speed = config.waveSpeed;
    }, [config.defaultEyeLevel, config.waveAmplitude, config.waveFrequency, config.waveSpeed]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setConfig({ defaultEyeLevel: Math.min(20, config.defaultEyeLevel + 0.5) });
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setConfig({ defaultEyeLevel: Math.max(1, config.defaultEyeLevel - 0.5) });
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [config.defaultEyeLevel, setConfig]);

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

    // Combine base waves
    let height = wave1 + wave2 + wave3;

    // Apply exact identical spatial wave synced crest mathematics
    // The wave crashes specifically at the crest of the primary wave (Phase ~ 1.5707)
    // Match the exact same trigger from Dirigent.ts:
    const phase1 = x * frequency + time * speed;
    const normCrest = (Math.sin(phase1) + 1.0) * 0.5;

    // Trigger physical crest lift smoothly around the top 20% of the wave peak
    if (normCrest > 0.8) {
        const presence = (normCrest - 0.8) * 5.0; // 0.0 to 1.0
        const audioCurve = Math.pow(presence, 1.5);

        // Add extreme physical height when the Bloom Band passes directly under this (x,z) coordinate
        height += audioCurve * amplitude * 1.5;
    }

    return height;
}

// simple helper purely for TS
function smoothstep(min: number, max: number, value: number) {
    const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return x * x * (3 - 2 * x);
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
