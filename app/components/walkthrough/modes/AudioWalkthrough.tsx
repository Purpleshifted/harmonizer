'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import * as Tone from 'tone';

// Centralized lib
import { CAMERA_HEIGHT } from '../../../lib/tonnetz-grid';

// Shared hooks (Level 4: shared/hooks)
import { usePlayerControls } from '../shared/hooks/usePlayerControls';
import { DetectionResult } from '../shared/hooks/useSpatialDetection';

// Legacy Visuals (Level 4: legacy/visual)
import { InfiniteGridSystem } from '../../../legacy/visual/InfiniteGridSystem';
import { GlowingGrid } from '../../../legacy/visual/GlowingGrid';
import { FloatingSpheres } from '../../../legacy/visual/FloatingSpheres';
import { ActiveHighlight } from '../../../legacy/visual/ActiveHighlight';
import { NodeLabels } from '../../../legacy/visual/NodeLabels';

// Shared audio
import { AudioController } from '../shared/audio/AudioController';
import { preloadInstruments } from '../../../lib/audio/face/factory/InstrumentFactory';
import { preloadReverbs } from '../../../lib/audio/core/ReverbFactory';

// Utilities
import { useThree, useFrame } from '@react-three/fiber';

// Camera height adjustment
const NODE_MODE_HEIGHT_BOOST = 0;

function CameraController({
    forward,
    backward,
    left,
    right,
    heightBoost,
}: {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    heightBoost: number;
}) {
    const { camera } = useThree();

    useFrame((_, delta) => {
        const speed = 3.0 * delta;
        if (forward) camera.translateZ(-speed);
        if (backward) camera.translateZ(speed);
        if (left) camera.translateX(-speed);
        if (right) camera.translateX(speed);

        // Smooth height transition
        const targetY = CAMERA_HEIGHT + heightBoost;
        camera.position.y += (targetY - camera.position.y) * 0.1;
    });

    return null;
}

export function AudioWalkthrough() {
    const [locationInfo, setLocationInfo] = useState('...');
    const [locationType, setLocationType] = useState('Initializing');
    const [isAudioReady, setIsAudioReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [areSamplesLoaded, setAreSamplesLoaded] = useState(false);

    // Detection state
    const [detection, setDetection] = useState<DetectionResult | null>(null);
    const detectionRef = useRef<DetectionResult | null>(null);

    // Controls
    const { forward, backward, left, right } = usePlayerControls();
    const heightBoost = detection?.mode === 'node' ? NODE_MODE_HEIGHT_BOOST : 0;

    const handleLocationUpdate = useCallback((info: string, type: string) => {
        setLocationInfo(info);
        setLocationType(type);
    }, []);

    // Update detection handler
    const handleDetectionUpdate = useCallback((res: DetectionResult | null) => {
        if (!res) return;
        setDetection(res);
        handleLocationUpdate(res.displayInfo, res.displayType);
        detectionRef.current = res;
    }, [handleLocationUpdate]);

    // Preload samples on mount
    React.useEffect(() => {
        let mounted = true;

        const loadAudioAssets = async () => {
            setIsLoading(true);
            try {
                // Preload heavy assets
                console.log('[AudioWalkthrough] Preloading assets...');
                const waveSample = new Tone.ToneAudioBuffer();
                const wavePromise = waveSample.load('/samples/wave/843316__loredenii__stereo-waterfall-recording-natural-audio-for-audiovisual-productions.wav');

                await Promise.all([preloadInstruments(), preloadReverbs(), wavePromise]);

                if (mounted) {
                    setAreSamplesLoaded(true);
                    console.log('[AudioWalkthrough] All samples preloaded (including Wave).');
                }
            } catch (err) {
                console.error('Failed to preload audio assets:', err);
            } finally {
                if (mounted) setIsLoading(false);
            }
        };

        loadAudioAssets();

        return () => { mounted = false; };
    }, []);

    const handleEnter = async () => {
        if (!areSamplesLoaded) return; // Prevent entry if not loaded

        try {
            // User gesture required strictly for AudioContext
            await Tone.start();
            console.log('Audio context started');
            setIsAudioReady(true);
        } catch (err) {
            console.error('Failed to start audio context:', err);
        }
    };

    return (
        <div className="w-full h-screen bg-black">
            <Canvas
                camera={{ position: [0, CAMERA_HEIGHT, 5], fov: 60 }}
                onCreated={({ gl }) => {
                    gl.setClearColor('#030303');
                    gl.toneMapping = THREE.ReinhardToneMapping;
                }}
            >
                <fog attach="fog" args={['#030303', 5, 70]} />
                <ambientLight intensity={0.1} />

                {/* Stable Audio Engine & Controls (Must not remount on state change) */}
                <AudioController isAudioReady={isAudioReady && areSamplesLoaded} detectionRef={detectionRef} />
                <PointerLockControls
                    onLock={() => {
                        console.log('[AudioWalkthrough] Pointer Locked -> AudioReady=true');
                        setIsAudioReady(true);
                    }}
                    onUnlock={() => {
                        console.log('[AudioWalkthrough] Pointer Unlocked -> AudioReady NOT CHANGED');
                        // Intentionally do NOT set AudioReady=false to prevent engine tear-down
                    }}
                />

                {/* Legacy Visuals */}
                <InfiniteGridSystem
                    setLocationInfo={handleLocationUpdate}
                    onDetectionUpdate={handleDetectionUpdate}
                    detectionRef={detectionRef}
                />
                <GlowingGrid />
                <NodeLabels />

                {detection && (
                    <FloatingSpheres
                        triangles={detection.nearestTriangles}
                        currentMode={detection.mode}
                        activeIsMajor={detection.isMajor ?? null}
                    />
                )}

                {detection && (
                    <ActiveHighlight
                        mode={detection.mode}
                        activeNodes={detection.activeNodes}
                        isMajor={detection.isMajor ?? null}
                    />
                )}

                {/* Bloom for Legacy */}
                <EffectComposer enableNormalPass={false}>
                    <Bloom luminanceThreshold={1.2} mipmapBlur intensity={1.5} radius={0.6} />
                </EffectComposer>

                <CameraController
                    forward={forward}
                    backward={backward}
                    left={left}
                    right={right}
                    heightBoost={heightBoost}
                />
            </Canvas>

            {/* Simple HUD */}
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
                    {isLoading ? 'Loading Orchestra...' : 'Click to Enter'}
                </div>
            </div>
        </div>
    );
}
