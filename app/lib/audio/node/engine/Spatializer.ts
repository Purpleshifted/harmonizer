/**
 * Simple Spatializer wrapper for Node Mode layers
 * Handles candidate pooling for surrounding note positioning
 */
import * as Tone from 'tone';
import * as THREE from 'three';
import { createSpatialPanner, updatePannerPosition } from '../../core/SpatialAudio';

export class Spatializer {
    public readonly panner: Tone.Panner3D;
    private candidates: { note: string, pos: THREE.Vector3 }[] = [];

    constructor(options: { hrtf?: boolean; refDistance?: number; maxDistance?: number } = {}) {
        this.panner = createSpatialPanner({
            useHRTF: options.hrtf ?? false,
            refDistance: options.refDistance ?? 2,
            maxDistance: options.maxDistance ?? 30, // Default distance suitable for node cluster
            rolloffFactor: 1.0,
        });
    }

    /**
     * Update the candidate pool of surrounding notes
     */
    public updateCandidates(notes: string[], positions: THREE.Vector3[]) {
        if (notes.length !== positions.length) return;
        this.candidates = notes.map((note, i) => ({
            note,
            pos: positions[i]
        }));
    }

    /**
     * Pick a random candidate and move the panner to its position
     */
    public pickRandomCandidate(): { note: string, pos: THREE.Vector3 } | null {
        if (this.candidates.length === 0) return null;

        const idx = Math.floor(Math.random() * this.candidates.length);
        const candidate = this.candidates[idx];

        // Move the panner to the selected candidate's position
        this.update(candidate.pos, 0.1);

        return candidate;
    }

    public update(pos: THREE.Vector3, rampTime: number = 0.1) {
        updatePannerPosition(this.panner, pos, rampTime);
    }

    public connect(destination: Tone.ToneAudioNode) {
        this.panner.connect(destination);
        return this;
    }

    public dispose() {
        this.panner.dispose();
        this.candidates = [];
    }
}
