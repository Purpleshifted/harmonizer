/**
 * Oscillator Sources - Static configurations for synths and drones.
 * No dynamic logic here, just blueprints.
 */

export const DRONE_OSC_CONFIG = {
    type: 'sine' as const,
    baseDrive: 1.5,
    baseMix: 0.4,
    limiterThreshold: -3
};

export const ARP_SYNTH_CONFIG = {
    oscillator: { type: 'sine' as const },
    envelope: {
        attack: 0.015,
        decay: 0.4,
        sustain: 0.1,
        release: 0.8,
    },
    volume: -6
};

export const FACE_SYNTH_CONFIG = {
    oscillator: { type: 'fatsawtooth' as const, count: 3, spread: 30 },
    envelope: { attack: 1.5, decay: 1.0, sustain: 0.7, release: 1.5 },
    volume: -20
};

export const BELL_SYNTH_CONFIG = {
    harmonicity: 3.01,
    modulationIndex: 12,
    oscillator: { type: 'sine' as const },
    envelope: {
        attack: 0.01,
        decay: 2.0,
        sustain: 0.1,
        release: 2.0
    },
    modulation: { type: 'square' as const },
    modulationEnvelope: {
        attack: 0.5,
        decay: 0.5,
        sustain: 0,
        release: 0.5
    },
    volume: -10
};

export const NOISE_WASH_CONFIG = {
    noise: { type: 'pink' as const, playbackRate: 0.5 },
    envelope: { attack: 0.5, decay: 2, sustain: 0, release: 2 },
    volume: -10
};

export const NODE_SYNTH_CONFIG = {
    oscillator: { type: 'fatsawtooth' as const, count: 3, spread: 30 },
    envelope: { attack: 2.0, decay: 1.0, sustain: 1.0, release: 1.5 },
    volume: -4,
    filter: { frequency: 400, Q: 1, type: 'lowpass' as const },
    lfo: { frequency: 0.02, min: 300, max: 800, type: 'sine' as const }
};

export const ASTRAL_ARP_CONFIG = {
    oscillator: { type: 'sine' as const },
    volume: 2,
    filter: { type: 'highpass' as const, frequency: 600 }
};
