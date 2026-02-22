import * as THREE from 'three';
import type { DetectionResult } from '../../hooks/useSpatialDetection';
import { genEdgePattern, type EdgeVoicePattern } from './ArpPatternGenerator';

export interface EdgeArpPlayer {
    setPatternFromEngine(voices: EdgeVoicePattern[]): void;
    updatePositions(pos1: THREE.Vector3, pos2: THREE.Vector3, nearbyPositions: THREE.Vector3[]): void;
}

export class EdgeArp {
    private readonly player: EdgeArpPlayer;
    private lastKey = '';

    constructor(player: EdgeArpPlayer) {
        this.player = player;
    }

    update(detection: DetectionResult): void {
        if (!detection.activeEdge || !detection.nearestNeighbors) return;

        const { note1, note2, pos1, pos2 } = detection.activeEdge;
        const neighborNotes = detection.nearestNeighbors.map((n) => n.note.name);
        const neighborPositions = detection.nearestNeighbors.map((n) => n.pos);
        const key = `${note1.name}-${note2.name}`;

        if (key !== this.lastKey) {
            this.lastKey = key;
            const voices = genEdgePattern(
                note1.name,
                note2.name,
                pos1,
                pos2,
                neighborNotes,
                neighborPositions
            );
            this.player.setPatternFromEngine(voices);
            return;
        }

        this.player.updatePositions(pos1, pos2, neighborPositions);
    }
}
