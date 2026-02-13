/**
 * FaceArpeggiator - The Astral Performer (JS Edition)
 */
import * as Tone from 'tone';
import { createDelay } from '../engine/ReverbFactory';
import { ASTRAL_ARP_CONFIG } from '../sources/Oscillator';

export class FaceArpeggiator {
    constructor(ports) {
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: ASTRAL_ARP_CONFIG.oscillator,
            volume: ASTRAL_ARP_CONFIG.volume
        });
        this.synth.maxPolyphony = 12;
        this.filter = new Tone.Filter(ASTRAL_ARP_CONFIG.filter);
        this.delay = createDelay("4n.", 0.4, 0.5);
        this.gain = new Tone.Gain(1.0);

        this.synth.connect(this.filter);
        this.filter.connect(this.delay);
        this.delay.connect(this.gain);

        // Astral routing: Connect to both Main (Dry) and Deep (Reverb Tail)
        this.gain.connect(ports.main);
        if (ports.deep) {
            this.gain.connect(ports.deep);
        }

        this.sequence = new Tone.Sequence((time, note) => {
            if (note && this.gain.gain.value > 0.001) {
                this.synth.triggerAttackRelease(note, "4n", time, 0.3);
            }
        }, [], "4n").start(0);

        this.isDisposed = false;
    }

    update(events) {
        if (this.isDisposed) return;
        this.sequence.events = events;
    }

    setVolume(scale, time) {
        if (this.isDisposed) return;
        this.gain.gain.rampTo(1.0 * scale, 0.1, time);
    }

    stop(time) {
        if (this.isDisposed) return;
        this.synth.releaseAll(time);
        this.sequence.stop();
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.sequence.dispose();
        this.synth.dispose();
        this.filter.dispose();
        this.delay.dispose();
        this.gain.dispose();
    }
}
