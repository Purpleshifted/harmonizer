/**
 * ArpSoundPresets - Mode-specific synthesis params for the Arp Engine (FM/sine, envelope, duration).
 * Injected into the arp-engine AudioWorklet via setSoundPreset; maps to diagram: Sound Presets.
 */

export type ArpMode = 'node' | 'edge' | 'face';

export interface ArpSoundPreset {
    /** Oscillator type: 'sine' or 'fm' */
    type: 'sine' | 'fm';
    /** FM only: carrier/mod ratio */
    harmonicity?: number;
    /** FM only: modulation depth */
    modulationIndex?: number;
    /** Envelope attack in ms */
    attack?: number;
    /** Envelope decay in ms */
    decay?: number;
    /** Envelope sustain level (0–1) */
    sustain?: number;
    /** Envelope release in ms */
    release?: number;
    /** Note duration in seconds */
    duration?: number;
}

/** Node: EdgeArpeggiator와 동일 - 글로켄슈필 (ARP_SYNTH_CONFIG) */
export const NODE_SOUND_PRESET: ArpSoundPreset = {
    type: 'sine',
    attack: 10,
    decay: 2000,
    sustain: 0.2,
    release: 2000,
    duration: 0.5,
};

/** Edge: sine, short pluck */
export const EDGE_SOUND_PRESET: ArpSoundPreset = {
    type: 'sine',
    attack: 15,
    decay: 400,
    sustain: 0.1,
    release: 800,
    duration: 0.125,
};

/** Face: sine, medium envelope */
export const FACE_SOUND_PRESET: ArpSoundPreset = {
    type: 'sine',
    attack: 120,
    decay: 340,
    sustain: 0.25,
    release: 800,
    duration: 0.75,
};

export const ARP_SOUND_PRESETS: Record<ArpMode, ArpSoundPreset> = {
    node: NODE_SOUND_PRESET,
    edge: EDGE_SOUND_PRESET,
    face: FACE_SOUND_PRESET,
};
