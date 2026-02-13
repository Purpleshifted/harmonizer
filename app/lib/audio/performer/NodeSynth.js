/**
 * NodeSynth - The Focus Performer (JS Edition)
 */
import * as Tone from 'tone';
import { ensureOctave, transposeSemitones } from '../utils/NoteUtils';
import { NODE_SYNTH_CONFIG, NOISE_WASH_CONFIG } from '../sources/Oscillator';

export class NodeSynth {
    constructor(ports) {
        // Lush pad Configured from static source
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: NODE_SYNTH_CONFIG.oscillator,
            envelope: NODE_SYNTH_CONFIG.envelope,
            volume: NODE_SYNTH_CONFIG.volume
        });
        this.synth.maxPolyphony = 6;

        // Wobbling filter Configured from static source
        this.filter = new Tone.Filter(NODE_SYNTH_CONFIG.filter);
        this.lfo = new Tone.LFO(NODE_SYNTH_CONFIG.lfo).start();
        this.lfo.connect(this.filter.frequency);

        // Exit noise
        this.noiseSynth = new Tone.NoiseSynth(NOISE_WASH_CONFIG);

        const dest = (ports && ports.main) ? ports.main : ports;
        this.synth.connect(this.filter);
        this.filter.connect(dest);
        this.noiseSynth.connect(dest);

        if (ports && ports.deep) {
            this.filter.connect(ports.deep);
            this.noiseSynth.connect(ports.deep);
        }

        this.isPlaying = false;
        this.currentNote = null;
        this.isDisposed = false;
    }

    start(note, time) {
        if (this.isDisposed) return;
        if (this.isPlaying && this.currentNote === note) return;

        this.synth.releaseAll(time);

        const exactNote = ensureOctave(note, 4);
        const fifthNote = transposeSemitones(exactNote, 7);

        this.synth.triggerAttack(exactNote, time, 1.0);
        this.synth.triggerAttack(fifthNote, time, 0.15);

        this.currentNote = note;
        this.isPlaying = true;
    }

    stop(time) {
        if (this.isDisposed || !this.isPlaying) return;
        this.synth.releaseAll(time);
        this.isPlaying = false;
        this.currentNote = null;
    }

    triggerExit(time) {
        if (this.isDisposed) return;
        this.noiseSynth.triggerAttackRelease("2n", time, 0.2);
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.stop(Tone.now());
        this.synth.dispose();
        this.filter.dispose();
        this.lfo.dispose();
        this.noiseSynth.dispose();
    }
}
