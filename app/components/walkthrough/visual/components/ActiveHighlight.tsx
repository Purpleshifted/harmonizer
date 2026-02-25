'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useControls } from 'leva';
import { type NodeCandidate } from '../../shared/hooks/useSpatialDetection';
import { getAdjacentNodes, getNodeWorldPosition } from '../../../../lib/tonnetz/tonnetz-grid';
import { getInitialValue } from '../core/Persistence';
import { useWaveConfigContext, getWaveHeight } from '../core/WaveSystem';
import { WAVE_UNIFORMS, WAVE_VERTEX_CHUNK } from '../shaders/wave.glsl';
import { AudioMetrics } from '../../../../lib/audio/AudioMetrics';

interface ActiveHighlightProps {
    mode: 'node' | 'edge' | 'face';
    activeNodes: NodeCandidate[];
    isMajor: boolean | null;
}

const MAX_SPRITES = 7;
const MAX_LINE_VERTS = 6;
const TEXTURE_SIZE = 256;

/**
 * Generate a soft radial gaussian glow texture via Canvas.
 * The center is white, fading to fully transparent at the edges.
 * This ensures NO hard edges whatsoever.
 */
function createGlowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = TEXTURE_SIZE;
    canvas.height = TEXTURE_SIZE;
    const ctx = canvas.getContext('2d')!;

    const center = TEXTURE_SIZE / 2;

    // Radial gradient: white center → transparent edge
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
    gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.15, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.4)');
    gradient.addColorStop(0.55, 'rgba(255, 255, 255, 0.15)');
    gradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.04)');
    gradient.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

interface SpriteSlot {
    targetPos: THREE.Vector3;
    currentPos: THREE.Vector3;
    targetOpacity: number;
    currentOpacity: number;
    targetScale: number;
    currentScale: number;
}

