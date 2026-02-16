'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getWorldToGrid } from '../../../../lib/tonnetz/tonnetz-grid';
import {
    runSpatialDetection,
    runNotePicker,
    MOVEMENT_THRESHOLD_SQ,
    type DetectionResult,
    type InteractionMode,
    type NodeCandidate,
    type PrevStructure,
} from '../../../../lib/detection';

interface UseSpatialDetectionProps {
    onDetectionUpdate?: (result: DetectionResult) => void;
    keyHoldSec?: number;
    /** When true, always run detection (skip movement-threshold early-exit) for smoother visuals while moving */
    isMoving?: boolean;
}

/**
 * Hook for unified spatial detection of nodes, edges, faces.
 * Decouples logic from visualization.
 *
 * - Uses 2D projection (XZ plane) for consistent detection regardless of height.
 * - Implements Hysteresis to prevent flickering.
 * - Provides Ref-based fast access for Audio.
 * - Triggers callback only on structural changes for Visuals.
 * - Face mode (visual): !isEdge && !isNode
 */
export function useSpatialDetection({ onDetectionUpdate, keyHoldSec = 0, isMoving = false }: UseSpatialDetectionProps = {}) {
    const { camera } = useThree();

    const detectionRef = useRef<DetectionResult | null>(null);
    const lastCameraPos = useRef(new THREE.Vector3());
    const prevStructure = useRef<PrevStructure>({
        mode: 'face',
        activeNodeNames: '__INIT__',
        isEdge: false,
        isNode: false,
    });

    useFrame(() => {
        const playerPos = camera.position;

        // Δ-based skip: when idle, skip if camera hasn't moved; when moving, always run for smooth visuals
        const distSq = playerPos.distanceToSquared(lastCameraPos.current);
        if (!isMoving && distSq < MOVEMENT_THRESHOLD_SQ && detectionRef.current != null) {
            return;
        }
        lastCameraPos.current.copy(playerPos);

        const { u: centerU, v: centerV } = getWorldToGrid(playerPos.x, playerPos.z);

        const raw = runSpatialDetection({
            playerPos,
            centerU,
            centerV,
            prevStructure: prevStructure.current,
            isMoving,
        });

        const notePicker = runNotePicker({
            isEdge: raw.isEdge,
            isNode: raw.isNode,
            activeEdge: raw.activeEdge,
            activeNodes: raw.activeNodes,
            nearestNeighbors: raw.nearestNeighbors,
            adjacentNodeNotes: raw.adjacentNodeNotes,
        });

        const detection: DetectionResult = { ...raw, notePicker };

        detectionRef.current = detection;

        const currentActiveNames = raw.activeNodes.map((n) => n.note.name).sort().join('-');
        const isStructureChanged =
            raw.mode !== prevStructure.current.mode ||
            raw.isEdge !== prevStructure.current.isEdge ||
            raw.isNode !== prevStructure.current.isNode ||
            currentActiveNames !== prevStructure.current.activeNodeNames;

        if (isStructureChanged) {
            prevStructure.current = {
                mode: raw.mode,
                activeNodeNames: currentActiveNames,
                isEdge: raw.isEdge,
                isNode: raw.isNode,
            };
            detection.isStructureChanged = true;
            if (onDetectionUpdate) {
                onDetectionUpdate(detection);
            }
        }
    });

    return detectionRef;
}

// Re-export for consumers
export type { DetectionResult, InteractionMode, NodeCandidate };
