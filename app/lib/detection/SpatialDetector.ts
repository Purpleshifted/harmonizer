/**
 * SpatialDetector - Pure detection logic for WhichTriangle, IsEdge, IsNode.
 * Framework-agnostic; used by useSpatialDetection hook.
 */
import * as THREE from 'three';
import { getTone, classifyTriad } from '../tonnetz/tonnetz';
import {
    getNodeWorldPosition,
    getWorldToGrid,
    getNearestTriangles,
    getAdjacentNodes,
} from '../tonnetz/tonnetz-grid';
import { NODE_ENTER, NODE_EXIT, EDGE_ENTER, EDGE_EXIT, MOVEMENT_EXIT_MULTIPLIER } from './constants';
import type {
    DetectionResult,
    NodeCandidate,
    InteractionMode,
    PrevStructure,
    WhichTriangleInfo,
} from './types';

function getDistance2D(v1: THREE.Vector3, v2: THREE.Vector3): number {
    const dx = v1.x - v2.x;
    const dz = v1.z - v2.z;
    return Math.sqrt(dx * dx + dz * dz);
}

function getDistanceToSegment2D(
    p: THREE.Vector3,
    a: THREE.Vector3,
    b: THREE.Vector3
): number {
    const pax = p.x - a.x;
    const paz = p.z - a.z;
    const bax = b.x - a.x;
    const baz = b.z - a.z;
    const denom = bax * bax + baz * baz;
    const h = denom > 0 ? Math.min(1, Math.max(0, (pax * bax + paz * baz) / denom)) : 0;
    const dx = pax - bax * h;
    const dz = paz - baz * h;
    return Math.sqrt(dx * dx + dz * dz);
}

export interface SpatialDetectorRunInput {
    playerPos: THREE.Vector3;
    centerU: number;
    centerV: number;
    prevStructure: PrevStructure;
    /** When true, use wider exit thresholds to reduce mode flap at edge/node crossings */
    isMoving?: boolean;
}

export function runSpatialDetection(input: SpatialDetectorRunInput): Omit<DetectionResult, 'notePicker' | 'isStructureChanged'> {
    const { playerPos, centerU, centerV, prevStructure, isMoving = false } = input;

    const candidates: NodeCandidate[] = [];
    for (let dv = -2; dv <= 2; dv++) {
        for (let du = -2; du <= 2; du++) {
            const u = centerU + du;
            const v = centerV + dv;
            const pos = getNodeWorldPosition(u, v);
            const distance = getDistance2D(pos, playerPos);
            const note = getTone(u, v);
            candidates.push({ u, v, pos, distance, note });
        }
    }
    candidates.sort((a, b) => a.distance - b.distance);

    const c1 = candidates[0];
    const c2 = candidates[1];
    const c3 = candidates[2];

    // WhichTriangle: always from nearest triangle
    const nearestTriangles = getNearestTriangles(playerPos, centerU, centerV);
    const nearestTri = nearestTriangles[0];
    const whichTriangle: WhichTriangleInfo = nearestTri
        ? {
              notes: [
                  getTone(nearestTri.nodes[0].u, nearestTri.nodes[0].v).name,
                  getTone(nearestTri.nodes[1].u, nearestTri.nodes[1].v).name,
                  getTone(nearestTri.nodes[2].u, nearestTri.nodes[2].v).name,
              ],
              isMajor: nearestTri.isMajor,
              centroid: nearestTri.centroid,
          }
        : {
              notes: [c1.note.name, c2.note.name, c3.note.name],
              isMajor: false,
              centroid: new THREE.Vector3().add(c1.pos).add(c2.pos).add(c3.pos).divideScalar(3),
          };

    // Hysteresis thresholds (wider exit when moving to reduce flap at boundaries)
    const currentMode = prevStructure.mode;
    const exitMult = isMoving ? MOVEMENT_EXIT_MULTIPLIER : 1;
    const nodeThreshold = currentMode === 'node' ? NODE_EXIT * exitMult : NODE_ENTER;
    const edgeThreshold = currentMode === 'edge' ? EDGE_EXIT * exitMult : EDGE_ENTER;

    // IsNode, IsEdge (hierarchical)
    const isNode = c1.distance < nodeThreshold;
    const segmentDist = getDistanceToSegment2D(playerPos, c1.pos, c2.pos);
    const isEdge = !isNode && segmentDist < edgeThreshold;

    // mode = derived: isNode ? 'node' : (isEdge ? 'edge' : 'face')
    const mode: InteractionMode = isNode ? 'node' : isEdge ? 'edge' : 'face';

    let activeNodes: NodeCandidate[];
    let isMajor: boolean | null = null;
    let displayInfo: string;
    let displayType: string;
    let activeEdge: DetectionResult['activeEdge'];
    let activeTriangle: DetectionResult['activeTriangle'];
    let centerPos: THREE.Vector3;
    let adjacentNodeNotes: NodeCandidate[] | undefined;

    if (isNode) {
        activeNodes = [c1];
        displayInfo = c1.note.name;
        displayType = 'Node';
        centerPos = c1.pos;
        const adj = getAdjacentNodes(c1.u, c1.v);
        adjacentNodeNotes = adj.map(({ u, v }) => {
            const pos = getNodeWorldPosition(u, v);
            return {
                u,
                v,
                pos,
                distance: getDistance2D(pos, playerPos),
                note: getTone(u, v),
            };
        });
    } else if (isEdge) {
        activeNodes = [c1, c2];
        displayInfo = `${c1.note.name} – ${c2.note.name}`;
        displayType = 'Interval';
        const midpoint = new THREE.Vector3().addVectors(c1.pos, c2.pos).multiplyScalar(0.5);
        centerPos = midpoint;
        activeEdge = {
            note1: c1.note,
            note2: c2.note,
            pos1: c1.pos,
            pos2: c2.pos,
            distance1: c1.distance,
            distance2: c2.distance,
            midpoint,
        };
    } else {
        activeNodes = [c1, c2, c3];
        const analysis = classifyTriad(c1.note.value, c2.note.value, c3.note.value);
        isMajor = analysis.isMajor;
        displayInfo = `${c1.note.name} ${c2.note.name} ${c3.note.name}`;
        displayType = analysis.type.charAt(0).toUpperCase() + analysis.type.slice(1);
        if (analysis.type === 'other') displayType = 'Triad';
        centerPos = new THREE.Vector3()
            .add(c1.pos)
            .add(c2.pos)
            .add(c3.pos)
            .divideScalar(3);
        activeTriangle = {
            notes: [c1.note.name, c2.note.name, c3.note.name],
            positions: [c1.pos, c2.pos, c3.pos],
            isMajor: isMajor as boolean,
        };
    }

    return {
        mode,
        isEdge,
        isNode,
        whichTriangle,
        activeNodes,
        isMajor,
        nearestTriangles,
        nearestFourNotes: candidates.slice(0, 4),
        activeEdge,
        activeTriangle,
        centerPos,
        nearestNeighbors: candidates.slice(0, 6),
        adjacentNodeNotes: mode === 'node' ? adjacentNodeNotes : undefined,
        displayInfo,
        displayType,
    };
}
