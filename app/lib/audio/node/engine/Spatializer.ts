/**
 * Simple Spatializer wrapper for Node Mode layers
 */
import * as Tone from 'tone';
import * as THREE from 'three';
import { createSpatialPanner, updatePannerPosition } from '../../core/SpatialAudio';

export class Spatializer {
    public readonly panner: Tone.Panner3D;

    constructor(options: { hrtf?: boolean; refDistance?: number; maxDistance?: number } = {}) {
        this.panner = createSpatialPanner({
            useHRTF: options.hrtf ?? false,
            refDistance: options.refDistance ?? 2,
            maxDistance: options.maxDistance ?? 30, // Default distance suitable for node cluster
            rolloffFactor: 1.0,
        });
    }

    public update(pos: THREE.Vector3, rampTime: number = 0.1) {
        updatePannerPosition(this.panner, pos, rampTime);
    }

    public connect(destination: Tone.ToneAudioNode) {
        this.panner.connect(destination);
    }

    public dispose() {
        this.panner.dispose();
    }
}
