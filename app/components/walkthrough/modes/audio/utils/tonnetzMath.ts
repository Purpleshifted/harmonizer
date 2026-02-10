// Tonnetz grid coordinate utilities
import * as THREE from 'three';

export const SPACING = 12.0;
export const VIEW_RADIUS = 20;
export const GRID_SIZE = VIEW_RADIUS * 2 + 1; // 31x31 grid
export const TOTAL_INSTANCES = GRID_SIZE * GRID_SIZE;
export const CAMERA_HEIGHT = 2.5; // Slightly raised from 2.0

import { getTone, classifyTriad } from '../../../../../lib/tonnetz';
import { Chord } from '@tonaljs/tonal';

// Wave Helper (Shader Chunk)
export const WAVE_SHADER_CHUNK = `
    float getWaveHeight(float x, float z, float time) {
        float wave1 = sin(x * 0.05 + time * 0.3) * 0.8;
        float wave2 = cos(z * 0.04 + time * 0.25) * 0.8;
        float wave3 = sin((x + z) * 0.1 + time * 0.5) * 0.4;
        return wave1 + wave2 + wave3;
    }
`;

// Wave Helper (JS)
export function getWaveHeight(x: number, z: number, time: number): number {
    const wave1 = Math.sin(x * 0.05 + time * 0.3) * 0.8;
    const wave2 = Math.cos(z * 0.04 + time * 0.25) * 0.8;
    const wave3 = Math.sin((x + z) * 0.1 + time * 0.5) * 0.4;
    return wave1 + wave2 + wave3;
}

/**
 * Convert grid coordinates (u, v) to world position
 */
export function getNodeWorldPosition(u: number, v: number): THREE.Vector3 {
    const x = (u - 0.5 * v) * SPACING;
    const z = (v * (Math.sqrt(3) / 2)) * SPACING;
    return new THREE.Vector3(x, 0, z);
}

/**
 * Convert world position (x, z) to grid coordinates
 */
export function getWorldToGrid(x: number, z: number): { u: number; v: number } {
    const vRaw = z / (SPACING * (Math.sqrt(3) / 2));
    const v = Math.round(vRaw);
    const uRaw = (x / SPACING) + 0.5 * vRaw;
    const u = Math.round(uRaw);
    return { u, v };
}

/**
 * Get the centroid of a triangle defined by three nodes
 */
export function getTriangleCentroid(
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3
): THREE.Vector3 {
    return new THREE.Vector3(
        (p1.x + p2.x + p3.x) / 3,
        (p1.y + p2.y + p3.y) / 3,
        (p1.z + p2.z + p3.z) / 3
    );
}

export interface TriangleInfo {
    nodes: Array<{ u: number; v: number; pos: THREE.Vector3 }>;
    centroid: THREE.Vector3;
    isMajor: boolean;
}

// Local definitions removed. Using lib/tonnetz.

/**
 * Get the 6 nearest triangles around a position
 * In a Tonnetz grid, each node is surrounded by 6 triangles
 */
export function getNearestTriangles(
    playerPos: THREE.Vector3,
    centerU: number,
    centerV: number
): TriangleInfo[] {
    const triangles: TriangleInfo[] = [];

    // Define the 6 triangles around a node
    const triangleOffsets = [
        [{ du: 0, dv: 0 }, { du: 1, dv: 0 }, { du: 0, dv: -1 }],
        [{ du: 0, dv: 0 }, { du: 0, dv: -1 }, { du: -1, dv: -1 }],
        [{ du: 0, dv: 0 }, { du: -1, dv: -1 }, { du: -1, dv: 0 }],
        [{ du: 0, dv: 0 }, { du: -1, dv: 0 }, { du: 0, dv: 1 }],
        [{ du: 0, dv: 0 }, { du: 0, dv: 1 }, { du: 1, dv: 1 }],
        [{ du: 0, dv: 0 }, { du: 1, dv: 1 }, { du: 1, dv: 0 }],
    ];

    for (let i = 0; i < triangleOffsets.length; i++) {
        const offsets = triangleOffsets[i];

        // Resolve coordinates
        const u1 = centerU + offsets[0].du;
        const v1 = centerV + offsets[0].dv;
        const u2 = centerU + offsets[1].du;
        const v2 = centerV + offsets[1].dv;
        const u3 = centerU + offsets[2].du;
        const v3 = centerV + offsets[2].dv;

        const nodes = [
            { u: u1, v: v1, pos: getNodeWorldPosition(u1, v1) },
            { u: u2, v: v2, pos: getNodeWorldPosition(u2, v2) },
            { u: u3, v: v3, pos: getNodeWorldPosition(u3, v3) },
        ];

        const centroid = getTriangleCentroid(nodes[0].pos, nodes[1].pos, nodes[2].pos);

        // ANALYZE: Use actual note values to determine Major/Minor
        // Geometric check (i < 3) is unreliable if grid topology is complex (Spiral/Torus)
        // or if coordinate system logic changes.
        // Interval analysis is Ground Truth.
        const analysis = classifyTriad(
            getTone(u1, v1).value,
            getTone(u2, v2).value,
            getTone(u3, v3).value
        );
        const isMajor = analysis.isMajor;

        triangles.push({ nodes, centroid, isMajor });
    }

    // Sort by distance to player
    triangles.sort((a, b) => a.centroid.distanceTo(playerPos) - b.centroid.distanceTo(playerPos));

    return triangles.slice(0, 6);
}

/**
 * Get adjacent nodes around a center node (6 neighbors in hexagonal grid)
 */
export function getAdjacentNodes(centerU: number, centerV: number): Array<{ u: number; v: number }> {
    return [
        { u: centerU + 1, v: centerV },     // Right
        { u: centerU - 1, v: centerV },     // Left
        { u: centerU, v: centerV + 1 },     // Down-Left
        { u: centerU, v: centerV - 1 },     // Up-Right
        { u: centerU + 1, v: centerV + 1 }, // Down-Right
        { u: centerU - 1, v: centerV - 1 }, // Up-Left
    ];
}

/**
 * Calculate node index in the instance array
 */
export function getNodeIndex(
    u: number,
    v: number,
    gridCenterU: number,
    gridCenterV: number
): number {
    const startU = gridCenterU - VIEW_RADIUS;
    const startV = gridCenterV - VIEW_RADIUS;
    const du = u - startU;
    const dv = v - startV;
    if (du < 0 || du >= GRID_SIZE || dv < 0 || dv >= GRID_SIZE) return -1;
    return dv * GRID_SIZE + du;
}
