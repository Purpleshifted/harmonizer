'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { useControls, Leva } from 'leva';

// Utils
import { CAMERA_HEIGHT } from './utils/tonnetzMath';

// Hooks
import { usePlayerControls } from './hooks/usePlayerControls';
import { useSpatialDetection, DetectionResult } from './hooks/useSpatialDetection';

// Visual components
import { InfiniteGridSystem } from './visual/InfiniteGridSystem';
import { GlowingGrid } from './visual/GlowingGrid';
import { FloatingSpheres } from './visual/FloatingSpheres';
import { ActiveHighlight } from './visual/ActiveHighlight';
import { NodeLabels } from './visual/NodeLabels';

// Camera height adjustment for node mode
const NODE_MODE_HEIGHT_BOOST = 0;

/**
 * Camera controller with WASD movement
 */
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

        // Smooth height transition (Height fixed)
        const targetY = CAMERA_HEIGHT;
        camera.position.y += (targetY - camera.position.y) * 0.1;
    });

    return null;
}

/**
 * Scene content - visual components inside Canvas
 */
function SceneContent({
    onLocationUpdate,
}: {
    onLocationUpdate: (info: string, type: string) => void;
}) {
    const [detection, setDetection] = useState<DetectionResult | null>(null);
    const { forward, backward, left, right } = usePlayerControls();

    const heightBoost = detection?.mode === 'node' ? NODE_MODE_HEIGHT_BOOST : 0;

    // Leva - Global Visual Controls
    const { bloomIntensity, bloomRadius } = useControls('Post-Processing', {
        bloomIntensity: { value: 1.5, min: 0, max: 5 },
        bloomRadius: { value: 0.6, min: 0, max: 2 },
    });

    return (
        <>
            <fog attach="fog" args={['#030303', 5, 70]} />
            <ambientLight intensity={0.1} />

            {/* Core grid system with detection */}
            <InfiniteGridSystem
                setLocationInfo={onLocationUpdate}
                onDetectionUpdate={setDetection}
            // detectionRef not needed for audio here
            />

            {/* Glowing lines */}
            <GlowingGrid />

            {/* Node labels */}
            <NodeLabels />

            {/* Floating spheres at triangle centroids */}
            {detection && (
                <FloatingSpheres
                    triangles={detection.nearestTriangles}
                    currentMode={detection.mode}
                    activeIsMajor={detection.isMajor}
                />
            )}

            {/* Active highlights for current mode */}
            {detection && (
                <ActiveHighlight
                    mode={detection.mode}
                    activeNodes={detection.activeNodes}
                    isMajor={detection.isMajor}
                />
            )}

            {/* Bloom post-processing */}
            <EffectComposer enableNormalPass={false}>
                <Bloom
                    luminanceThreshold={1.2}
                    mipmapBlur
                    intensity={bloomIntensity}
                    radius={bloomRadius}
                />
            </EffectComposer>

            {/* Camera and controls */}
            <CameraController
                forward={forward}
                backward={backward}
                left={left}
                right={right}
                heightBoost={heightBoost}
            />
            <PointerLockControls selector="#visual-canvas" />
        </>
    );
}

/**
 * Visual Sandbox Component
 */
export default function VisualSandbox() {
    const [locationInfo, setLocationInfo] = useState('...');
    const [locationType, setLocationType] = useState('Initializing');

    const handleLocationUpdate = useCallback((info: string, type: string) => {
        setLocationInfo(info);
        setLocationType(type);
    }, []);

    return (
        <div id="visual-canvas" className="w-full h-screen bg-black">
            {/* Leva Panel */}
            <Leva collapsed={false} />

            <Canvas
                camera={{ position: [0, CAMERA_HEIGHT, 5], fov: 60 }}
                onCreated={({ gl }) => {
                    gl.setClearColor('#030303');
                    gl.toneMapping = THREE.ReinhardToneMapping;
                }}
            >
                <SceneContent
                    onLocationUpdate={handleLocationUpdate}
                />
            </Canvas>

            {/* HUD */}
            <div className="absolute top-4 left-4 z-10 text-white pointer-events-none">
                <div className="bg-black/60 p-4 rounded-lg border border-white/10 backdrop-blur-md min-w-[180px]">
                    <p className="text-xs text-blue-300 font-medium uppercase tracking-wider mb-1">
                        {locationType}
                    </p>
                    <p className="text-2xl font-serif text-white">{locationInfo}</p>
                    <p className="text-xs text-gray-400 mt-2">Visual Sandbox Mode</p>
                </div>
            </div>

            {/* Exit link */}
            <div className="absolute top-4 left-4 z-20" style={{ transform: 'translateY(120px)' }}>
                <a
                    href="/tonnetz"
                    className="pointer-events-auto inline-block text-white/40 hover:text-white px-4 py-2 text-sm"
                >
                    ← Exit
                </a>
                <a
                    href="/tonnetz/walkthrough"
                    className="pointer-events-auto inline-block text-white/40 hover:text-white px-4 py-2 text-sm ml-4"
                >
                    Change Mode
                </a>
            </div>

            {/* Instructions */}
            <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20 text-white/50 text-sm">
                Click to Start • ESC to Menu
            </div>
        </div>
    );
}
