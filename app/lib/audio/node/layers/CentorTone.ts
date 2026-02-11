/**
 * CentorTone - The main focus pad layer for Node Mode
 * Creates a vast, modulated Sawtooth pad that connects to the wobbling Effector
 * (Replaced with NodeFocusPad content for specific sound character)
 */

import * as Tone from 'tone';
import { ensureOctave, transposeSemitones } from '../../core/NoteUtils';
import { Effector } from '../engine/Effectors';

export class CentorTone {
    private synth: Tone.PolySynth;
    private filter: Tone.Filter;
    private lfo: Tone.LFO;
    private noiseSynth: Tone.NoiseSynth;

    // Throttling
    private isPlaying = false;
    private currentNote: string | null = null;
    private lastTriggerTime = 0;
    private isDisposed = false;

    public get active(): boolean {
        return this.isPlaying;
    }

    constructor() {
        // 1. Lush pad using FatOscillator for width (Restored from NodeFocusPad)
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: 'fatsawtooth',
                count: 3,
                spread: 30
            },
            envelope: {
                attack: 2,
                decay: 1,
                sustain: 1,
                release: 1.5,
            },
            volume: -4 // Keeping slight boost vs original -10 for safety
        });
        this.synth.maxPolyphony = 6;

        // 2. Filter with LFO modulation for "wobbling" effect
        this.filter = new Tone.Filter({
            type: 'lowpass',
            frequency: 400, // Original dark wobble
            Q: 1
        });

        // 3. Slow LFO (breathing effect)
        this.lfo = new Tone.LFO({
            frequency: 0.02,
            min: 300,
            max: 800,
            type: 'sine'
        }).start();
        this.lfo.connect(this.filter.frequency);

        // 4. Wave/Noise Synth for exit transition
        this.noiseSynth = new Tone.NoiseSynth({
            noise: {
                type: 'pink',
                playbackRate: 0.5,
            },
            envelope: {
                attack: 0.5,
                decay: 2,
                sustain: 0,
                release: 2,
            },
        });

        // Internal Routing: Synth -> Filter
        this.synth.connect(this.filter);
        // NoiseSynth is direct
    }

    /**
     * Connects this layer to the central effector
     * Route the internally filtered pad to the effector's direct input (bypassing effector's generic filter)
     * effectively reconstructing the "NodeFocusPad" chain: Synth -> Filter -> Volume -> Split
     */
    public connect(effector: Effector) {
        this.filter.connect(effector.directInput);
        this.noiseSynth.connect(effector.directInput);
    }

    public start(note: string) {
        if (this.isDisposed) return;
        const now = Tone.now();

        // 1. Debounce (0.1s safety)
        if (now - this.lastTriggerTime < 0.1) return;

        // 2. Avoid re-triggering same note if already playing
        if (this.isPlaying && this.currentNote === note) return;

        this.lastTriggerTime = now;

        // Release previous
        this.synth.releaseAll();

        const exactNote = ensureOctave(note, 4);
        const fifthNote = transposeSemitones(exactNote, 7);

        // Trigger root strongly, fifth weakly
        this.synth.triggerAttack(exactNote, now, 1.0);
        this.synth.triggerAttack(fifthNote, now, 0.15);

        this.currentNote = note;
        this.isPlaying = true;
    }

    public stop() {
        if (!this.isPlaying || this.isDisposed) return;
        this.synth.releaseAll();
        this.isPlaying = false;
        this.currentNote = null;
    }

    /**
     * Trigger a washing noise wave on exit
     */
    public triggerExitEffect() {
        if (this.isDisposed) return;
        this.noiseSynth.triggerAttackRelease("2n", Tone.now(), 0.2);
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.stop();
        this.synth.dispose();
        this.filter.dispose();
        this.lfo.dispose();
        this.noiseSynth.dispose();
    }
}
