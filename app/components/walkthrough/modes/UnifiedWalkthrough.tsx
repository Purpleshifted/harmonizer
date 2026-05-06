'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import * as Tone from 'tone';
import { Leva } from 'leva';

// Centralized lib
import { CAMERA_HEIGHT } from '../../../lib/tonnetz/tonnetz-grid';

// Shared hooks
import { usePlayerControls } from '../shared/hooks/usePlayerControls';
import { useKeyHoldDuration } from '../shared/hooks/useKeyHoldDuration';
import { useSpatialDetection, DetectionResult } from '../shared/hooks/useSpatialDetection';
import { useDisplayMode } from '../shared/hooks/useDisplayMode';
import { useMobileDetect } from '../shared/hooks/useMobileDetect';
import { requestOrientationPermission } from '../shared/hooks/useMobileAccelerometer';

// Visual Components
import { WaveSystem, useWaveConfigContext, getWaveHeight } from '../visual/core/WaveSystem';
import { VisualElements } from '../visual/components/VisualElements';

// Mobile Components
import { MobileTouchLookController } from '../shared/MobileTouchLookController';
import { WaveControlBridge } from '../shared/WaveControlBridge';
import { MobileVerticalControls } from '../shared/MobileVerticalControls';

// Audio
import { AudioController } from '../shared/audio/AudioController';
import { preloadInstruments } from '../../../lib/audio/sources/InstrumentFactory';
import { preloadReverbs } from '../../../lib/audio/engine/ReverbFactory';
import { preloadWaveBuffer } from '../../../lib/audio/sources/WaveBufferCache';

interface UnifiedSceneLogicProps {
    detectionRef: React.MutableRefObject<DetectionResult | null>;
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
}

function UnifiedSceneLogic({
    detectionRef,
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
            detectionRef={detectionRef}
        />
    );
}

interface SceneContentProps {
    onLocationUpdate: (info: string, type: string) => void;
    isAudioReady: boolean;
    setIsAudioReady: (ready: boolean) => void;
    isMobile: boolean;
    adjustEyeLevelRef: React.MutableRefObject<((delta: number) => void) | null>;
}

function SceneContent({ onLocationUpdate, isAudioReady, setIsAudioReady, isMobile, adjustEyeLevelRef }: SceneContentProps) {
    const { forward, backward, left, right } = usePlayerControls();
    const isMoving = forward || backward || left || right;
    const keyHoldSecRef = useKeyHoldDuration(isMoving);
    const lastInfoRef = useRef('');

    const detectionRef = useSpatialDetection({
        isMoving,
        onDetectionUpdate: (res) => {
            // Throttle: only update HUD when display string actually changed
            const key = res.displayInfo + res.displayType;
            if (key !== lastInfoRef.current) {
                lastInfoRef.current = key;
                onLocationUpdate(res.displayInfo, res.displayType);
            }
        }
    });

    return (
        <>
            <WaveSystem>
                <UnifiedSceneLogic
                    detectionRef={detectionRef}
                    forward={forward}
                    backward={backward}
                    left={left}
                    right={right}
                />
                {/* Mobile: touch-drag camera look + eye level bridge */}
                {isMobile && (
                    <>
                        <MobileTouchLookController />
                        <WaveControlBridge adjustEyeLevelRef={adjustEyeLevelRef} />
                    </>
                )}
            </WaveSystem>

            <AudioController isAudioReady={isAudioReady} detectionRef={detectionRef} keyHoldSecRef={keyHoldSecRef} isMoving={isMoving} />

            {/* Desktop only: pointer lock for mouse-based camera look */}
            {!isMobile && (
                <PointerLockControls
                    selector="#play-button"
                    onUnlock={() => setIsAudioReady(false)}
                    onLock={() => setIsAudioReady(true)}
                />
            )}
        </>
    );
}

