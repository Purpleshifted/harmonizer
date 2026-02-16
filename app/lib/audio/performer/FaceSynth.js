/**
 * FaceSynth - The Core Orchestral Pad (JS Edition)
 */
import * as Tone from 'tone';
import { ensureOctave } from '../utils/NoteUtils';
import { FACE_SYNTH_CONFIG } from '../sources/Oscillator';

export class FaceSynth {
    constructor(ports) {
        this.synth = new Tone.PolySynth(Tone.Synth, FACE_SYNTH_CONFIG);
        this.synth.maxPolyphony = 24;
        this.filter = new Tone.Filter({ type: 'lowpass', frequency: 1500, rolloff: -12 });
        this.gain = new Tone.Gain(0.3);

        this.synth.connect(this.filter);
        this.filter.connect(this.gain);

        const dest = (ports && ports.main) ? ports.main : ports;
        this.gain.connect(dest);

        if (ports && ports.spatial) {
            this.gain.connect(ports.spatial);
        }

        this.isDisposed = false;
    }

    trigger(notes, time) {
        if (this.isDisposed) return;
        this.synth.releaseAll(time);
        notes.forEach(note => {
            const n = ensureOctave(note, 4);
            this.synth.triggerAttack(n, time, 0.5);
        });
    }

    setVolume(scale, time) {
        if (this.isDisposed) return;
        this.gain.gain.rampTo(0.3 * scale, 0.1, time);
    }

    stop(time) {
        if (this.isDisposed) return;
        this.synth.releaseAll(time);
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.synth.dispose();
        this.filter.dispose();
        this.gain.dispose();
    }
}
