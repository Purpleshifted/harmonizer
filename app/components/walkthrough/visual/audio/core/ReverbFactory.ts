/**
 * Reverb presets and factory functions
 * 
 * Reverb Placement Guide:
 * - AMBIENT: Background drones, subtle presence
 * - SPATIAL: 3D positioned sounds (after panner)
 * - DEEP: Astral/ethereal layers, long tails
 * - WAVE: Ocean/atmospheric effects
 * - CONVOLUTION: Real space simulation (IR-based)
 */

import * as Tone from 'tone';

export type ReverbPreset = 'ambient' | 'spatial' | 'deep' | 'wave' | 'room';

interface ReverbConfig {
    decay: number;
    wet: number;
    preDelay?: number;
}

const REVERB_PRESETS: Record<ReverbPreset, ReverbConfig> = {
    ambient: {
        decay: 4,
        wet: 0.25,
    },
    spatial: {
        decay: 3,
        wet: 0.4,
    },
    deep: {
        decay: 6,
        wet: 0.8,
        preDelay: 0.2,
    },
    wave: {
        decay: 6,
        wet: 0.7,
        preDelay: 0.15,
    },
    room: {
        decay: 2,
        wet: 0.3,
    },
};

/**
 * Create a reverb with a preset configuration
 */
export function createReverb(preset: ReverbPreset): Tone.Reverb {
    const config = REVERB_PRESETS[preset];
    return new Tone.Reverb({
        decay: config.decay,
        wet: config.wet,
        preDelay: config.preDelay ?? 0,
    });
}

/**
 * Create a custom reverb
 */
export function createCustomReverb(config: ReverbConfig): Tone.Reverb {
    return new Tone.Reverb({
        decay: config.decay,
        wet: config.wet,
        preDelay: config.preDelay ?? 0,
    });
}

/**
 * Create a feedback delay for echo effects
 */
export function createDelay(
    delayTime: Tone.Unit.Time = "8n.",
    feedback = 0.3,
    wet = 0.4
): Tone.FeedbackDelay {
    return new Tone.FeedbackDelay({
        delayTime,
        feedback,
        wet,
    });
}

/**
 * Recommended reverb placement per audio layer:
 * 
 * | Layer            | Reverb Type | Placement                    |
 * |------------------|-------------|------------------------------|
 * | AmbientDrone     | ambient     | After panner, before master  |
 * | ChordPlayer      |             |                              |
 * |   - Spatial      | spatial     | After panner                 |
 * |   - Center       | spatial     | Direct to master             |
 * |   - Astral       | deep        | After delay                  |
 * | Arpeggiator      |             |                              |
 * |   - T1 (Bass)    | deep        | After panner                 |
 * |   - T2 (Sparkle) | spatial     | After panner                 |
 * | FocusPad         | deep        | After filter                 |
 * | WaveEffect       | wave        | After gain (end of chain)    |
 * 
 * For Convolution Reverb (IR-based):
 * - Best for: WaveEffect, transition effects, "being in a space"
 * - Load IR files from /public/ir/ folder
 * - Use Tone.Convolver or reverb.js
 */