export function UnifiedWalkthrough() {
    const [isAudioReady, setIsAudioReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [areSamplesLoaded, setAreSamplesLoaded] = useState(false);
    const [displayMode, setDisplayMode] = useDisplayMode();
    const isMobile = useMobileDetect();

    const locationInfoRef = useRef<HTMLParagraphElement>(null);
    const locationTypeRef = useRef<HTMLParagraphElement>(null);

    // Bridge ref: connects DOM-layer MobileVerticalControls to Canvas-layer WaveControlContext
    const adjustEyeLevelRef = useRef<((delta: number) => void) | null>(null);

    const handleLocationUpdate = useCallback((info: string, type: string) => {
        // Direct DOM mutation — bypasses React re-render entirely
        if (locationInfoRef.current) locationInfoRef.current.textContent = info;
        if (locationTypeRef.current) locationTypeRef.current.textContent = type;
    }, []);

    const handleEnter = async () => {
        if (isLoading) return;
        setIsLoading(true);

        try {
            // On mobile, we MUST NOT create a new AudioContext (Tone.setContext).
            // A fresh context is not associated with the user gesture, so .resume()
            // stays "suspended" forever on iOS Safari.
            // On desktop, we can safely replace with a tuned context.
            if (!isMobile && Tone.context.state !== 'running') {
                Tone.setContext(new Tone.Context({ latencyHint: 'interactive' }));
            }

            // Synchronously resume the raw AudioContext in the user gesture,
            // BEFORE any await, to ensure iOS considers this gesture-initiated.
            const rawCtx = (Tone.context as any).rawContext as AudioContext | undefined;
            rawCtx?.resume();

            // Kick off both immediately — don't await yet
            const audioPromise = Tone.start();
            const orientationPromise = isMobile
                ? requestOrientationPermission().catch(() => false)
                : Promise.resolve(true);

            // Now await both together
            await Promise.all([audioPromise, orientationPromise]);
            console.log('[Audio] Tone.context.state:', Tone.context.state);

            await Promise.all([preloadInstruments(), preloadReverbs(), preloadWaveBuffer()]);
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
            <Leva hidden={displayMode} collapsed={{ collapsed: isMobile, onChange: () => {} }} />
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
                    isMobile={isMobile}
                    adjustEyeLevelRef={adjustEyeLevelRef}
                />
            </Canvas>

            {/* HUD — hidden in display mode (toggle with Backtick `) */}
            {!displayMode && (
                <>
                    <div className="absolute top-4 left-4 z-10 text-white pointer-events-none">
                        <div className="bg-black/60 p-4 rounded-lg border border-white/10 backdrop-blur-md min-w-[180px]">
                            <p ref={locationTypeRef} className="text-xs text-blue-300 font-medium uppercase tracking-wider mb-1">
                                Initializing
                            </p>
                            <p ref={locationInfoRef} className="text-2xl font-serif text-white">...</p>
                        </div>
                    </div>

                    <div className="absolute top-4 left-4 z-20" style={{ transform: 'translateY(120px)' }}>
                        <a href="/tonnetz" className="pointer-events-auto inline-block text-white/40 hover:text-white px-4 py-2 text-sm">← Exit</a>
                    </div>

                    {/* On mobile, hide entry button after audio is ready (no pointer lock to cover it) */}
                    {!(isMobile && isAudioReady) && (
                        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20">
                            <div
                                id="play-button"
                                onClick={handleEnter}
                                className={`cursor-pointer bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full backdrop-blur border border-white/20 transition ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
                            >
                                {isLoading ? 'Loading Orchestra (Standard)...' : (isMobile ? 'Tap to Enter Harmonizer' : 'Click to Enter Harmonizer')}
                            </div>
                        </div>
                    )}
                </>
            )}
            {/* In display mode keep play-button in DOM for pointer lock; invisible */}
            {displayMode && (
                <div id="play-button" className="fixed inset-0 cursor-pointer" onClick={handleEnter} aria-hidden />
            )}

            {/* Mobile: up/down eye-level controls */}
            {isMobile && isAudioReady && (
                <MobileVerticalControls
                    onAdjustEyeLevel={(delta) => adjustEyeLevelRef.current?.(delta)}
                />
            )}
        </div>
    );
}
