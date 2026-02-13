'use client';

import { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getTone, classifyTriad } from '../../../../lib/tonnetz/tonnetz';
import {
    getNodeWorldPosition,
    getWorldToGrid,
    getNearestTriangles,
    SPACING,
    type TriangleInfo,
} from '../../../../lib/tonnetz/tonnetz-grid';

export type InteractionMode = 'node' | 'edge' | 'face';

export interface NodeCandidate {
    u: number;
    v: number;
    pos: THREE.Vector3;
    distance: number;
    note: { name: string; value: number };
}

export interface DetectionResult {
    mode: InteractionMode;
    activeNodes: NodeCandidate[];
    isMajor: boolean | null;
    nearestTriangles: TriangleInfo[];
    nearestFourNotes: NodeCandidate[]; // For ambient sounds
    displayInfo: string;
    displayType: string;

    // Detailed info for Players
    activeEdge?: {
        note1: { name: string; value: number };
        note2: { name: string; value: number };
        pos1: THREE.Vector3;
        pos2: THREE.Vector3;
        distance1: number;
        distance2: number;
        midpoint: THREE.Vector3;
    };
    activeTriangle?: {
        notes: string[]; // Names
        positions: THREE.Vector3[];
        isMajor: boolean;
    };
    centerPos?: THREE.Vector3; // Safe center for sound source

    // Nearby candidates for arpeggiator context
    nearestNeighbors: NodeCandidate[];

    // Optimization flag
    isStructureChanged?: boolean;
}

interface UseSpatialDetectionProps {
    onDetectionUpdate?: (result: DetectionResult) => void;
}

/**
 * Hook for unified spatial detection of nodes, edges, faces.
 * Decouples logic from visualization.
 * 
 * - Uses 2D projection (XZ plane) for consistent detection regardless of height.
 * - Implements Hysteresis to prevent flickering.
 * - Provides Ref-based fast access for Audio.
 * - Triggers callback only on structural changes for Visuals.
 */
export function useSpatialDetection({ onDetectionUpdate }: UseSpatialDetectionProps = {}) {
    const { camera } = useThree();

    // Internal state for optimization
    const detectionRef = useRef<DetectionResult | null>(null);
    const prevStructure = useRef<{
        mode: InteractionMode;
        activeNodeNames: string;
    }>({ mode: 'face', activeNodeNames: '__INIT__' });

    // Hysteresis Constant Refs (calculated once)
    const CONSTANTS = useMemo(() => ({
        NODE_ENTER: 0.1 * SPACING,
        NODE_EXIT: 0.2 * SPACING,
        EDGE_ENTER: 0.1 * SPACING,
        EDGE_EXIT: 0.2 * SPACING,
    }), []);

    useFrame(() => {
        const playerPos = camera.position;
        const { u: centerU, v: centerV } = getWorldToGrid(playerPos.x, playerPos.z);

        // Helper for 2D distance (XZ plane)
        const getDistance2D = (v1: THREE.Vector3, v2: THREE.Vector3) => {
            const dx = v1.x - v2.x;
            const dz = v1.z - v2.z;
            return Math.sqrt(dx * dx + dz * dz);
        };

        // Helper for point to segment distance (2D - XZ plane)
        const getDistanceToSegment2D = (p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) => {
            const pax = p.x - a.x;
            const paz = p.z - a.z;
            const bax = b.x - a.x;
            const baz = b.z - a.z;
            const h = Math.min(1, Math.max(0, (pax * bax + paz * baz) / (bax * bax + baz * baz)));
            const dx = pax - bax * h;
            const dz = paz - baz * h;
            return Math.sqrt(dx * dx + dz * dz);
        };

        // 1. Gather candidates
        const candidates: NodeCandidate[] = [];
        for (let dv = -2; dv <= 2; dv++) {
            for (let du = -2; du <= 2; du++) {
                const u = centerU + du;
                const v = centerV + dv;
                const pos = getNodeWorldPosition(u, v);
                const distance = getDistance2D(pos, playerPos); // 2D Distance
                const note = getTone(u, v);
                candidates.push({ u, v, pos, distance, note });
            }
        }
        candidates.sort((a, b) => a.distance - b.distance);

        const c1 = candidates[0];
        const c2 = candidates[1];
        const c3 = candidates[2];

        // 2. Determine Thresholds (Hysteresis)
        const currentMode = prevStructure.current.mode;
        const nodeThreshold = currentMode === 'node' ? CONSTANTS.NODE_EXIT : CONSTANTS.NODE_ENTER;
        const edgeThreshold = currentMode === 'edge' ? CONSTANTS.EDGE_EXIT : CONSTANTS.EDGE_ENTER;

        // 3. Determine Mode & Active Elements
        let mode: InteractionMode;
        let activeNodes: NodeCandidate[];
        let isMajor: boolean | null = null;
        let displayInfo: string;
        let displayType: string;

        let activeEdge: DetectionResult['activeEdge'];
        let activeTriangle: DetectionResult['activeTriangle'];
        let centerPos: THREE.Vector3;

        if (c1.distance < nodeThreshold) {
            // Node Mode
            mode = 'node';
            activeNodes = [c1];
            displayInfo = c1.note.name;
            displayType = 'Node';
            centerPos = c1.pos;
        } else if (getDistanceToSegment2D(playerPos, c1.pos, c2.pos) < edgeThreshold) {
            // Edge Mode
            mode = 'edge';
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
            // Face Mode
            mode = 'face';
            activeNodes = [c1, c2, c3];

            // Interval-based classification
            const analysis = classifyTriad(c1.note.value, c2.note.value, c3.note.value);
            isMajor = analysis.isMajor;

            displayInfo = `${c1.note.name} ${c2.note.name} ${c3.note.name}`;

            // Format Display Type (e.g., "Major", "Minor", "Dim")
            displayType = analysis.type.charAt(0).toUpperCase() + analysis.type.slice(1);
            if (analysis.type === 'other') displayType = 'Triad';

            // Centroid
            centerPos = new THREE.Vector3()
                .add(c1.pos).add(c2.pos).add(c3.pos)
                .divideScalar(3);

            activeTriangle = {
                notes: [c1.note.name, c2.note.name, c3.note.name],
                positions: [c1.pos, c2.pos, c3.pos],
                isMajor: isMajor as boolean,
            };
        }

        // 4. Construct Result
        const detection: DetectionResult = {
            mode,
            activeNodes,
            isMajor,
            nearestTriangles: getNearestTriangles(playerPos, centerU, centerV),
            nearestFourNotes: candidates.slice(0, 4),
            activeEdge,
            activeTriangle,
            centerPos,
            nearestNeighbors: candidates.slice(0, 6),
            displayInfo,
            displayType
        };

        // 5. Update Ref (Fast Path)
        detectionRef.current = detection;

        // 6. Check for Structural Change (Slow Path)
        const currentActiveNames = activeNodes.map(n => n.note.name).sort().join('-');
        const isStructureChanged =
            mode !== prevStructure.current.mode ||
            currentActiveNames !== prevStructure.current.activeNodeNames;

        if (isStructureChanged) {
            prevStructure.current = { mode, activeNodeNames: currentActiveNames };
            if (onDetectionUpdate) {
                onDetectionUpdate(detection);
            }
        }
    });

    return detectionRef;
}
