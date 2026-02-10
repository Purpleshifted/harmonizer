'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import * as THREE from 'three';
import { useControls, Leva } from 'leva';

import { CAMERA_HEIGHT } from './core/ToneSystem';
import { useLevaPersistence, getInitialValue } from './core/Persistence';
import { usePlayerControls } from './hooks/usePlayerControls';
import { useSpatialDetection, DetectionResult } from './hooks/useSpatialDetection';
import { GridDots } from './components/GridDots';
import { GridLines } from './components/GridLines';
import { NodeLabels } from './components/NodeLabels';
import { AmbienceParticles } from './components/AmbienceParticles';
import { ActiveHighlight } from './components/ActiveHighlight';

// import { UnifiedTerrainGrid } from './visual/UnifiedTerrainGrid'; // Removed
// import { GlowingGrid } from './visual/GlowingGrid'; // Removed
// import { FloatingDust } from './visual/FloatingDust'; // Removed
import { useWaveConfig, getWaveHeight, WaveConfig, WaveConfigContext } from './core/WaveSystem';

const NODE_MODE_HEIGHT_BOOST = 0;

function CameraController({
    forward,
    backward,
    left,
    right,
    waveConfig,
    isLocked,
}: {
    forward: boolean;
    backward: boolean;
    left: boolean;
    right: boolean;
    waveConfig: WaveConfig;
    isLocked: boolean;
}) {
    const { camera, clock } = useThree();

    useFrame((_, delta) => {
        if (isLocked) {
            const speed = 3.0 * delta;
            if (forward) camera.translateZ(-speed);
            if (backward) camera.translateZ(speed);
            if (left) camera.translateX(-speed);
            if (right) camera.translateX(speed);
        }

        const time = clock.getElapsedTime();
        const waveY = getWaveHeight(
            camera.position.x,
            camera.position.z,
            time,
            waveConfig.waveAmplitude,
            waveConfig.waveFrequency,
            waveConfig.waveSpeed
        );
        const targetY = waveY + waveConfig.defaultEyeLevel;
        camera.position.y += (targetY - camera.position.y) * 0.1;
    });

    return null;
}

function SceneContent({
    onLocationUpdate,
    isLocked,
    onLockChange,
}: {
    onLocationUpdate: (info: string, type: string) => void;
    isLocked: boolean;
    onLockChange: (locked: boolean) => void;
}) {
    const [detection, setDetection] = useState<DetectionResult | null>(null);
    const { forward, backward, left, right } = usePlayerControls();
    const controlsRef = useRef<any>(null);

    const waveConfig = useWaveConfig();

    useSpatialDetection({
        onDetectionUpdate: (result) => {
            setDetection(result);
            if (result.displayInfo) {
                onLocationUpdate(result.displayInfo, result.displayType || 'Mode');
            }
        }
    });

    // Leva - Global Visual Controls with Persistence
    const { bloomIntensity, bloomRadius, bloomThreshold } = useControls('Post-Processing', {
        bloomIntensity: { value: getInitialValue('bloomIntensity', 1.5), min: 0, max: 5 },
        bloomRadius: { value: getInitialValue('bloomRadius', 0.55), min: 0, max: 2 },
        bloomThreshold: { value: getInitialValue('bloomThreshold', 0.65), min: 0, max: 3, label: 'Threshold' }
    });

    useEffect(() => {
        if (!controlsRef.current) return;
        const handleLock = () => onLockChange(true);
        const handleUnlock = () => onLockChange(false);
        controlsRef.current.addEventListener('lock', handleLock);
        controlsRef.current.addEventListener('unlock', handleUnlock);
        return () => {
            if (controlsRef.current) {
                controlsRef.current.removeEventListener('lock', handleLock);
                controlsRef.current.removeEventListener('unlock', handleUnlock);
            }
        };
    }, [onLockChange]);

    return (
        <WaveConfigContext.Provider value={waveConfig}>
            <fog attach="fog" args={['#030303', 5, 200]} />
            <ambientLight intensity={0.1} />

            <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
            <GridDots
                setLocationInfo={onLocationUpdate}
                onDetectionUpdate={setDetection}
                isMajor={detection?.isMajor ?? null}
            />
            <GridLines isMajor={detection?.isMajor ?? null} />
            <AmbienceParticles isMajor={detection?.isMajor ?? null} />
            <NodeLabels />

            {/* Active Highlight: glowing spheres/lines/face for current interaction */}
            {detection && (
                <ActiveHighlight
                    mode={detection.mode}
                    activeNodes={detection.activeNodes}
                    isMajor={detection.isMajor}
                />
            )}

            <EffectComposer enableNormalPass={false}>
                <Bloom
                    luminanceThreshold={bloomThreshold}
                    mipmapBlur
                    intensity={bloomIntensity}
                    radius={bloomRadius}
                />
            </EffectComposer>

            <CameraController
                forward={forward}
                backward={backward}
                left={left}
                right={right}
                waveConfig={waveConfig}
                isLocked={isLocked}
            />

            <PointerLockControls ref={controlsRef} selector="#dummy-lock-target" />
        </WaveConfigContext.Provider>
    );
}

