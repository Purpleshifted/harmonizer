'use client';

import React, { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
    getWorldToGrid,
    getNodeWorldPosition,
} from '../../lib/tonnetz-grid';

const VIEW_RADIUS = 20;
const GRID_SIZE = VIEW_RADIUS * 2 + 1;
const TOTAL_INSTANCES = GRID_SIZE * GRID_SIZE;

/**
 * Glowing grid lines component
 * Extracted and optimized from original TonnetzWalkthrough
 */
export function GlowingGrid() {
    const { camera } = useThree();
    const linesRef = useRef<THREE.LineSegments>(null);
    const positionsRef = useRef<Float32Array | null>(null);
    const colorsRef = useRef<Float32Array | null>(null);
    const lastGridPos = useRef({ u: 99999, v: 99999 });

    const TOTAL_EDGES = TOTAL_INSTANCES * 3;

    useEffect(() => {
        if (!linesRef.current) return;

        const positions = new Float32Array(TOTAL_EDGES * 6);
        const colors = new Float32Array(TOTAL_EDGES * 6);

        positionsRef.current = positions;
        colorsRef.current = colors;

        const geometry = linesRef.current.geometry as THREE.BufferGeometry;
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }, [TOTAL_EDGES]);

    const setEdge = (
        positions: Float32Array,
        colors: Float32Array,
        idx: number,
        p1: THREE.Vector3,
        p2: THREE.Vector3,
        playerPos: THREE.Vector3
    ) => {
        const base = idx * 6;

        positions[base] = p1.x;
        positions[base + 1] = p1.y;
        positions[base + 2] = p1.z;
        positions[base + 3] = p2.x;
        positions[base + 4] = p2.y;
        positions[base + 5] = p2.z;

        const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const dist = center.distanceTo(playerPos);
        const intensity = Math.max(0.3, 1.5 - (dist / 40));

        colors[base] = intensity;
        colors[base + 1] = intensity;
        colors[base + 2] = intensity;
        colors[base + 3] = intensity;
        colors[base + 4] = intensity;
        colors[base + 5] = intensity;
    };

    useFrame(() => {
        if (!linesRef.current || !positionsRef.current || !colorsRef.current) return;

        const playerPos = camera.position;
        const { u: centerU, v: centerV } = getWorldToGrid(playerPos.x, playerPos.z);

        if (centerU !== lastGridPos.current.u || centerV !== lastGridPos.current.v) {
            lastGridPos.current = { u: centerU, v: centerV };

            const positions = positionsRef.current;
            const colors = colorsRef.current;
            let ei = 0;

            const startU = centerU - VIEW_RADIUS;
            const startV = centerV - VIEW_RADIUS;

            for (let dv = 0; dv < GRID_SIZE; dv++) {
                for (let du = 0; du < GRID_SIZE; du++) {
                    const u = startU + du;
                    const v = startV + dv;
                    const pos = getNodeWorldPosition(u, v);

                    const pRight = getNodeWorldPosition(u + 1, v);
                    setEdge(positions, colors, ei, pos, pRight, playerPos);
                    ei++;

                    const pDL = getNodeWorldPosition(u, v + 1);
                    setEdge(positions, colors, ei, pos, pDL, playerPos);
                    ei++;

                    const pDR = getNodeWorldPosition(u + 1, v + 1);
                    setEdge(positions, colors, ei, pos, pDR, playerPos);
                    ei++;
                }
            }

            const geometry = linesRef.current.geometry as THREE.BufferGeometry;
            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.color.needsUpdate = true;
        }
    });

    return (
        <lineSegments ref={linesRef} frustumCulled={false}>
            <bufferGeometry />
            <lineBasicMaterial
                vertexColors
                transparent
                opacity={0.8}
                blending={THREE.AdditiveBlending}
                linewidth={2}
            />
        </lineSegments>
    );
}
