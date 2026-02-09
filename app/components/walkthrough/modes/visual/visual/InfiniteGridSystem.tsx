'use client';

import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useControls } from 'leva';
import {
    getWorldToGrid,
    getNodeWorldPosition,
    getNodeIndex,
    VIEW_RADIUS,
    GRID_SIZE,
    TOTAL_INSTANCES,
    SPACING,
} from '../utils/tonnetzMath';
import { useSpatialDetection, DetectionResult } from '../hooks/useSpatialDetection';

interface InfiniteGridSystemProps {
    setLocationInfo: (info: string, type: string) => void;
    onDetectionUpdate?: (result: DetectionResult) => void;
    detectionRef?: React.MutableRefObject<DetectionResult | null>;
}

export function InfiniteGridSystem({ setLocationInfo, onDetectionUpdate, detectionRef }: InfiniteGridSystemProps) {
    const { camera } = useThree();
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const lastGridPos = useRef({ u: 99999, v: 99999 });

    const nodeEmissiveArray = useMemo(() => new Float32Array(TOTAL_INSTANCES).fill(0.3), []);
    const prevActiveIndices = useRef<number[]>([]);

    const sphereGeo = useMemo(() => new THREE.SphereGeometry(0.15, 16, 16), []);

    // Leva Controls
    const {
        baseColor,
        baseEmissive,
        activeEmissive,
        waveSpeed,
        waveScale
    } = useControls('Infinite Grid', {
        baseColor: { value: '#ffffff', label: 'Grid Color' },
        baseEmissive: { value: 0.3, min: 0, max: 2.0, label: 'Base Glow' },
        activeEmissive: { value: 2.5, min: 1.0, max: 5.0, label: 'Active Glow' },
        waveSpeed: { value: 1.0, min: 0, max: 5.0 },
        waveScale: { value: 0.5, min: 0, max: 2.0 },
    });

    useEffect(() => {
        if (!meshRef.current) return;

        const nodeEmissiveAttr = new THREE.InstancedBufferAttribute(nodeEmissiveArray, 1);
        meshRef.current.geometry.setAttribute('instanceEmissive', nodeEmissiveAttr);

        for (let i = 0; i < TOTAL_INSTANCES; i++) {
            dummy.position.set(0, -100, 0);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [dummy, nodeEmissiveArray]);

    const lastCameraPos = useRef(new THREE.Vector3());

    // Unified Spatial Detection Hook
    const internalDetectionRef = useSpatialDetection({
        onDetectionUpdate: (res) => {
            if (onDetectionUpdate) onDetectionUpdate(res);
            setLocationInfo(res.displayInfo, res.displayType);
        }
    });

    useFrame(({ clock }) => {
        if (!meshRef.current || !materialRef.current) return;
        const playerPos = camera.position;

        // Force update uniforms for wave effect even if stationary?
        // Actually we need time for wave.
        if (materialRef.current.userData.shader) {
            materialRef.current.userData.shader.uniforms.uTime.value = clock.getElapsedTime();
            materialRef.current.userData.shader.uniforms.uWaveSpeed.value = waveSpeed;
            materialRef.current.userData.shader.uniforms.uWaveScale.value = waveScale;
            materialRef.current.userData.shader.uniforms.uPlayerPos.value.copy(playerPos);
        }

        // Layer 1 Optimization: Skip grid position update if camera hasn't moved significantly
        if (playerPos.distanceToSquared(lastCameraPos.current) > 0.0001) {
            lastCameraPos.current.copy(playerPos);

            const { u: centerU, v: centerV } = getWorldToGrid(playerPos.x, playerPos.z);

            // Update grid positions when player moves to new cell
            if (centerU !== lastGridPos.current.u || centerV !== lastGridPos.current.v) {
                lastGridPos.current = { u: centerU, v: centerV };

                let i = 0;
                const startU = centerU - VIEW_RADIUS;
                const startV = centerV - VIEW_RADIUS;

                for (let dv = 0; dv < GRID_SIZE; dv++) {
                    for (let du = 0; du < GRID_SIZE; du++) {
                        const u = startU + du;
                        const v = startV + dv;
                        const pos = getNodeWorldPosition(u, v);

                        dummy.position.copy(pos);
                        dummy.scale.set(1, 1, 1);
                        dummy.rotation.set(0, 0, 0);
                        dummy.updateMatrix();
                        meshRef.current.setMatrixAt(i, dummy.matrix);
                        nodeEmissiveArray[i] = baseEmissive;
                        i++;
                    }
                }
                meshRef.current.instanceMatrix.needsUpdate = true;
            }
        }

        // Grid-specific visual updates (node emission)
        const detection = internalDetectionRef.current;
        if (detection && detection.isStructureChanged) {
            // Find current active node indices for precise highlighting
            const activeNodeIndices: number[] = [];
            detection.activeNodes.forEach(node => {
                const idx = getNodeIndex(node.u, node.v, lastGridPos.current.u, lastGridPos.current.v);
                if (idx >= 0) activeNodeIndices.push(idx);
            });

            // Revert previously active nodes
            for (const idx of prevActiveIndices.current) {
                if (idx < nodeEmissiveArray.length) nodeEmissiveArray[idx] = baseEmissive;
            }

            // Highlight new active nodes
            for (const idx of activeNodeIndices) {
                if (idx >= 0 && idx < nodeEmissiveArray.length) {
                    nodeEmissiveArray[idx] = activeEmissive;
                }
            }
            prevActiveIndices.current = activeNodeIndices;

            const nodeEmissiveAttr = meshRef.current.geometry.getAttribute('instanceEmissive') as THREE.InstancedBufferAttribute;
            if (nodeEmissiveAttr) nodeEmissiveAttr.needsUpdate = true;
        }

        // Sync to parent detectionRef for Audio (Fast Path)
        if (detectionRef && detection) {
            detectionRef.current = detection;
        }
    });

    const patchEmissiveMaterial = (shader: any) => {
        shader.uniforms.uPlayerPos = { value: new THREE.Vector3() };
        shader.uniforms.uTime = { value: 0 };
        shader.uniforms.uWaveSpeed = { value: 1.0 };
        shader.uniforms.uWaveScale = { value: 0.5 };

        shader.vertexShader = `
            attribute float instanceEmissive;
            varying float vInstanceEmissive;
            varying float vDist;
            uniform vec3 uPlayerPos;
            uniform float uTime;
            uniform float uWaveSpeed;
            uniform float uWaveScale;
            ${shader.vertexShader}
        `.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
            float dist = distance(worldPosition.xyz, uPlayerPos);
            vDist = dist;
            vInstanceEmissive = instanceEmissive;
            
            // Simple wave effect
            float wave = sin(worldPosition.x * 0.1 + uTime * uWaveSpeed) * cos(worldPosition.z * 0.1 + uTime * uWaveSpeed) * uWaveScale;
            transformed.y += wave;

            float normDist = clamp(dist / 50.0, 0.0, 1.0);
            float scale = mix(1.5, 0.5, normDist);
            transformed *= scale;
            `
        );

        shader.fragmentShader = `
            varying float vInstanceEmissive;
            varying float vDist;
            ${shader.fragmentShader}
        `.replace(
            '#include <emissivemap_fragment>',
            `
            #include <emissivemap_fragment>
            totalEmissiveRadiance *= vInstanceEmissive;
            `
        );
    };

    return (
        <instancedMesh ref={meshRef} args={[sphereGeo, undefined, TOTAL_INSTANCES]} frustumCulled={false}>
            <meshStandardMaterial
                ref={materialRef}
                color={baseColor}
                emissive={baseColor}
                emissiveIntensity={1}
                toneMapped={false}
                onBeforeCompile={(shader) => {
                    materialRef.current!.userData.shader = shader;
                    patchEmissiveMaterial(shader);
                }}
            />
        </instancedMesh>
    );
}
