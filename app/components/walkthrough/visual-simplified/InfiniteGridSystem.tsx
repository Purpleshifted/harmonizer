'use client';

import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getTone } from '../../../lib/tonnetz';
import {
    getWorldToGrid,
    getNodeWorldPosition,
    getNearestTriangles,
    getNodeIndex,
    VIEW_RADIUS,
    GRID_SIZE,
    TOTAL_INSTANCES,
    CAMERA_HEIGHT,
    SPACING,
} from '../utils/tonnetzMath';
import { useSpatialDetection, DetectionResult, InteractionMode, NodeCandidate } from '../hooks/useSpatialDetection';

interface InfiniteGridSystemProps {
    setLocationInfo: (info: string, type: string) => void;
    onDetectionUpdate?: (result: DetectionResult) => void;
    detectionRef?: React.MutableRefObject<DetectionResult | null>;
}

/**
 * Main grid system with nodes and spatial detection
 * Manages instanced mesh for nodes and provides detection results
 */
export function InfiniteGridSystem({ setLocationInfo, onDetectionUpdate, detectionRef }: InfiniteGridSystemProps) {
    const { camera } = useThree();
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const lastGridPos = useRef({ u: 99999, v: 99999 });

    const nodeEmissiveArray = useMemo(() => new Float32Array(TOTAL_INSTANCES).fill(0.3), []);
    const prevActiveIndices = useRef<number[]>([]);

    const sphereGeo = useMemo(() => new THREE.SphereGeometry(0.15, 16, 16), []);

    // Threshold constants (Base)
    const SPACING_CONST = SPACING;

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

    useFrame(() => {
        if (!meshRef.current || !materialRef.current) return;
        const playerPos = camera.position;

        // Layer 1 Optimization: Skip if camera hasn't moved significantly
        if (playerPos.distanceToSquared(lastCameraPos.current) < 0.0001) {
            return;
        }
        lastCameraPos.current.copy(playerPos);

        if (materialRef.current.userData.shader) {
            materialRef.current.userData.shader.uniforms.uPlayerPos.value.copy(playerPos);
        }

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
                    nodeEmissiveArray[i] = 0.3;
                    i++;
                }
            }
            meshRef.current.instanceMatrix.needsUpdate = true;
        }

        // Grid-specific visual updates (node emission)
        const detection = internalDetectionRef.current;
        if (detection && detection.isStructureChanged) {
            // Find current active node indices for precise highlighting
            const activeNodeIndices: number[] = [];
            detection.activeNodes.forEach(node => {
                const idx = getNodeIndex(node.u, node.v, centerU, centerV);
                if (idx >= 0) activeNodeIndices.push(idx);
            });

            // Revert previously active nodes
            for (const idx of prevActiveIndices.current) {
                if (idx < nodeEmissiveArray.length) nodeEmissiveArray[idx] = 0.3;
            }

            // Highlight new active nodes
            for (const idx of activeNodeIndices) {
                if (idx >= 0 && idx < nodeEmissiveArray.length) {
                    nodeEmissiveArray[idx] = 2.5;
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

        shader.vertexShader = `
            attribute float instanceEmissive;
            varying float vInstanceEmissive;
            varying float vDist;
            uniform vec3 uPlayerPos;
            ${shader.vertexShader}
        `.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
            float dist = distance(worldPosition.xyz, uPlayerPos);
            vDist = dist;
            vInstanceEmissive = instanceEmissive;
            
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
                color="white"
                emissive="white"
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
