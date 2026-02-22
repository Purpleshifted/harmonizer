/**
 * Tonnetz Grid Coordinate Utilities
 * 
 * Pure math functions for converting between grid coordinates (u, v)
 * and world positions, plus triangle/hexagonal neighbor calculation.
 * 
 * No React or Three.js state dependencies — only THREE.Vector3 for geometry.
 */
import * as THREE from 'three';
import { getTone, classifyTriad } from './tonnetz';

// ─── Constants ───────────────────────────────────────────────────────────────

export const SPACING = 12.0;
export const CAMERA_HEIGHT = 2.5;

// ─── Wave Helpers ────────────────────────────────────────────────────────────

/** GLSL shader chunk for wave height calculation (used in instanced materials) */
export const WAVE_SHADER_CHUNK = `
    float getWaveHeight(float x, float z, float time) {
        float wave1 = sin(x * 0.05 + time * 0.3) * 0.8;
        float wave2 = cos(z * 0.04 + time * 0.25) * 0.8;
        float wave3 = sin((x + z) * 0.1 + time * 0.5) * 0.4;
        return wave1 + wave2 + wave3;
    }
`;

/** JS equivalent of the GLSL wave height function */
export function getWaveHeight(x: number, z: number, time: number): number {
    const wave1 = Math.sin(x * 0.05 + time * 0.3) * 0.8;
    const wave2 = Math.cos(z * 0.04 + time * 0.25) * 0.8;
    const wave3 = Math.sin((x + z) * 0.1 + time * 0.5) * 0.4;
    return wave1 + wave2 + wave3;
}

// ─── Coordinate Conversion ───────────────────────────────────────────────────

/** Convert grid coordinates (u, v) to world position (x, 0, z) */
export function getNodeWorldPosition(u: number, v: number): THREE.Vector3 {
    const x = (u - 0.5 * v) * SPACING;
    const z = (v * (Math.sqrt(3) / 2)) * SPACING;
    return new THREE.Vector3(x, 0, z);
}

/** Convert world position (x, z) to nearest grid coordinates */
export function getWorldToGrid(x: number, z: number): { u: number; v: number } {
    const vRaw = z / (SPACING * (Math.sqrt(3) / 2));
    const v = Math.round(vRaw);
    const uRaw = (x / SPACING) + 0.5 * vRaw;
    const u = Math.round(uRaw);
    return { u, v };
}

// ─── Triangle Geometry ───────────────────────────────────────────────────────

export interface TriangleInfo {
    nodes: Array<{ u: number; v: number; pos: THREE.Vector3 }>;
    centroid: THREE.Vector3;
    isMajor: boolean;
}

/** Get the centroid of a triangle defined by three points */
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

/** 6 triangle offset definitions around a center node */
const TRIANGLE_OFFSETS = [
    [{ du: 0, dv: 0 }, { du: 1, dv: 0 }, { du: 0, dv: -1 }],
    [{ du: 0, dv: 0 }, { du: 0, dv: -1 }, { du: -1, dv: -1 }],
    [{ du: 0, dv: 0 }, { du: -1, dv: -1 }, { du: -1, dv: 0 }],
    [{ du: 0, dv: 0 }, { du: -1, dv: 0 }, { du: 0, dv: 1 }],
    [{ du: 0, dv: 0 }, { du: 0, dv: 1 }, { du: 1, dv: 1 }],
    [{ du: 0, dv: 0 }, { du: 1, dv: 1 }, { du: 1, dv: 0 }],
];

/**
 * Get the 6 nearest triangles around a position.
 * Uses interval-based chord analysis for Major/Minor classification.
 */
export function getNearestTriangles(
    playerPos: THREE.Vector3,
    centerU: number,
    centerV: number
): TriangleInfo[] {
    const triangles: TriangleInfo[] = [];

    for (const offsets of TRIANGLE_OFFSETS) {
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

        const analysis = classifyTriad(
            getTone(u1, v1).value,
            getTone(u2, v2).value,
            getTone(u3, v3).value
        );

        triangles.push({ nodes, centroid, isMajor: analysis.isMajor });
    }

    triangles.sort((a, b) => a.centroid.distanceTo(playerPos) - b.centroid.distanceTo(playerPos));
    return triangles.slice(0, 6);
}

// ─── Hexagonal Neighbors ─────────────────────────────────────────────────────

/** Get 6 adjacent nodes around a center node in hexagonal grid */
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

// ─── Instance Grid Helpers ───────────────────────────────────────────────────

/**
 * Calculate node index in an instance array.
 * @param viewRadius The VIEW_RADIUS used for this grid (varies by mode)
 */
export function getNodeIndex(
    u: number,
    v: number,
    gridCenterU: number,
    gridCenterV: number,
    viewRadius: number
): number {
    const gridSize = viewRadius * 2 + 1;
    const startU = gridCenterU - viewRadius;
    const startV = gridCenterV - viewRadius;
    const du = u - startU;
    const dv = v - startV;
    if (du < 0 || du >= gridSize || dv < 0 || dv >= gridSize) return -1;
    return dv * gridSize + du;
}
