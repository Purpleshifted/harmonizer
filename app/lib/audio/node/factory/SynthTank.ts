/**
 * SynthTank - Factory for creating synths in Node Mode
 * Contains definitions for Lush Pad, Bell Synth, and Noise Wash
 */

import * as Tone from 'tone';

export class SynthTank {
    /**
     * Create the main lush pad synth (PolySynth)
     */
    static createPadSynth(): Tone.PolySynth {
        const synth = new Tone.PolySynth(Tone.Synth, {
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
            volume: 0 // Will be controlled downstream
        });
        synth.maxPolyphony = 12;
        return synth;
    }

    /**
     * Create a bell-like synth (MetalSynth or FM)
     * Using FM for crystal clear, shimmering bells
     */
    static createBellSynth(): Tone.PolySynth {
        const synth = new Tone.PolySynth(Tone.FMSynth, {
            harmonicity: 3.01,
            modulationIndex: 12,
            oscillator: { type: 'sine' },
            envelope: {
                attack: 0.01,
                decay: 2.0,
                sustain: 0.1,
                release: 2.0
            },
            modulation: { type: 'square' },
            modulationEnvelope: {
                attack: 0.5,
                decay: 0.5,
                sustain: 0,
                release: 0.5
            },
            volume: -10
        });
        synth.maxPolyphony = 6;
        return synth;
    }

    /**
     * Create a Noise Synth for exit wash effects
     */
    static createNoiseSynth(): Tone.NoiseSynth {
        return new Tone.NoiseSynth({
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
            volume: -10
        });
    }
}
