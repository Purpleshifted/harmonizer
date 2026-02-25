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

    // We check the centralized WaveState to explicitly mirror Shader logic

    if (AudioMetrics && AudioMetrics.waveState && AudioMetrics.waveState.active) {
        const ws = AudioMetrics.waveState;

        let targetDist = 0.0;
        if (ws.progress <= 0.5) {
            targetDist = 120.0 - (ws.progress / 0.5) * 120.0; // mix(120, 0)
        } else {
            targetDist = -((ws.progress - 0.5) / 0.5) * 120.0; // mix(0, -120)
        }

        // Camera corresponds precisely to the player world position. 
        // Thus, 'distAlongWave' for the camera relative to itself is exactly 0.
        const distToHill = Math.abs(targetDist);
        const hillShape = 1.0 - smoothstep(0.0, 50.0, distToHill);

        const audioCurve = Math.pow(Math.sin(ws.progress * Math.PI), 1.5);
        let sharpCrest = hillShape * audioCurve;

        const heightMultiplier = ws.isStrong ? 3.0 : 1.5;
        // Add extreme physical height when the virtual hill passes exactly under the camera's location
        height += sharpCrest * amplitude * heightMultiplier;
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
