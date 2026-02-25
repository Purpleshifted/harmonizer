/**
 * RotationSpatializer - Lightweight stereo placement without HRTF.
 * Applies L/R gain (pan) + ITD (interaural time difference) based on rotation angle.
 * Use after reverb: reverb output (treated as mono source) → spatializer → destination.
 */
import * as Tone from 'tone';
import type * as THREE from 'three';

const MAX_ITD_SEC = 0.0006; // ~0.6ms, typical human ITD max
const PAN_SMOOTH = 0.15;

export class RotationSpatializer extends Tone.ToneAudioNode {
    public readonly name = 'RotationSpatializer';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    private gainL: Tone.Gain;
    private gainR: Tone.Gain;
    private delayL: Tone.Delay;
    private delayR: Tone.Delay;
    private splitter: Tone.Split;
    private merger: Tone.Merge;

    constructor() {
        super();
        this.input = new Tone.Gain(1);
        this.output = new Tone.Gain(1);

        this.splitter = new Tone.Split(2);
        this.merger = new Tone.Merge(2);
        this.delayL = new Tone.Delay(MAX_ITD_SEC, 1);
        this.delayR = new Tone.Delay(MAX_ITD_SEC, 1);
        this.gainL = new Tone.Gain(0.707);
        this.gainR = new Tone.Gain(0.707);

        // Chain: input → splitter → [L: delayL → gainL, R: delayR → gainR] → merger → output
        // Reverb treated as mono: feed channel 0 to both L/R chains for pan+ITD
        this.input.connect(this.splitter);
        this.splitter.connect(this.delayL, 0, 0);
        this.splitter.connect(this.delayR, 0, 0);
        this.delayL.connect(this.gainL);
        this.delayR.connect(this.gainR);
        this.gainL.connect(this.merger, 0, 0);
        this.gainR.connect(this.merger, 0, 1);
        this.merger.connect(this.output);
    }

    /**
     * Update spatialization from listener yaw and wave angle (radians).
     * relativeAngle = waveAngle - listenerYaw; 0 = wave in front.
     */
    update(listenerYaw: number, waveAngle: number, time?: number) {
        const rel = waveAngle - listenerYaw;
        // Normalize to -PI..PI
        const relNorm = Math.atan2(Math.sin(rel), Math.cos(rel));

        // x goes from -1 (Left) to +1 (Right)
        const x = -Math.sin(relNorm);

        // Constant-power pan: mapped cleanly for ALL 360 directions
        const panAngle = (x + 1) * Math.PI / 4;
        const gL = Math.max(0, Math.cos(panAngle));
        const gR = Math.max(0, Math.sin(panAngle));

        // ITD: sound on right (x > 0) → R hears first → delay L more
        const itd = x * MAX_ITD_SEC;
        const dL = Math.max(0, itd);
        const dR = Math.max(0, -itd);

        const t = time ?? Tone.now();
        this.gainL.gain.rampTo(gL, PAN_SMOOTH, t);
        this.gainR.gain.rampTo(gR, PAN_SMOOTH, t);
        this.delayL.delayTime.rampTo(dL, PAN_SMOOTH, t);
        this.delayR.delayTime.rampTo(dR, PAN_SMOOTH, t);
    }

    dispose(): this {
        this.delayL.dispose();
        this.delayR.dispose();
        this.gainL.dispose();
        this.gainR.dispose();
        this.splitter.dispose();
        this.merger.dispose();
        this.input.dispose();
        this.output.dispose();
        return super.dispose();
    }
}

/** Extract yaw (radians) from forward vector in XZ plane */
export function forwardToYaw(forward: THREE.Vector3): number {
    return Math.atan2(forward.x, forward.z);
}
