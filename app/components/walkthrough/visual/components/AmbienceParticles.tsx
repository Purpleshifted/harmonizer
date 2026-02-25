'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useControls } from 'leva';
import { getNodeWorldPosition } from '../../../../lib/tonnetz/tonnetz-grid';

const VIEW_RADIUS = 100;
import { useWaveConfig } from '../core/WaveSystem';
import { getInitialValue } from '../core/Persistence';
import { COMMON_UNIFORMS, COLOR_UNIFORMS } from '../shaders/visual_common.glsl';
import { WAVE_UNIFORMS, WAVE_VERTEX_CHUNK } from '../shaders/wave.glsl';
import { AudioMetrics } from '../../../../lib/audio/AudioMetrics';

interface AmbienceParticlesProps {
    isMajor: boolean | null;
    mode?: string;
}

export function AmbienceParticles({ isMajor, mode }: AmbienceParticlesProps) {
    const { camera, clock } = useThree();
    const pointsRef = useRef<THREE.Points>(null);

    // Smooth transitions
    const smoothMajorRef = useRef(0);
    const smoothNeutralRef = useRef(1.0);
    const smoothNodeFactorRef = useRef(0.0);
    const accumulatedRotationRef = useRef(0.0);

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
        dustCount: { value: getInitialValue('dustCount', 300), min: 200, max: 10000 },
        dustSize: { value: getInitialValue('dustSize', 0.25), min: 0.01, max: 1.0 },
        dustOpacity: { value: getInitialValue('dustOpacity', 0.43), min: 0, max: 1 },
        dustSpeed: { value: getInitialValue('dustSpeed', 0.5), min: 0, max: 2 },
        dustHeight: { value: getInitialValue('dustHeight', 55), min: 20, max: 200, label: '↕ Height Spread' },
        dustSizeJitter: { value: getInitialValue('dustSizeJitter', 0.6), min: 0, max: 1, label: '🎲 Size Jitter' },
        dustHueJitter: { value: getInitialValue('dustHueJitter', 0.3), min: 0, max: 1, label: '🎲 Hue Jitter' },
        dustOpacityJitter: { value: getInitialValue('dustOpacityJitter', 0.5), min: 0, max: 1, label: '🎲 Opacity Jitter' },
        dustMajorBloomColor: { value: getInitialValue('dustMajorBloomColor', '#e8c36e'), label: 'Major Color' },
        dustMinorBloomColor: { value: getInitialValue('dustMinorBloomColor', '#71acec'), label: 'Minor Color' },
        dustNeutralBloomColor: { value: getInitialValue('dustNeutralBloomColor', '#ececec'), label: 'Neutral Color' },
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
            ...WAVE_UNIFORMS,
            uBoxSize: { value: VIEW_RADIUS * 2.5 },
            uHeight: { value: 80.0 },
            uSize: { value: 0.5 },
            uOpacity: { value: 0.6 },
            uSpeed: { value: 0.3 },
            uSizeJitter: { value: 0.6 },
            uHueJitter: { value: 0.3 },
            uOpacityJitter: { value: 0.5 },
            uNodeFactor: { value: 0.0 },
            uNodeRotation: { value: 0.0 },
            uAudioLevel: { value: 0.0 },
            uCameraY: { value: 0.0 },
        },
        vertexShader: `
            ${WAVE_VERTEX_CHUNK}
            uniform vec3 uPlayerPos;
            uniform float uBoxSize;
            uniform float uHeight;
            uniform float uSize;
            uniform float uSpeed;
            uniform float uSizeJitter;
            uniform float uNodeFactor;
            uniform float uNodeRotation;
            uniform float uAudioLevel;
            
            attribute float aRandom;
            varying float vAlpha;
            varying float vRandom;
            varying float vAudioLevel;
            
            // NEW UNIFORMS: pass real camera Y
            uniform float uCameraY;

            void main() {
                vec3 basePos = position;
                vec3 relativePos = basePos - uPlayerPos;
                
                relativePos.x = mod(relativePos.x, uBoxSize) - uBoxSize * 0.5;
                relativePos.y = mod(relativePos.y + uHeight * 0.5, uHeight) - uHeight * 0.5;
                relativePos.z = mod(relativePos.z, uBoxSize) - uBoxSize * 0.5;
                
                // Height-based rotation speed multiplier
                // Lower Y = faster spin, higher Y (closer to eye) = slower spin
                // relativePos.y ranges roughly from -uHeight/2 to +uHeight/2
                float heightFactor = 1.0 - smoothstep(0.0, -uHeight * 0.5, relativePos.y); 
                float spinSpeedAdjust = mix(0.2, 1.5, heightFactor);

                // Whirlpool swirling effect for Node mode
                // uNodeRotation smoothly increases ONLY when Node mode is active.
                float angle = uNodeRotation * (0.8 + aRandom * 0.4) * spinSpeedAdjust;
                float c = cos(angle);
                float s = sin(angle);
                
                // Calculate rotated coords
                float rx = relativePos.x * c - relativePos.z * s;
                float rz = relativePos.x * s + relativePos.z * c;

                // Instead of mix(relativePos, rx, uNodeFactor) which rubberbands back on exit,
                // we ALWAYS use the rotated coords. Rotation simply stops increasing when NodeFactor is 0.
                relativePos.x = rx;
                relativePos.z = rz;
                
                vec3 finalPos = relativePos + uPlayerPos;
                
                // Base brownian motion speed
                float t = uTime * uSpeed;
                float noiseX = sin(t * 1.1 + aRandom * 20.0) + sin(t * 0.4 + aRandom * 15.0);
                float noiseY = sin(t * 1.3 + aRandom * 18.0) + cos(t * 0.6 + aRandom * 12.0);
                float noiseZ = cos(t * 1.2 + aRandom * 22.0) + sin(t * 0.5 + aRandom * 10.0);
                
                float dist = distance(finalPos, uPlayerPos);
                
                // Audio reactivity: bump particles outward in random directions
                vec3 bumpDir = normalize(vec3(noiseX, noiseY, noiseZ) + 0.1);
                
                // Audio bump is localized—stronger closer to player, very weak in distance
                // High frequency components are also handled nicely since uAudioLevel is aggregated
                float distJumpFactor = 1.0 - smoothstep(0.0, uBoxSize * 0.5, dist); // Expanded radius
                float audioJump = uAudioLevel * 10.0 * (0.5 + aRandom) * distJumpFactor;
                
                // Get absolute world wave data
                WaveInfo wave = getWaveInfo(finalPos);
                
                // Apply final movements
                finalPos += vec3(noiseX, noiseY, noiseZ) * mix(2.0, 0.5, uNodeFactor);
                finalPos += bumpDir * audioJump * (1.0 - uNodeFactor); // Only bump when NOT in node mode
                
                // Tidal wave sweep! Particles get pulled by the wave's force and gently bob up
                finalPos += wave.sweepForce * (1.0 - uNodeFactor);
                finalPos.y += wave.height * 0.3 * (1.0 - uNodeFactor);
                
                // Re-evaluate dist after bumps
                dist = distance(finalPos, uPlayerPos);
                float distNorm = dist / (uBoxSize * 0.5);
                vAlpha = 1.0 - smoothstep(0.7, 1.0, distNorm);
                
                // Pass variables to fragment shader
                vRandom = aRandom;
                vAudioLevel = uAudioLevel;
                
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
            varying float vAudioLevel;
            uniform float uNodeFactor;
            
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
                
                // Hue jitter & Opacity Jitter is suppressed during Node mode for uniform, clean look
                float currentHueJitter = mix(uHueJitter, 0.0, uNodeFactor);
                float currentOpacityJitter = mix(uOpacityJitter, 0.0, uNodeFactor);
                
                // Hue jitter: per-particle hue rotation
                float hueRand = fract(vRandom * 7.91);
                float hueAngle = (hueRand - 0.5) * currentHueJitter * 3.14159;
                finalColor = hueShift(finalColor, hueAngle);
                
                // Opacity jitter: per-particle transparency variation
                float opacityRand = fract(vRandom * 23.45);
                float opacityMultiplier = mix(1.0 - currentOpacityJitter, 1.0, opacityRand);
                
                vec3 hdrColor = finalColor * 10.0;
                
                // Edge Audio Reactivity - bump bloom brightness ONLY, removed opacity influence
                float bloomBoost = (1.0 + vAudioLevel * 10.0) * (1.0 - uNodeFactor); 
                hdrColor *= mix(1.0, bloomBoost, 1.0 - uNodeFactor); // Only applies when not in node mode
                
                float finalOpacity = uOpacity * vAlpha * shape * opacityMultiplier;
                
                gl_FragColor = vec4(hdrColor, finalOpacity);
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

        // Snappier transition so major/minor is clearly visible; less time in neutral blend
        const lerpSpeed = 3.0;
        smoothMajorRef.current = THREE.MathUtils.lerp(smoothMajorRef.current, targetMajor, delta * lerpSpeed);
        smoothNeutralRef.current = THREE.MathUtils.lerp(smoothNeutralRef.current, targetNeutral, delta * lerpSpeed);

        const targetNodeFactor = mode === 'node' ? 1.0 : 0.0;
        smoothNodeFactorRef.current = THREE.MathUtils.lerp(smoothNodeFactorRef.current, targetNodeFactor, delta * 2.0);

        // Accumulate rotation smoothly only when node factor > 0
        const rotationSpeed = 0.15; // Slowed down from 0.4
        accumulatedRotationRef.current += delta * rotationSpeed * smoothNodeFactorRef.current;

        const dm = dustMaterial;
        dm.uniforms.uTime.value = clock.getElapsedTime();
        dm.uniforms.uPlayerPos.value.copy(playerPos);

        // Pass wave properties to drive the sweeping motion
        // AmbienceParticles does not have it, let's just read from AudioMetrics waveParams
        dm.uniforms.uWaveAmplitude.value = AudioMetrics.waveParams.amplitude;
        dm.uniforms.uWaveFrequency.value = AudioMetrics.waveParams.frequency;
        dm.uniforms.uWaveSpeed.value = AudioMetrics.waveParams.speed;
        dm.uniforms.uAudioWaveProgress.value = AudioMetrics.audioWaveProgress;

        dm.uniforms.uSpeed.value = dustSpeed;
        dm.uniforms.uSize.value = dustSize;
        dm.uniforms.uOpacity.value = dustOpacity;
        dm.uniforms.uHeight.value = dustHeight;
        dm.uniforms.uSizeJitter.value = dustSizeJitter;
        dm.uniforms.uHueJitter.value = dustHueJitter;
        dm.uniforms.uOpacityJitter.value = dustOpacityJitter;
        dm.uniforms.uNodeFactor.value = smoothNodeFactorRef.current;
        dm.uniforms.uNodeRotation.value = accumulatedRotationRef.current;
        dm.uniforms.uCameraY.value = playerPos.y;
        // Edge level smoothing for visuals
        dm.uniforms.uAudioLevel.value = mode === 'edge' ? AudioMetrics.edgeLevel : 0.0;

        dm.uniforms.uMajorColor.value.set(dustMajorBloomColor.slice(0, 7));
        dm.uniforms.uMinorColor.value.set(dustMinorBloomColor.slice(0, 7));
        dm.uniforms.uNeutralColor.value.set(dustNeutralBloomColor.slice(0, 7));
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
