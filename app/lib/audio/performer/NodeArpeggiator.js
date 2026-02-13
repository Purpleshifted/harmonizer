/**
 * NodeArpeggiator - The Sparkle Performer (JS Edition)
 */
import * as Tone from 'tone';
import { createSpatialPanner, updatePannerPosition } from '../utils/SpatialAudio';
import { BELL_SYNTH_CONFIG } from '../sources/Oscillator';

export class NodeArpeggiator {
    constructor(ports) {
        this.synth = new Tone.PolySynth(Tone.FMSynth, BELL_SYNTH_CONFIG);
        this.synth.maxPolyphony = 6;

        this.panner = createSpatialPanner({
            useHRTF: true,
            refDistance: 4,
            maxDistance: 40
        });

        const dest = (ports && ports.main) ? ports.main : ports;
        this.synth.connect(this.panner);
        this.panner.connect(dest);

        if (ports && ports.spatial) {
            this.panner.connect(ports.spatial);
        }

        this.isDisposed = false;
    }

    trigger(note, velocity, position, time) {
        if (this.isDisposed) return;
        updatePannerPosition(this.panner, position, 0.1);
        this.synth.triggerAttackRelease(note, "4n", time, velocity);
    }

    stop(time) {
        if (this.isDisposed) return;
        this.synth.releaseAll(time);
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.synth.dispose();
        this.panner.dispose();
    }
}
