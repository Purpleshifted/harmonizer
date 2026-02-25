'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useControls } from 'leva';
import { getNodeWorldPosition, getWorldToGrid } from '../../../../lib/tonnetz/tonnetz-grid';

const VIEW_RADIUS = 100;
const GRID_SIZE = VIEW_RADIUS * 2 + 1;
const TOTAL_INSTANCES = GRID_SIZE * GRID_SIZE;
import { DetectionResult } from '../../shared/hooks/useSpatialDetection';
import { getInitialValue } from '../core/Persistence';
import { useWaveConfigContext } from '../core/WaveSystem';
import { AudioMetrics } from '../../../../lib/audio/AudioMetrics';
import { WAVE_UNIFORMS, WAVE_VERTEX_CHUNK } from '../shaders/wave.glsl';
import { COMMON_UNIFORMS, COLOR_UNIFORMS, BLOOM_UNIFORMS, FRAGMENT_CHUNK } from '../shaders/visual_common.glsl';

interface GridLinesProps {
    isMajor?: boolean | null;
}

export function GridLines({ isMajor }: GridLinesProps) {
    const { camera, clock } = useThree();
    const linesRef = useRef<THREE.LineSegments>(null);
    const smoothMajorRef = useRef(0.0);
    const smoothNeutralRef = useRef(1.0);

    const waveConfig = useWaveConfigContext();

    const {
        edgeOpacity,
        edgeBloomStart,
        edgeBloomFade,
        edgeBloomIntensity,
        edgeColorStart,
        edgeColorFade,
        edgeMajorBloomColor,
        edgeMinorBloomColor,
        edgeNeutralBloomColor,
    } = useControls('Grid Edges', {
        edgeOpacity: { value: getInitialValue('edgeOpacity', 0.015), min: 0.01, max: 0.5, label: 'Opacity' },
        edgeBloomStart: { value: getInitialValue('edgeBloomStart', 116), min: 0, max: 150, label: '🔆 Bloom Start' },
        edgeBloomFade: { value: getInitialValue('edgeBloomFade', 150), min: 5, max: 150, label: '🔆 Bloom Fade' },
        edgeBloomIntensity: { value: getInitialValue('edgeBloomIntensity', 8.0), min: 0.5, max: 10.0, label: '🔆 Bloom Power' },
        edgeColorStart: { value: getInitialValue('edgeColorStart', 0), min: 0, max: 150, label: '🎨 Color Start' },
        edgeColorFade: { value: getInitialValue('edgeColorFade', 10), min: 0, max: 150, label: '🎨 Color Fade' },
        edgeMajorBloomColor: { value: getInitialValue('edgeMajorBloomColor', '#ece2bc'), label: 'Major Color' },
        edgeMinorBloomColor: { value: getInitialValue('edgeMinorBloomColor', '#a6ceef'), label: 'Minor Color' },
        edgeNeutralBloomColor: { value: getInitialValue('edgeNeutralBloomColor', '#eee9ea'), label: 'Neutral Color' },
    });

    const TOTAL_EDGES = TOTAL_INSTANCES * 3;

    // 1. Static Buffer centered at (0,0) (CPU Optimization)
    const positionBuffer = useMemo(() => {
        const positions = new Float32Array(TOTAL_EDGES * 6);
        let ei = 0;
        const start = -VIEW_RADIUS;
        const end = VIEW_RADIUS;

        for (let dv = start; dv <= end; dv++) {
            for (let du = start; du <= end; du++) {
                const pos = getNodeWorldPosition(du, dv);
                const pRight = getNodeWorldPosition(du + 1, dv);
                const pDL = getNodeWorldPosition(du, dv + 1);
                const pDR = getNodeWorldPosition(du + 1, dv + 1);

                // Edge to right
                let base = ei * 6;
                positions[base] = pos.x; positions[base + 1] = 0; positions[base + 2] = pos.z;
                positions[base + 3] = pRight.x; positions[base + 4] = 0; positions[base + 5] = pRight.z;
                ei++;

                // Edge down-left
                base = ei * 6;
                positions[base] = pos.x; positions[base + 1] = 0; positions[base + 2] = pos.z;
                positions[base + 3] = pDL.x; positions[base + 4] = 0; positions[base + 5] = pDL.z;
                ei++;

                // Edge down-right
                base = ei * 6;
                positions[base] = pos.x; positions[base + 1] = 0; positions[base + 2] = pos.z;
                positions[base + 3] = pDR.x; positions[base + 4] = 0; positions[base + 5] = pDR.z;
                ei++;
            }
        }
        return positions;
    }, []);

    // Shader using Shared Chunks
    const shaderMaterial = useMemo(() => {
        return new THREE.ShaderMaterial({
            uniforms: {
                ...COMMON_UNIFORMS(),
                ...WAVE_UNIFORMS,
                ...COLOR_UNIFORMS(),
                ...BLOOM_UNIFORMS(),
                uOpacity: { value: 0.1 },
            },
            vertexShader: `
                ${WAVE_VERTEX_CHUNK}
                
                uniform vec3 uGridOffset;
                uniform vec3 uPlayerPos; 
                varying float vDist;
                
                void main() {
                    vec3 pos = position + uGridOffset;
                    
                    // Apply shared wave logic
                    pos = applyWave(pos);
                    
                    vDist = distance(pos, uPlayerPos);
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                ${FRAGMENT_CHUNK}
                
                uniform float uOpacity;
                varying float vDist;
                
                void main() {
                    // Layer 1: Bloom (HDR intensity)
                    float bloomFactor = getBloomFactor(vDist);
                    float bloomMultiplier = getBloomMultiplier(bloomFactor);
                    
                    // Layer 2: Color (tint, independent radius)
                    float colorFactor = getColorFactor(vDist);
                    vec3 finalColor = getFinalColor(colorFactor);
                    
                    float fogAlpha = getFogAlpha(vDist);
                    vec3 hdrColor = finalColor * 3.0 * bloomMultiplier;
                    
                    gl_FragColor = vec4(hdrColor, uOpacity * fogAlpha);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
    }, []);

    useFrame((_, delta) => {
        if (!linesRef.current) return;

        const playerPos = camera.position;
        const time = clock.getElapsedTime();

        const { u: centerU, v: centerV } = getWorldToGrid(playerPos.x, playerPos.z);
        const snappedPos = getNodeWorldPosition(centerU, centerV);

        const targetMajor = isMajor === true ? 1.0 : 0.0;
        const isNeutral = (isMajor === null || isMajor === undefined);
        const targetNeutral = isNeutral ? 1.0 : 0.0;

        const lerpSpeed = 1.8;
        smoothMajorRef.current = THREE.MathUtils.lerp(smoothMajorRef.current, targetMajor, delta * lerpSpeed);
        smoothNeutralRef.current = THREE.MathUtils.lerp(smoothNeutralRef.current, targetNeutral, delta * lerpSpeed);

        const uniforms = shaderMaterial.uniforms;
        uniforms.uTime.value = time;
        uniforms.uWaveAmplitude.value = waveConfig.waveAmplitude;
        uniforms.uWaveFrequency.value = waveConfig.waveFrequency;
        uniforms.uWaveSpeed.value = waveConfig.waveSpeed;

        const ws = AudioMetrics.waveState;
        uniforms.uWaveActive.value = ws.active ? 1 : 0;
        uniforms.uWaveProgress.value = ws.progress;
        uniforms.uWaveAngle.value = ws.angle;
        uniforms.uWaveIsStrong.value = ws.isStrong ? 1 : 0;
        uniforms.uPlayerWorldPos.value.copy(playerPos);

        uniforms.uPlayerPos.value.copy(playerPos);
        uniforms.uGridOffset.value.set(snappedPos.x, 0, snappedPos.z);

        uniforms.uOpacity.value = edgeOpacity;
        uniforms.uBloomStartRadius.value = edgeBloomStart;
        uniforms.uBloomFadeLength.value = edgeBloomFade;
        uniforms.uBloomIntensity.value = edgeBloomIntensity;
        uniforms.uColorStartRadius.value = edgeColorStart;
        uniforms.uColorFadeLength.value = edgeColorFade;

        uniforms.uMajorColor.value.set(edgeMajorBloomColor.slice(0, 7));
        uniforms.uMinorColor.value.set(edgeMinorBloomColor.slice(0, 7));
        uniforms.uNeutralColor.value.set(edgeNeutralBloomColor.slice(0, 7));
        uniforms.uSmoothMajor.value = smoothMajorRef.current;
        uniforms.uSmoothNeutral.value = smoothNeutralRef.current;
        uniforms.uFogFar.value = 200.0;
    });

    return (
        <lineSegments ref={linesRef} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={TOTAL_EDGES * 2}
                    array={positionBuffer}
                    itemSize={3}
                    args={[positionBuffer, 3]}
                />
            </bufferGeometry>
            <primitive object={shaderMaterial} attach="material" />
        </lineSegments>
    );
}
