'use client';

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useControls } from 'leva';
import { getNodeWorldPosition, getWorldToGrid, VIEW_RADIUS, GRID_SIZE, TOTAL_INSTANCES as TOTAL_NODES } from '../core/ToneSystem';
import { useWaveConfig } from '../core/WaveSystem';
import { DetectionResult } from '../hooks/useSpatialDetection';
import { getInitialValue } from '../core/Persistence';
import { WAVE_UNIFORMS, WAVE_VERTEX_CHUNK } from '../shaders/wave.glsl';
import { COMMON_UNIFORMS, COLOR_UNIFORMS, BLOOM_UNIFORMS, FRAGMENT_CHUNK } from '../shaders/visual_common.glsl';

interface GridDotsProps {
    setLocationInfo: (info: string, type: string) => void;
    onDetectionUpdate: (detection: DetectionResult | null) => void;
    isMajor?: boolean | null;
}

export function GridDots({ setLocationInfo, onDetectionUpdate, isMajor }: GridDotsProps) {
    const { camera, clock } = useThree();
    const groupRef = useRef<THREE.Group>(null);
    const dotsRef = useRef<THREE.Points>(null);

    // Smooth transitions
    const smoothMajorRef = useRef(0);
    const smoothNeutralRef = useRef(1.0);

    const waveConfig = useWaveConfig();

    const {
        dotSize,
        dotOpacity,
        nodeBaseEmissive,
        nodeMajorBloomColor,
        nodeMinorBloomColor,
        nodeNeutralBloomColor,
        nodeBloomStart,
        nodeBloomFade,
        nodeBloomIntensity,
        nodeColorStart,
        nodeColorFade,
    } = useControls('Terrain Grid', {
        dotSize: { value: getInitialValue('dotSize', 0.25), min: 0.02, max: 2.0 },
        dotOpacity: { value: getInitialValue('dotOpacity', 0.8), min: 0, max: 1 },
        nodeBaseEmissive: { value: getInitialValue('nodeBaseEmissive', 1.2), min: 0.1, max: 15, label: '✨ Base Glow' },
        nodeMajorBloomColor: { value: getInitialValue('nodeMajorBloomColor', '#ffe28aff') },
        nodeMinorBloomColor: { value: getInitialValue('nodeMinorBloomColor', '#98c0ffff') },
        nodeNeutralBloomColor: { value: getInitialValue('nodeNeutralBloomColor', '#b8b8b8e9'), label: 'Neutral' },
        nodeBloomStart: { value: getInitialValue('nodeBloomStart', 30), min: 0, max: 150, label: '🔆 Start' },
        nodeBloomFade: { value: getInitialValue('nodeBloomFade', 20), min: 0, max: 150, label: '🔆 Fade' },
        nodeBloomIntensity: { value: getInitialValue('nodeBloomIntensity', 5.0), min: 1, max: 8, label: '🔆 Power' },
        nodeColorStart: { value: getInitialValue('nodeColorStart', 35), min: 0, max: 150, label: '🎨 Start' },
        nodeColorFade: { value: getInitialValue('nodeColorFade', 85), min: 0, max: 150, label: '🎨 Fade' },
    });

    // 1. Static Buffer (CPU Optimized)
    const dotPositions = useMemo(() => {
        const positions = new Float32Array(TOTAL_NODES * 3);
        let i = 0;
        const start = -VIEW_RADIUS;
        const end = VIEW_RADIUS;

        for (let dv = start; dv <= end; dv++) {
            for (let du = start; du <= end; du++) {
                const pos = getNodeWorldPosition(du, dv);
                positions[i * 3] = pos.x;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = pos.z;
                i++;
            }
        }
        return positions;
    }, []);

    // Shader using Shared Chunks
    const dotsShader = useMemo(() => new THREE.ShaderMaterial({
        uniforms: {
            ...COMMON_UNIFORMS(),
            ...WAVE_UNIFORMS,
            ...COLOR_UNIFORMS(),
            ...BLOOM_UNIFORMS(),
            uSize: { value: 0.25 },
            uOpacity: { value: 0.8 },
            uBaseEmissive: { value: 1.2 },
        },
        vertexShader: `
            ${WAVE_VERTEX_CHUNK}
            
            uniform vec3 uPlayerPos;
            uniform vec3 uGridOffset;
            uniform float uSize;
            
            varying float vDist;
            
            void main() {
                vec3 pos = position + uGridOffset;
                
                // Apply shared wave logic
                pos = applyWave(pos);
                
                vDist = distance(pos, uPlayerPos);
                
                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                
                float size = uSize * (300.0 / pow(-mvPosition.z, 0.75));
                gl_PointSize = clamp(size, 2.0, 50.0);
                
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            ${FRAGMENT_CHUNK}
            
            uniform float uOpacity;
            uniform float uBaseEmissive;
            varying float vDist;
            
            void main() {
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                float shapeAlpha = exp(-dist * dist * 16.0); 
                
                if (dist > 0.5) discard;
                shapeAlpha *= smoothstep(0.5, 0.4, dist);
                
                // Layer 1: Bloom (HDR intensity)
                float bloomFactor = getBloomFactor(vDist);
                float bloomMultiplier = getBloomMultiplier(bloomFactor);
                
                // Layer 2: Color (tint, independent radius)
                float colorFactor = getColorFactor(vDist);
                vec3 finalColor = getFinalColor(colorFactor);
                
                float fogAlpha = getFogAlpha(vDist);
                vec3 hdrColor = finalColor * uBaseEmissive * bloomMultiplier;
                
                gl_FragColor = vec4(hdrColor, uOpacity * shapeAlpha * fogAlpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    }), []);

    useFrame((_, delta) => {
        const playerPos = camera.position;
        const { u: centerU, v: centerV } = getWorldToGrid(playerPos.x, playerPos.z);
        const snappedPos = getNodeWorldPosition(centerU, centerV);

        const targetMajor = isMajor === true ? 1.0 : 0.0;
        const isNeutral = (isMajor === null || isMajor === undefined);
        const targetNeutral = isNeutral ? 1.0 : 0.0;

        smoothMajorRef.current = THREE.MathUtils.lerp(smoothMajorRef.current, targetMajor, delta * 1.2);
        smoothNeutralRef.current = THREE.MathUtils.lerp(smoothNeutralRef.current, targetNeutral, delta * 1.2);

        const dm = dotsShader;
        if (!dm.uniforms) return;

        dm.uniforms.uTime.value = clock.getElapsedTime();
        dm.uniforms.uWaveAmplitude.value = waveConfig.waveAmplitude;
        dm.uniforms.uWaveFrequency.value = waveConfig.waveFrequency;
        dm.uniforms.uWaveSpeed.value = waveConfig.waveSpeed;
        dm.uniforms.uPlayerPos.value.copy(playerPos);
        dm.uniforms.uGridOffset.value.set(snappedPos.x, 0, snappedPos.z);

        dm.uniforms.uBloomStartRadius.value = nodeBloomStart;
        dm.uniforms.uBloomFadeLength.value = nodeBloomFade;
        dm.uniforms.uBloomIntensity.value = nodeBloomIntensity;
        dm.uniforms.uColorStartRadius.value = nodeColorStart;
        dm.uniforms.uColorFadeLength.value = nodeColorFade;

        dm.uniforms.uMajorColor.value.set(nodeMajorBloomColor);
        dm.uniforms.uMinorColor.value.set(nodeMinorBloomColor);
        dm.uniforms.uNeutralColor.value.set(nodeNeutralBloomColor);
        dm.uniforms.uSmoothMajor.value = smoothMajorRef.current;
        dm.uniforms.uSmoothNeutral.value = smoothNeutralRef.current;
        dm.uniforms.uSize.value = dotSize;
        dm.uniforms.uOpacity.value = dotOpacity;
        dm.uniforms.uBaseEmissive.value = nodeBaseEmissive;
        dm.uniforms.uFogFar.value = 200.0;
    });

    return (
        <group ref={groupRef}>
            <points ref={dotsRef} frustumCulled={false}>
                <bufferGeometry>
                    <bufferAttribute
                        attach="attributes-position"
                        count={TOTAL_NODES}
                        array={dotPositions}
                        itemSize={3}
                        args={[dotPositions, 3]}
                    />
                </bufferGeometry>
                <primitive object={dotsShader} attach="material" />
            </points>
        </group>
    );
}
