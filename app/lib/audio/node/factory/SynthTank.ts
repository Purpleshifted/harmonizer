import * as Tone from 'tone';

/**
 * SynthTank - Source definitions for Node mode
 */
export class SynthTank {
    /**
     * Lush pad using FatOscillator for width
     */
    static createPadSynth() {
        const synth = new Tone.PolySynth(Tone.Synth);
        synth.set({
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
            volume: -6
        });
        return synth;
    }

    /**
     * Bell-like mono synth for surrounding tones
     */
    static createBellSynth() {
        return new Tone.Synth({
            oscillator: { type: 'sine' },
            envelope: {
                attack: 0.005,
                decay: 1.2,
                sustain: 0,
                release: 1.2,
            },
            volume: -12
        });
    }

    /**
     * Noise source for exit transitions
     */
    static createExitNoise() {
        return new Tone.NoiseSynth({
            noise: { type: 'pink', playbackRate: 0.5 },
            envelope: {
                attack: 0.5,
                decay: 2,
                sustain: 0,
                release: 2,
            },
        });
    }
}
