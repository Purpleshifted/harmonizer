'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useControls } from 'leva';
import { getNodeWorldPosition } from '../../../../lib/tonnetz-grid';

const VIEW_RADIUS = 100;
import { useWaveConfig } from '../core/WaveSystem';
import { getInitialValue } from '../core/Persistence';
import { COMMON_UNIFORMS, COLOR_UNIFORMS } from '../shaders/visual_common.glsl';

interface AmbienceParticlesProps {
    isMajor: boolean | null;
}

export function AmbienceParticles({ isMajor }: AmbienceParticlesProps) {
    const { camera, clock } = useThree();
    const pointsRef = useRef<THREE.Points>(null);

    // Smooth transitions
    const smoothMajorRef = useRef(0);
    const smoothNeutralRef = useRef(1.0);

    const {
        dustCount,
        dustSize,
        dustOpacity,
        dustSpeed,
        dustHeight,
        dustSizeJitter,
        dustHueJitter,
        dustOpacityJitter,
        dustMajorBloomColor,
        dustMinorBloomColor,
        dustNeutralBloomColor,
    } = useControls('Ambience', {
        dustCount: { value: getInitialValue('dustCount', 800), min: 200, max: 10000 },
        dustSize: { value: getInitialValue('dustSize', 0.5), min: 0.01, max: 1.0 },
        dustOpacity: { value: getInitialValue('dustOpacity', 0.6), min: 0, max: 1 },
        dustSpeed: { value: getInitialValue('dustSpeed', 0.3), min: 0, max: 2 },
        dustHeight: { value: getInitialValue('dustHeight', 80), min: 20, max: 200, label: '↕ Height Spread' },
        dustSizeJitter: { value: getInitialValue('dustSizeJitter', 0.6), min: 0, max: 1, label: '🎲 Size Jitter' },
        dustHueJitter: { value: getInitialValue('dustHueJitter', 0.1), min: 0, max: 1, label: '🎲 Hue Jitter' },
        dustOpacityJitter: { value: getInitialValue('dustOpacityJitter', 0.5), min: 0, max: 1, label: '🎲 Opacity Jitter' },
        dustMajorBloomColor: { value: getInitialValue('dustMajorBloomColor', '#e8c36eff'), label: 'Major Color' },
        dustMinorBloomColor: { value: getInitialValue('dustMinorBloomColor', '#71acecff'), label: 'Minor Color' },
        dustNeutralBloomColor: { value: getInitialValue('dustNeutralBloomColor', '#ececece8'), label: 'Neutral Color' },
    });

    // 1. Static Random Buffer (Split for easier attribute mapping)
    const { positions, randoms } = useMemo(() => {
        const pos = new Float32Array(dustCount * 3);
        const rand = new Float32Array(dustCount);
        const boxSize = VIEW_RADIUS * 2.5;

        for (let i = 0; i < dustCount; i++) {
            const i3 = i * 3;
            pos[i3] = (Math.random() - 0.5) * boxSize;
            pos[i3 + 1] = (Math.random() - 0.5) * dustHeight;
            pos[i3 + 2] = (Math.random() - 0.5) * boxSize;
            rand[i] = Math.random();
        }
        return { positions: pos, randoms: rand };
    }, [dustCount, dustHeight]);

    // Shader Material
    const dustMaterial = useMemo(() => new THREE.ShaderMaterial({
        uniforms: {
            ...COMMON_UNIFORMS(),
            ...COLOR_UNIFORMS(),
            uBoxSize: { value: VIEW_RADIUS * 2.5 },
            uHeight: { value: 80.0 },
            uSize: { value: 0.5 },
            uOpacity: { value: 0.6 },
            uSpeed: { value: 0.3 },
            uSizeJitter: { value: 0.6 },
            uHueJitter: { value: 0.3 },
            uOpacityJitter: { value: 0.5 },
        },
        vertexShader: `
            uniform float uTime;
            uniform vec3 uPlayerPos;
            uniform float uBoxSize;
            uniform float uHeight;
            uniform float uSize;
            uniform float uSpeed;
            uniform float uSizeJitter;
            
            attribute float aRandom;
            varying float vAlpha;
            varying float vRandom;
            
            void main() {
                vec3 basePos = position;
                vec3 relativePos = basePos - uPlayerPos;
                
                relativePos.x = mod(relativePos.x, uBoxSize) - uBoxSize * 0.5;
                relativePos.y = mod(relativePos.y + uHeight * 0.5, uHeight) - uHeight * 0.5;
                relativePos.z = mod(relativePos.z, uBoxSize) - uBoxSize * 0.5;
                
                vec3 finalPos = relativePos + uPlayerPos;
                
                float t = uTime * uSpeed;
                float noiseX = sin(t * 1.1 + aRandom * 20.0) + sin(t * 0.4 + aRandom * 15.0);
                float noiseY = sin(t * 1.3 + aRandom * 18.0) + cos(t * 0.6 + aRandom * 12.0);
                float noiseZ = cos(t * 1.2 + aRandom * 22.0) + sin(t * 0.5 + aRandom * 10.0);
                
                finalPos += vec3(noiseX, noiseY, noiseZ) * 2.0;

                float dist = distance(finalPos, uPlayerPos);
                float distNorm = dist / (uBoxSize * 0.5);
                vAlpha = 1.0 - smoothstep(0.7, 1.0, distNorm);
                
                // Pass random to fragment for jitter
                vRandom = aRandom;
                
                vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
                
                // Size jitter: derive per-particle size variation
                float sizeRand = fract(aRandom * 13.37);
                float sizeMultiplier = mix(1.0 - uSizeJitter, 1.0 + uSizeJitter, sizeRand);
                
                gl_PointSize = uSize * sizeMultiplier * (300.0 / -mvPosition.z) * (0.5 + aRandom);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uMajorColor;
            uniform vec3 uMinorColor;
            uniform vec3 uNeutralColor;
            uniform float uSmoothMajor;
            uniform float uSmoothNeutral;
            uniform float uOpacity;
            uniform float uHueJitter;
            uniform float uOpacityJitter;
            varying float vAlpha;
            varying float vRandom;
            
            // Attempt hue rotation on RGB
            vec3 hueShift(vec3 color, float shift) {
                float cosA = cos(shift);
                float sinA = sin(shift);
                vec3 result;
                result.r = color.r * (0.299 + 0.701 * cosA + 0.168 * sinA)
                         + color.g * (0.587 - 0.587 * cosA + 0.330 * sinA)
                         + color.b * (0.114 - 0.114 * cosA - 0.497 * sinA);
                result.g = color.r * (0.299 - 0.299 * cosA - 0.328 * sinA)
                         + color.g * (0.587 + 0.413 * cosA + 0.035 * sinA)
                         + color.b * (0.114 - 0.114 * cosA + 0.292 * sinA);
                result.b = color.r * (0.299 - 0.300 * cosA + 1.250 * sinA)
                         + color.g * (0.587 - 0.588 * cosA - 1.050 * sinA)
                         + color.b * (0.114 + 0.886 * cosA - 0.203 * sinA);
                return result;
            }
            
            void main() {
                vec2 coord = gl_PointCoord - vec2(0.5);
                float dist = length(coord);
                if (dist > 0.5) discard;
                
                float shape = 1.0 - smoothstep(0.3, 0.5, dist);
                
                // Base color
                vec3 activeColor = mix(uMinorColor, uMajorColor, uSmoothMajor);
                vec3 finalColor = mix(activeColor, uNeutralColor, uSmoothNeutral);
                
                // Hue jitter: per-particle hue rotation
                float hueRand = fract(vRandom * 7.91);
                float hueAngle = (hueRand - 0.5) * uHueJitter * 3.14159;
                finalColor = hueShift(finalColor, hueAngle);
                
                // Opacity jitter: per-particle transparency variation
                float opacityRand = fract(vRandom * 23.45);
                float opacityMultiplier = mix(1.0 - uOpacityJitter, 1.0, opacityRand);
                
                vec3 hdrColor = finalColor * 10.0;
                
                gl_FragColor = vec4(hdrColor, uOpacity * vAlpha * shape * opacityMultiplier);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    }), []);

    useFrame((_, delta) => {
        const playerPos = camera.position;

        const targetMajor = isMajor === true ? 1.0 : 0.0;
        const isNeutral = (isMajor === null || isMajor === undefined);
        const targetNeutral = isNeutral ? 1.0 : 0.0;

        smoothMajorRef.current = THREE.MathUtils.lerp(smoothMajorRef.current, targetMajor, delta * 1.2);
        smoothNeutralRef.current = THREE.MathUtils.lerp(smoothNeutralRef.current, targetNeutral, delta * 1.2);

        const dm = dustMaterial;
        dm.uniforms.uTime.value = clock.getElapsedTime();
        dm.uniforms.uPlayerPos.value.copy(playerPos);
        dm.uniforms.uSpeed.value = dustSpeed;
        dm.uniforms.uSize.value = dustSize;
        dm.uniforms.uOpacity.value = dustOpacity;
        dm.uniforms.uHeight.value = dustHeight;
        dm.uniforms.uSizeJitter.value = dustSizeJitter;
        dm.uniforms.uHueJitter.value = dustHueJitter;
        dm.uniforms.uOpacityJitter.value = dustOpacityJitter;

        dm.uniforms.uMajorColor.value.set(dustMajorBloomColor);
        dm.uniforms.uMinorColor.value.set(dustMinorBloomColor);
        dm.uniforms.uNeutralColor.value.set(dustNeutralBloomColor);
        dm.uniforms.uSmoothMajor.value = smoothMajorRef.current;
        dm.uniforms.uSmoothNeutral.value = smoothNeutralRef.current;
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={dustCount}
                    array={positions}
                    itemSize={3}
                    args={[positions, 3]}
                />
                <bufferAttribute
                    attach="attributes-aRandom"
                    count={dustCount}
                    array={randoms}
                    itemSize={1}
                    args={[randoms, 1]}
                />
            </bufferGeometry>
            <primitive object={dustMaterial} attach="material" />
        </points>
    );
}
