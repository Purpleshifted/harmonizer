// Tonnetz grid — re-export geometry from app/lib/tonnetz, add view constants for this module.
import {
    SPACING,
    CAMERA_HEIGHT,
    WAVE_SHADER_CHUNK,
    getWaveHeight,
    getNodeWorldPosition,
    getWorldToGrid,
    getTriangleCentroid,
    getNearestTriangles,
    getAdjacentNodes,
    getNodeIndex as getNodeIndexFromLib,
    type TriangleInfo,
} from '../../../lib/tonnetz';

export { SPACING, CAMERA_HEIGHT, WAVE_SHADER_CHUNK, getWaveHeight, getNodeWorldPosition, getWorldToGrid, getTriangleCentroid, getNearestTriangles, getAdjacentNodes };
export type { TriangleInfo };

export const VIEW_RADIUS = 20;
export const GRID_SIZE = VIEW_RADIUS * 2 + 1;
export const TOTAL_INSTANCES = GRID_SIZE * GRID_SIZE;

export function getNodeIndex(
    u: number,
    v: number,
    gridCenterU: number,
    gridCenterV: number
): number {
    return getNodeIndexFromLib(u, v, gridCenterU, gridCenterV, VIEW_RADIUS);
}
