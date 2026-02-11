import * as Tone from 'tone';
import * as THREE from 'three';
import { createSpatialPanner, updatePannerPosition } from '../../core/SpatialAudio';

/**
 * Spatializer - Handles 3D positioning for Node mode components
 */
export class Spatializer {
    public readonly panner: Tone.Panner3D;

    constructor(options: { refDist?: number, maxDist?: number } = {}) {
        this.panner = createSpatialPanner({
            useHRTF: true, // Node mode is intimate, HRTF is better
            refDistance: options.refDist ?? 4,
            maxDistance: options.maxDist ?? 40,
            rolloffFactor: 1.0
        });
    }

    public update(pos: THREE.Vector3, rampTime: number = 0.5) {
        updatePannerPosition(this.panner, pos, rampTime);
    }

    public connect(destination: Tone.ToneAudioNode) {
        this.panner.connect(destination);
        return this;
    }

    public dispose() {
        this.panner.dispose();
    }
}
