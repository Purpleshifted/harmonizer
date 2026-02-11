/**
 * FocusPad - A lush, pulsating synth pad for Node mode
 * Creates a "wobbling" atmospheric sound focused on the current node
 * (Module refreshed)
 */

import * as Tone from 'tone';
import { ensureOctave, transposeSemitones } from '../core/NoteUtils';
import { createReverb } from '../core/ReverbFactory';

export class NodeFocusPad {
    private synth: Tone.PolySynth;
    private filter: Tone.Filter;
    private lfo: Tone.LFO;
    private volume: Tone.Volume;
    private deepReverb: Tone.Reverb;
    private dryGain: Tone.Gain;
    private sendGain: Tone.Gain;
    private isPlaying = false;
    private currentNote: string | null = null;
    private isDisposed = false;

    constructor(sharedDeepReverb: Tone.Reverb) {
        // Lush pad using FatOscillator for width
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
        });

        // Filter with LFO modulation for "wobbling" effect
        this.filter = new Tone.Filter({
            type: 'lowpass',
            frequency: 400,
            Q: 1
        });

        // Slow LFO (breathing effect)
        this.lfo = new Tone.LFO({
            frequency: 0.2,
            min: 300,
            max: 800,
            type: 'sine'
        }).start();
        this.lfo.connect(this.filter.frequency);

        // Deep reverb for node mode
        this.deepReverb = sharedDeepReverb;

        // Volume control
        this.volume = new Tone.Volume(-10);

        // Split Architecture
        this.dryGain = new Tone.Gain(0.5).toDestination();
        this.sendGain = new Tone.Gain(0.5).connect(this.deepReverb);

        this.synth.connect(this.filter);
        // Filter -> Volume (to control both dry/wet fade) -> Split
        this.filter.connect(this.volume);
        this.volume.connect(this.dryGain);
        this.volume.connect(this.sendGain);

        this.synth.maxPolyphony = 12;

        // Wave/Noise Synth for exit transition
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
        this.noiseSynth.connect(this.volume); // Shared volume path -> Split
    }

    private noiseSynth: Tone.NoiseSynth;

    triggerExitEffect() {
        if (this.isDisposed) return;
        // Trigger a washing noise wave
        this.noiseSynth.triggerAttackRelease("2n", Tone.now(), 0.2); // Low velocity
    }

    /**
     * Set global volume mix (0 to 1)
     */
    setGlobalVolume(volume: number, rampTime: number = 0.1) {
        if (this.isDisposed) return;

        // Convert linear (0-1) to dB (-60 to 0)
        // Use a floor to avoid -Infinity
        const targetDb = volume < 0.01 ? -60 : 20 * Math.log10(volume);
        this.volume.volume.rampTo(targetDb, rampTime);

        this.isPlaying = volume > 0.01;
    }

    // Throttling
    private lastTriggerTime = 0;

    start(note: string) {
        if (this.isDisposed) return;

        const now = Tone.now();

        // If already playing this note, do nothing
        if (this.isPlaying && this.currentNote === note) return;

        // Debounce triggers (0.1s safety)
        if (now - this.lastTriggerTime < 0.1) return;
        this.lastTriggerTime = now;

        // If playing another note, release it
        if (this.isPlaying) {
            this.synth.releaseAll();
        }

        const exactNote = ensureOctave(note, 4);
        const fifthNote = transposeSemitones(exactNote, 7);

        // Trigger root strongly, fifth weakly
        this.synth.triggerAttack(exactNote, Tone.now(), 1.0);
        this.synth.triggerAttack(fifthNote, Tone.now(), 0.15);

        this.volume.volume.rampTo(0, 1.5);

        this.currentNote = note;
        this.isPlaying = true;
    }

    stop() {
        if (!this.isPlaying || this.isDisposed) return;

        this.volume.volume.rampTo(-40, 1.5);
        this.synth.releaseAll();

        this.isPlaying = false;
        this.currentNote = null;
    }

    dispose() {
        this.isDisposed = true;
        this.stop();
        this.synth.dispose();
        this.filter.dispose();
        this.lfo.dispose();
        // Shared reverb - do not dispose
        this.dryGain.dispose();
        this.sendGain.dispose();
        this.volume.dispose();
    }
}
