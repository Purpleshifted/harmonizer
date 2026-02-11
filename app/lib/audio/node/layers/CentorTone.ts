import * as Tone from 'tone';
import { ensureOctave, transposeSemitones } from '../../core/NoteUtils';
import { SynthTank } from '../factory/SynthTank';

/**
 * CentorTone - The main focused pad sound for Node mode
 */
export class CentorTone {
    private synth: Tone.PolySynth;
    private noiseSynth: Tone.NoiseSynth;
    private isPlaying = false;
    private currentNote: string | null = null;
    private lastTriggerTime = 0;

    constructor() {
        this.synth = SynthTank.createPadSynth();
        this.noiseSynth = SynthTank.createExitNoise();
    }

    public connect(destination: Tone.ToneAudioNode) {
        this.synth.connect(destination);
        this.noiseSynth.connect(destination);
        return this;
    }

    /**
     * Trigger root and fifth for a lush pad
     */
    public start(note: string) {
        const now = Tone.now();
        if (this.isPlaying && this.currentNote === note) return;
        if (now - this.lastTriggerTime < 0.1) return;

        this.lastTriggerTime = now;
        if (this.isPlaying) this.synth.releaseAll();

        const root = ensureOctave(note, 4);
        const fifth = transposeSemitones(root, 7);

        this.synth.triggerAttack(root, now, 1.0);
        this.synth.triggerAttack(fifth, now, 0.2);

        this.currentNote = note;
        this.isPlaying = true;
    }

    public stop() {
        if (!this.isPlaying) return;
        this.synth.releaseAll();
        this.isPlaying = false;
        this.currentNote = null;
    }

    /**
     * Washing noise wave on exit
     */
    public triggerExitEffect() {
        this.noiseSynth.triggerAttackRelease("2n", Tone.now(), 0.25);
    }

    public dispose() {
        this.synth.dispose();
        this.noiseSynth.dispose();
    }
}