export function ActiveHighlight({ mode, activeNodes, isMajor }: ActiveHighlightProps) {
    const { clock, camera } = useThree();
    const waveConfig = useWaveConfigContext();

    const groupRef = useRef<THREE.Group>(null);
    const lineRef = useRef<THREE.LineSegments>(null);
    const faceRef = useRef<THREE.Mesh>(null);

    // Smooth color
    const smoothMajorRef = useRef(0);
    const smoothNeutralRef = useRef(1.0);

    // Per-slot smooth state
    const slotsRef = useRef<SpriteSlot[]>(
        Array.from({ length: MAX_SPRITES }, () => ({
            targetPos: new THREE.Vector3(0, -500, 0),
            currentPos: new THREE.Vector3(0, -500, 0),
            targetOpacity: 0,
            currentOpacity: 0,
            targetScale: 0,
            currentScale: 0,
        }))
    );

    // Line/face opacity
    const lineFaceOpacityRef = useRef(0);

    const {
        hlSphereSize,
        hlSphereGlow,
        hlLineGlow,
        hlFaceGlow,
        hlFaceOpacity,
        hlPulseSpeed,
        hlFadeSpeed,
        hlMajorColor,
        hlMinorColor,
        hlNeutralColor,
    } = useControls('Active Highlight', {
        hlSphereSize: { value: getInitialValue('hlSphereSize', 2.0), min: 0.3, max: 8.0, label: 'Glow Size' },
        hlSphereGlow: { value: getInitialValue('hlSphereGlow', 1.2), min: 0.5, max: 5.0, label: 'Glow HDR' },
        hlLineGlow: { value: getInitialValue('hlLineGlow', 15.0), min: 1, max: 20, label: 'Edge Glow' },
        hlFaceGlow: { value: getInitialValue('hlFaceGlow', 3.0), min: 1, max: 15, label: 'Face Glow' },
        hlFaceOpacity: { value: getInitialValue('hlFaceOpacity', 0.02), min: 0, max: 0.1, label: 'Face Opacity' },
        hlPulseSpeed: { value: getInitialValue('hlPulseSpeed', 2.0), min: 0.5, max: 8, label: 'Pulse Speed' },
        hlFadeSpeed: { value: getInitialValue('hlFadeSpeed', 4.0), min: 1, max: 10, label: 'Fade Speed' },
        hlMajorColor: { value: getInitialValue('hlMajorColor', '#dac175'), label: 'Major' },
        hlMinorColor: { value: getInitialValue('hlMinorColor', '#6e91d6'), label: 'Minor' },
        hlNeutralColor: { value: getInitialValue('hlNeutralColor', '#dbd5d5'), label: 'Neutral' },
    });

    // Glow texture (generated once)
    const glowTexture = useMemo(() => createGlowTexture(), []);

    // Create sprite materials (one per slot for independent color/opacity)
    const spriteMaterials = useMemo(() =>
        Array.from({ length: MAX_SPRITES }, () =>
            new THREE.SpriteMaterial({
                map: glowTexture,
                color: new THREE.Color('#ffffff'),
                transparent: true,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                opacity: 0,
            })
        ),
        [glowTexture]);

    // Create sprite objects
    const sprites = useMemo(() =>
        spriteMaterials.map(mat => {
            const sprite = new THREE.Sprite(mat);
            sprite.visible = false;
            return sprite;
        }),
        [spriteMaterials]);

    // Edge line material
    const lineMat = useMemo(() => new THREE.ShaderMaterial({
        uniforms: {
            ...WAVE_UNIFORMS,
            uTime: { value: 0 },
            uColor: { value: new THREE.Color('#ffffff') },
            uGlow: { value: 5.0 },
            uAlpha: { value: 0.0 },
        },
        vertexShader: `
            ${WAVE_VERTEX_CHUNK}
            void main() {
                vec3 pos = applyWave(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uGlow;
            uniform float uAlpha;
            void main() {
                gl_FragColor = vec4(uColor * uGlow, uAlpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    }), []);

    // Face fill material
    const faceMat = useMemo(() => new THREE.ShaderMaterial({
        uniforms: {
            ...WAVE_UNIFORMS,
            uTime: { value: 0 },
            uColor: { value: new THREE.Color('#ffffff') },
            uGlow: { value: 4.0 },
            uAlpha: { value: 0.0 },
        },
        vertexShader: `
            ${WAVE_VERTEX_CHUNK}
            void main() {
                vec3 pos = applyWave(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uGlow;
            uniform float uAlpha;
            void main() {
                gl_FragColor = vec4(uColor * uGlow, uAlpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
    }), []);

    // Pre-allocate line/face geometries
    const lineGeo = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LINE_VERTS * 3), 3));
        geo.setDrawRange(0, 0);
        return geo;
    }, []);

    const faceGeo = useMemo(() => {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
        geo.setDrawRange(0, 0);
        return geo;
    }, []);

    useFrame((_, delta) => {
        const time = clock.getElapsedTime();
        const fadeRate = hlFadeSpeed * delta;

        // --- Color ---
        const targetMajor = isMajor === true ? 1.0 : 0.0;
        const isNeutralMode = mode === 'node' || mode === 'edge';
        const targetNeutral = isNeutralMode ? 0.6 : 0.0;
        const lerpSpeed = 2.5;
        smoothMajorRef.current = THREE.MathUtils.lerp(smoothMajorRef.current, targetMajor, delta * lerpSpeed);
        smoothNeutralRef.current = THREE.MathUtils.lerp(smoothNeutralRef.current, targetNeutral, delta * lerpSpeed);

        const majorCol = new THREE.Color(hlMajorColor.slice(0, 7));
        const minorCol = new THREE.Color(hlMinorColor.slice(0, 7));
        const neutralCol = new THREE.Color(hlNeutralColor.slice(0, 7));
        const modeColor = new THREE.Color().lerpColors(minorCol, majorCol, smoothMajorRef.current);
        const finalColor = new THREE.Color().lerpColors(modeColor, neutralCol, smoothNeutralRef.current);

        // HDR: scale the color beyond 1.0 for bloom pipeline
        const hdrColor = finalColor.clone().multiplyScalar(hlSphereGlow);

        // --- Determine sprite targets ---
        let spriteTargets: { pos: THREE.Vector3; pulse: number }[] = [];
        if (mode === 'node' && activeNodes.length >= 1) {
            spriteTargets.push({ pos: activeNodes[0].pos, pulse: 0.5 + Math.sin(time * hlPulseSpeed) * 0.5 });

            const lastTrigger = AudioMetrics.lastNodeTrigger;
            // time is elapsed react-three-fiber time, but AudioContext time could be different.
            // Using system time safely guarantees matching coordinate space with the trigger time.
            const now = performance.now() / 1000;
            const timeSinceTrigger = now - lastTrigger.time;

            const adj = getAdjacentNodes(activeNodes[0].u, activeNodes[0].v);
            adj.forEach(({ u, v }, i) => {
                const nodePos = getNodeWorldPosition(u, v);
                let hitPulse = 0;

                // If recently played (within 0.35s) and position matches roughly
                if (Math.abs(nodePos.x - lastTrigger.pos.x) < 0.1 &&
                    Math.abs(nodePos.z - lastTrigger.pos.z) < 0.1 &&
                    timeSinceTrigger >= 0 && timeSinceTrigger < 0.35) {

                    hitPulse = Math.max(0, 1.0 - (timeSinceTrigger / 0.35)) * 4.0; // bright flash
                }

                // Subtle rotation background
                const phase = i / 6;
                const cyclePos = (time * hlPulseSpeed * 0.3) % 1;
                const diff = Math.abs(cyclePos - phase);
                const ambientPulse = Math.max(0, 1 - Math.min(diff, 1 - diff) * 6) * 0.3;

                spriteTargets.push({ pos: nodePos, pulse: Math.max(ambientPulse, hitPulse) });
            });
        } else if (mode === 'edge' && activeNodes.length >= 2) {
            const p = 0.5 + Math.sin(time * hlPulseSpeed) * 0.5;
            spriteTargets.push({ pos: activeNodes[0].pos, pulse: p }, { pos: activeNodes[1].pos, pulse: p });
        } else if (mode === 'face' && activeNodes.length >= 3) {
            for (let i = 0; i < 3; i++) {
                spriteTargets.push({ pos: activeNodes[i].pos, pulse: 0.5 + Math.sin(time * hlPulseSpeed + i * 2.1) * 0.5 });
            }
        }

        // --- Update sprites with smooth transitions ---
        const slots = slotsRef.current;
        for (let i = 0; i < MAX_SPRITES; i++) {
            const slot = slots[i];
            const sprite = sprites[i];
            const mat = spriteMaterials[i];

            if (i < spriteTargets.length) {
                // Snap position immediately — no sliding
                slot.targetPos.copy(spriteTargets[i].pos);
                slot.currentPos.copy(spriteTargets[i].pos);
                slot.targetOpacity = 0.5 + spriteTargets[i].pulse * 0.5;
                slot.targetScale = hlSphereSize * (0.7 + spriteTargets[i].pulse * 0.3);
            } else {
                // Fading out: keep currentPos at last known location
                slot.targetOpacity = 0;
                slot.targetScale = 0;
            }

            // Smooth lerp for opacity/scale only
            slot.currentOpacity = THREE.MathUtils.lerp(slot.currentOpacity, slot.targetOpacity, fadeRate);
            slot.currentScale = THREE.MathUtils.lerp(slot.currentScale, slot.targetScale, fadeRate);

            if (slot.currentOpacity < 0.005) {
                sprite.visible = false;
            } else {
                sprite.visible = true;

                // Apply wave height to Y position
                const waveY = getWaveHeight(
                    slot.currentPos.x,
                    slot.currentPos.z,
                    time,
                    waveConfig.waveAmplitude,
                    waveConfig.waveFrequency,
                    waveConfig.waveSpeed
                );
                sprite.position.set(slot.currentPos.x, waveY, slot.currentPos.z);
                sprite.scale.setScalar(slot.currentScale);

                // HDR color + opacity
                mat.color.copy(hdrColor);
                mat.opacity = slot.currentOpacity;
            }
        }

        // --- LINES ---
        const hasLines = mode === 'edge' || mode === 'face';
        lineFaceOpacityRef.current = THREE.MathUtils.lerp(lineFaceOpacityRef.current, hasLines ? 0.8 : 0, fadeRate);
        if (lineRef.current) {
            const posAttr = lineGeo.getAttribute('position') as THREE.BufferAttribute;
            let vertCount = 0;
            if (mode === 'edge' && activeNodes.length >= 2) {
                posAttr.setXYZ(0, activeNodes[0].pos.x, 0.01, activeNodes[0].pos.z);
                posAttr.setXYZ(1, activeNodes[1].pos.x, 0.01, activeNodes[1].pos.z);
                vertCount = 2;
            } else if (mode === 'face' && activeNodes.length >= 3) {
                for (let i = 0; i < 3; i++) {
                    const a = activeNodes[i], b = activeNodes[(i + 1) % 3];
                    posAttr.setXYZ(i * 2, a.pos.x, 0.01, a.pos.z);
                    posAttr.setXYZ(i * 2 + 1, b.pos.x, 0.01, b.pos.z);
                }
                vertCount = 6;
            }
            posAttr.needsUpdate = true;
            lineGeo.setDrawRange(0, vertCount);
            lineMat.uniforms.uTime.value = time;
            lineMat.uniforms.uColor.value.copy(finalColor);
            lineMat.uniforms.uGlow.value = hlLineGlow;
            lineMat.uniforms.uAlpha.value = lineFaceOpacityRef.current;
            lineMat.uniforms.uWaveAmplitude.value = waveConfig.waveAmplitude;
            lineMat.uniforms.uWaveFrequency.value = waveConfig.waveFrequency;
            lineMat.uniforms.uWaveSpeed.value = waveConfig.waveSpeed;

            const ws = AudioMetrics.waveState;
            lineMat.uniforms.uWaveActive.value = ws.active ? 1 : 0;
            lineMat.uniforms.uWaveProgress.value = ws.progress;
            lineMat.uniforms.uWaveAngle.value = ws.angle;
            lineMat.uniforms.uWaveIsStrong.value = ws.isStrong ? 1 : 0;
            lineMat.uniforms.uPlayerWorldPos.value.copy(camera.position);
        }

        // --- FACE ---
        if (faceRef.current) {
            const posAttr = faceGeo.getAttribute('position') as THREE.BufferAttribute;
            if (mode === 'face' && activeNodes.length >= 3) {
                for (let i = 0; i < 3; i++) posAttr.setXYZ(i, activeNodes[i].pos.x, 0.02, activeNodes[i].pos.z);
                posAttr.needsUpdate = true;
                faceGeo.setDrawRange(0, 3);
            } else {
                faceGeo.setDrawRange(0, 0);
            }
            faceMat.uniforms.uTime.value = time;
            faceMat.uniforms.uColor.value.copy(finalColor);
            faceMat.uniforms.uGlow.value = hlFaceGlow;
            faceMat.uniforms.uAlpha.value = hlFaceOpacity * lineFaceOpacityRef.current;
            faceMat.uniforms.uWaveAmplitude.value = waveConfig.waveAmplitude;
            faceMat.uniforms.uWaveFrequency.value = waveConfig.waveFrequency;
            faceMat.uniforms.uWaveSpeed.value = waveConfig.waveSpeed;

            const ws = AudioMetrics.waveState;
            faceMat.uniforms.uWaveActive.value = ws.active ? 1 : 0;
            faceMat.uniforms.uWaveProgress.value = ws.progress;
            faceMat.uniforms.uWaveAngle.value = ws.angle;
            faceMat.uniforms.uWaveIsStrong.value = ws.isStrong ? 1 : 0;
            faceMat.uniforms.uPlayerWorldPos.value.copy(camera.position);
        }
    });

    return (
        <group ref={groupRef}>
            {/* Soft glow sprites — no hard edges, perfect gaussian falloff */}
            {sprites.map((sprite, i) => (
                <primitive key={i} object={sprite} />
            ))}

            {/* Edge lines */}
            <lineSegments ref={lineRef} geometry={lineGeo} material={lineMat} frustumCulled={false} />

            {/* Face triangle */}
            <mesh ref={faceRef} geometry={faceGeo} material={faceMat} frustumCulled={false} />
        </group>
    );
}
