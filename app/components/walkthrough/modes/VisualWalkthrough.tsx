'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import * as THREE from 'three';
import { Leva } from 'leva';

// Centralized lib
import { CAMERA_HEIGHT } from '../../../lib/tonnetz/tonnetz-grid';

// Shared hooks
import { usePlayerControls } from '../shared/hooks/usePlayerControls';
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

interface VisualSceneLogicProps {
    detectionRef: React.MutableRefObject<DetectionResult | null>;
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
}

function VisualSceneLogic({
    detectionRef,
    forward,
    backward,
    left,
    right
}: VisualSceneLogicProps) {
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
    isMobile: boolean;
    adjustEyeLevelRef: React.MutableRefObject<((delta: number) => void) | null>;
}

function SceneContent({ onLocationUpdate, isMobile, adjustEyeLevelRef }: SceneContentProps) {
    const { forward, backward, left, right } = usePlayerControls();

    const detectionRef = useSpatialDetection({
        isMoving: forward || backward || left || right,
        onDetectionUpdate: (res) => {
            onLocationUpdate(res.displayInfo, res.displayType);
        }
    });

    return (
        <WaveSystem>
            <VisualSceneLogic
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
            {/* Desktop only: pointer lock for mouse-based camera look */}
            {!isMobile && <PointerLockControls selector="#play-button" />}
        </WaveSystem>
    );
}

export function VisualWalkthrough() {
    const [locationInfo, setLocationInfo] = useState('...');
    const [locationType, setLocationType] = useState('Initializing');
    const [displayMode, setDisplayMode] = useDisplayMode();
    const isMobile = useMobileDetect();
    const [isEntered, setIsEntered] = useState(false);

    // Bridge ref: connects DOM-layer MobileVerticalControls to Canvas-layer WaveControlContext
    const adjustEyeLevelRef = useRef<((delta: number) => void) | null>(null);

    const handleLocationUpdate = useCallback((info: string, type: string) => {
        setLocationInfo(info);
        setLocationType(type);
    }, []);

    const handleEnter = () => {
        // iOS: request accelerometer/gyroscope permission
        // Must be called in user gesture context (synchronous initiation)
        if (isMobile) {
            requestOrientationPermission().catch(() => {});
            setIsEntered(true);
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
                    isMobile={isMobile}
                    adjustEyeLevelRef={adjustEyeLevelRef}
                />
            </Canvas>

            {/* HUD — hidden in display mode (toggle with Backtick `) */}
            {!displayMode && (
                <>
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

                    {/* On mobile, hide entry button after entering (no pointer lock to cover it) */}
                    {!(isMobile && isEntered) && (
                        <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20">
                            <div
                                id="play-button"
                                className="cursor-pointer bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full backdrop-blur border border-white/20 transition"
                                onClick={handleEnter}
                            >
                                {isMobile ? 'Tap to Enter Visual Sandbox' : 'Click to Enter Visual Sandbox'}
                            </div>
                        </div>
                    )}
                </>
            )}
            {/* In display mode keep play-button in DOM for pointer lock; invisible */}
            {displayMode && <div id="play-button" className="fixed inset-0 cursor-pointer" onClick={handleEnter} aria-hidden />}

            {/* Mobile: up/down eye-level controls */}
            {isMobile && (
                <MobileVerticalControls
                    onAdjustEyeLevel={(delta) => adjustEyeLevelRef.current?.(delta)}
                />
            )}
        </div>
    );
}
