'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import * as Tone from 'tone';

// Centralized lib
import { CAMERA_HEIGHT } from '../../../lib/tonnetz/tonnetz-grid';

// Shared hooks
import { usePlayerControls } from '../shared/hooks/usePlayerControls';
import { useSpatialDetection, DetectionResult } from '../shared/hooks/useSpatialDetection';

// Visual Components
import { WaveSystem, useWaveConfigContext, getWaveHeight } from '../visual/core/WaveSystem';
import { VisualElements } from '../visual/components/VisualElements';

// Audio
import { AudioController } from '../shared/audio/AudioController';
import { preloadInstruments } from '../../../lib/audio/sources/InstrumentFactory';
import { preloadReverbs } from '../../../lib/audio/engine/ReverbFactory';

interface UnifiedSceneLogicProps {
    detection: DetectionResult | null;
    onLocationUpdate: (info: string, type: string) => void;
    handleDetectionUpdate: (res: DetectionResult | null) => void;
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
}

function UnifiedSceneLogic({
    detection,
    onLocationUpdate,
    handleDetectionUpdate,
    forward,
    backward,
    left,
    right
}: UnifiedSceneLogicProps) {
    const { camera } = useThree();
    const waveConfig = useWaveConfigContext();
    const timeRef = useRef(0);

    useFrame((_, delta) => {
        // 1. WASD Movement (Horizontal)
        const speed = 3.0 * delta;
        if (forward) camera.translateZ(-speed);
        if (backward) camera.translateZ(speed);
        if (left) camera.translateX(-speed);
        if (right) camera.translateX(speed);

        // 2. Wave Height (Vertical)
        timeRef.current += delta;
        const time = timeRef.current;

        const waveY = getWaveHeight(
            camera.position.x,
            camera.position.z,
            time,
            waveConfig.waveAmplitude,
            waveConfig.waveFrequency,
            waveConfig.waveSpeed
        );

        // Target Y = Base level + wave oscillating height
        const targetY = waveConfig.defaultEyeLevel + waveY;

        // Smooth lerp for height
        camera.position.y += (targetY - camera.position.y) * 0.1;
    });

    return (
        <VisualElements
            detection={detection}
            onLocationUpdate={onLocationUpdate}
            handleDetectionUpdate={handleDetectionUpdate}
        />
    );
}

interface SceneContentProps {
    onLocationUpdate: (info: string, type: string) => void;
    isAudioReady: boolean;
    setIsAudioReady: (ready: boolean) => void;
}

function SceneContent({ onLocationUpdate, isAudioReady, setIsAudioReady }: SceneContentProps) {
    const [detection, setDetection] = useState<DetectionResult | null>(null);

    const detectionRef = useSpatialDetection({
        onDetectionUpdate: (res) => {
            setDetection(res);
            onLocationUpdate(res.displayInfo, res.displayType);
        }
    });

    const { forward, backward, left, right } = usePlayerControls();

    return (
        <>
            <WaveSystem>
                <UnifiedSceneLogic
                    detection={detection}
                    onLocationUpdate={onLocationUpdate}
                    handleDetectionUpdate={setDetection}
                    forward={forward}
                    backward={backward}
                    left={left}
                    right={right}
                />
            </WaveSystem>

            <AudioController isAudioReady={isAudioReady} detectionRef={detectionRef} />

            <PointerLockControls
                selector="#play-button"
                onUnlock={() => setIsAudioReady(false)}
                onLock={() => setIsAudioReady(true)}
            />
        </>
    );
}

export function UnifiedWalkthrough() {
    const [locationInfo, setLocationInfo] = useState('...');
    const [locationType, setLocationType] = useState('Initializing');
    const [isAudioReady, setIsAudioReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [areSamplesLoaded, setAreSamplesLoaded] = useState(false);

    const handleLocationUpdate = useCallback((info: string, type: string) => {
        setLocationInfo(info);
        setLocationType(type);
    }, []);

    const handleEnter = async () => {
        if (isLoading) return;
        setIsLoading(true);

        try {
            // Optimization: Set latency hint for better stability vs latency trade-off
            // 'interactive' = low latency, 'balanced' = medium, 'playback' = high stability
            if (Tone.context.state !== 'running') {
                Tone.setContext(new Tone.Context({ latencyHint: 'interactive' }));
            }
            await Tone.start();
            console.log('Audio context started');
            await Promise.all([preloadInstruments(), preloadReverbs()]);
            setAreSamplesLoaded(true);
            setIsAudioReady(true);
        } catch (err) {
            console.error('Failed to start audio:', err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="w-full h-screen bg-black">
            <Canvas
                camera={{ position: [0, CAMERA_HEIGHT, 5], fov: 60 }}
                onCreated={({ gl }) => {
                    gl.setClearColor('#000000');
                    gl.toneMapping = THREE.ReinhardToneMapping;
                }}
            >
                <SceneContent
                    onLocationUpdate={handleLocationUpdate}
                    isAudioReady={isAudioReady && areSamplesLoaded}
                    setIsAudioReady={setIsAudioReady}
                />
            </Canvas>

            {/* HUD */}
            <div className="absolute top-4 left-4 z-10 text-white pointer-events-none">
                <div className="bg-black/60 p-4 rounded-lg border border-white/10 backdrop-blur-md min-w-[180px]">
                    <p className="text-xs text-blue-300 font-medium uppercase tracking-wider mb-1">
                        {locationType}
                    </p>
                    <p className="text-2xl font-serif text-white">{locationInfo}</p>
                </div>
            </div>

            <div className="absolute top-4 left-4 z-20" style={{ transform: 'translateY(120px)' }}>
                <a href="/tonnetz" className="pointer-events-auto inline-block text-white/40 hover:text-white px-4 py-2 text-sm">← Exit</a>
            </div>

            <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20">
                <div
                    id="play-button"
                    onClick={handleEnter}
                    className={`cursor-pointer bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full backdrop-blur border border-white/20 transition ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
                >
                    {isLoading ? 'Loading Orchestra (Standard)...' : 'Click to Enter Harmonizer'}
                </div>
            </div>
        </div>
    );
}
