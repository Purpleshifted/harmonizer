/**
 * Detection types - shared across SpatialDetector, NotePicker, and consumers.
 */
import type * as THREE from 'three';
import type { TriangleInfo } from '../tonnetz/tonnetz-grid';

export type InteractionMode = 'node' | 'edge' | 'face';

export interface NodeCandidate {
    u: number;
    v: number;
    pos: THREE.Vector3;
    distance: number;
    note: { name: string; value: number };
}

export interface WhichTriangleInfo {
    notes: [string, string, string];
    isMajor: boolean;
    centroid: THREE.Vector3;
}

export interface NotePickerOutput {
    lineNotes: [string, string] | null;
    dotNote: string | null;
    hexNotes: string[] | null;
}

export interface PrevStructure {
    mode: InteractionMode;
    activeNodeNames: string;
    isEdge: boolean;
    isNode: boolean;
}

export interface DetectionResult {
    mode: InteractionMode;
    isEdge: boolean;
    isNode: boolean;
    whichTriangle: WhichTriangleInfo;
    activeNodes: NodeCandidate[];
    isMajor: boolean | null;
    nearestTriangles: TriangleInfo[];
    nearestFourNotes: NodeCandidate[];
    displayInfo: string;
    displayType: string;

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
        notes: string[];
        positions: THREE.Vector3[];
        isMajor: boolean;
    };
    centerPos?: THREE.Vector3;

    nearestNeighbors: NodeCandidate[];
    adjacentNodeNotes?: NodeCandidate[];

    notePicker?: NotePickerOutput;

    isStructureChanged?: boolean;
}