export default function VisualSandbox() {
    const [mounted, setMounted] = useState(false);
    const [locationInfo, setLocationInfo] = useState('...');
    const [locationType, setLocationType] = useState('Initializing');
    const [isLocked, setIsLocked] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const handleLocationUpdate = useCallback((info: string, type: string) => {
        setLocationInfo(info);
        setLocationType(type);
    }, []);

    const handleLockChange = useCallback((locked: boolean) => {
        setIsLocked(locked);
    }, []);

    useControls('Settings', useLevaPersistence());

    const handleEnter = () => {
        const dummy = document.getElementById('dummy-lock-target');
        if (dummy) {
            dummy.requestPointerLock();
        }
    };

    if (!mounted) return null;

    return (
        <div id="canvas-container" className="w-full h-screen bg-black relative">
            <Leva collapsed={false} />

            <div
                id="dummy-lock-target"
                style={{
                    position: 'absolute', top: 0, left: 0, width: '10px', height: '10px',
                    opacity: 0, pointerEvents: 'none', zIndex: -1
                }}
            />

            <Canvas
                camera={{ position: [0, CAMERA_HEIGHT, 5], fov: 60 }}
                onCreated={({ gl }) => {
                    gl.setClearColor('#030303');
                    gl.toneMapping = THREE.ReinhardToneMapping;
                }}
            >
                <SceneContent
                    onLocationUpdate={handleLocationUpdate}
                    isLocked={isLocked}
                    onLockChange={handleLockChange}
                />
            </Canvas>

            <div className="absolute top-4 left-4 z-10 text-white pointer-events-none">
                <div className="bg-black/60 p-4 rounded-lg border border-white/10 backdrop-blur-md min-w-[180px]">
                    <p className="text-xs text-blue-300 font-medium uppercase tracking-wider mb-1">
                        {locationType}
                    </p>
                    <p className="text-2xl font-serif text-white">{locationInfo}</p>
                    <p className="text-xs text-gray-400 mt-2">Visual Sandbox Mode</p>
                </div>
            </div>

            <div className="absolute top-4 left-4 z-20" style={{ transform: 'translateY(120px)' }}>
                <a href="/tonnetz" className="pointer-events-auto inline-block text-white/40 hover:text-white px-4 py-2 text-sm">
                    ← Exit
                </a>
            </div>

            {!isLocked && (
                <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
                    <button
                        className="pointer-events-auto bg-black/30 hover:bg-black/50 border border-white/20 px-8 py-4 rounded-lg text-white text-lg transition-all shadow-lg"
                        onClick={handleEnter}
                    >
                        Click to Enter
                    </button>
                    <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 text-white/50 text-sm">
                        Adjust Leva settings anytime • Press Click to Enter to start
                    </div>
                </div>
            )}

            {isLocked && (
                <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20 text-white/50 text-sm pointer-events-none">
                    WASD to Move • ESC to Release
                </div>
            )}
        </div>
    );
}
