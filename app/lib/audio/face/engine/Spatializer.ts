import * as Tone from 'tone';
import * as THREE from 'three';
import { createSpatialPanner, updatePannerPosition } from '../../core/SpatialAudio';

export class Spatializer {
    public readonly panner: Tone.Panner3D;

    constructor(options: { hrtf?: boolean, refDist?: number, maxDist?: number } = {}) {
        this.panner = createSpatialPanner({
            useHRTF: options.hrtf ?? false,
            refDistance: options.refDist ?? 2,
            maxDistance: options.maxDist ?? 30,
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
