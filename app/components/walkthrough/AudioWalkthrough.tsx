'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import * as Tone from 'tone';

import { CAMERA_HEIGHT } from './utils/tonnetzMath';
import { usePlayerControls } from './hooks/usePlayerControls';
import { InfiniteGridSystem } from './visual-simplified/InfiniteGridSystem';
import { DetectionResult } from './hooks/useSpatialDetection';
import { GlowingGrid } from './visual-simplified/GlowingGrid';
import { FloatingSpheres } from './visual-simplified/FloatingSpheres';
import { ActiveHighlight } from './visual-simplified/ActiveHighlight';
import { NodeLabels } from './visual-simplified/NodeLabels';
import { AudioController } from './audio/AudioController';

const NODE_MODE_HEIGHT_BOOST = 0;

function CameraController({
    forward,
    backward,
    left,
    right,
    heightBoost: _heightBoost,
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
        const targetY = CAMERA_HEIGHT;
        camera.position.y += (targetY - camera.position.y) * 0.1;
    });
    return null;
}

function SceneContent({
    isAudioReady,
    setIsAudioReady,
    onLocationUpdate,
}: {
    isAudioReady: boolean;
    setIsAudioReady: (ready: boolean) => void;
    onLocationUpdate: (info: string, type: string) => void;
}) {
    const [detection, setDetection] = useState<DetectionResult | null>(null);
    const detectionRef = useRef<DetectionResult | null>(null);
    const { forward, backward, left, right } = usePlayerControls();

    return (
        <>
            <fog attach="fog" args={['#030303', 5, 70]} />
            <ambientLight intensity={0.1} />
            <InfiniteGridSystem
                setLocationInfo={onLocationUpdate}
                onDetectionUpdate={setDetection}
                detectionRef={detectionRef}
            />
            <GlowingGrid />
            <NodeLabels />
            {detection && (
                <FloatingSpheres
                    triangles={detection.nearestTriangles}
                    currentMode={detection.mode}
                    activeIsMajor={detection.isMajor}
                />
            )}
            {detection && (
                <ActiveHighlight
                    mode={detection.mode}
                    activeNodes={detection.activeNodes}
                    isMajor={detection.isMajor}
                />
            )}
            <EffectComposer enableNormalPass={false}>
                <Bloom luminanceThreshold={1.2} mipmapBlur intensity={1.5} radius={0.6} />
            </EffectComposer>
            <AudioController isAudioReady={isAudioReady} detectionRef={detectionRef} />
            <CameraController
                forward={forward}
                backward={backward}
                left={left}
                right={right}
                heightBoost={NODE_MODE_HEIGHT_BOOST}
            />
            <PointerLockControls
                selector="#play-button"
                onUnlock={() => setIsAudioReady(false)}
                onLock={() => setIsAudioReady(true)}
            />
        </>
    );
}

/**
 * Audio mode: visual-simplified grid + spatial audio.
 */
export default function AudioWalkthrough() {
    const [locationInfo, setLocationInfo] = useState('...');
    const [locationType, setLocationType] = useState('Initializing');
    const [isAudioReady, setIsAudioReady] = useState(false);

    const handleLocationUpdate = useCallback((info: string, type: string) => {
        setLocationInfo(info);
        setLocationType(type);
    }, []);

    const handleEnter = async () => {
        try {
            await Tone.start();
            setIsAudioReady(true);
        } catch (err) {
            console.error('Failed to start audio:', err);
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
                <SceneContent
                    isAudioReady={isAudioReady}
                    setIsAudioReady={setIsAudioReady}
                    onLocationUpdate={handleLocationUpdate}
                />
            </Canvas>
            <div className="absolute top-4 left-4 z-10 text-white pointer-events-none">
                <div className="bg-black/60 p-4 rounded-lg border border-white/10 backdrop-blur-md min-w-[180px]">
                    <p className="text-xs text-blue-300 font-medium uppercase tracking-wider mb-1">
                        {locationType}
                    </p>
                    <p className="text-2xl font-serif text-white">{locationInfo}</p>
                </div>
            </div>
            <div className="absolute top-4 left-4 z-20" style={{ transform: 'translateY(120px)' }}>
                <a href="/tonnetz" className="pointer-events-auto inline-block text-white/40 hover:text-white px-4 py-2 text-sm">
                    ← Exit
                </a>
            </div>
            <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20">
                <div
                    id="play-button"
                    onClick={handleEnter}
                    className="cursor-pointer bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full backdrop-blur border border-white/20 transition"
                >
                    Click to Enter
                </div>
            </div>
        </div>
    );
}
