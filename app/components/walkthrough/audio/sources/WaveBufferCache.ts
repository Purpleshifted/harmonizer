/**
 * Cache for the wave loop buffer used by WaveEffectWorklet.
 * Generates a short loopable buffer (filtered noise) if no URL is loaded.
 */

const SAMPLE_RATE = 48000;
const DURATION_SEC = 4;
const LENGTH = SAMPLE_RATE * DURATION_SEC;

let cached: { channel0: Float32Array; channel1: Float32Array; length: number; sampleRate: number } | null = null;

/** Brown/pink-ish noise for wave texture */
function generateLoopBuffer(): { channel0: Float32Array; channel1: Float32Array; length: number; sampleRate: number } {
    const channel0 = new Float32Array(LENGTH);
    const channel1 = new Float32Array(LENGTH);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < LENGTH; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        const sample = (b0 + b1 + b2) / 3 * 0.4;
        channel0[i] = sample;
        channel1[i] = sample * 0.98;
    }
    return { channel0, channel1, length: LENGTH, sampleRate: SAMPLE_RATE };
}

export function getCachedWaveBuffer(): { channel0: Float32Array; channel1: Float32Array; length: number; sampleRate: number } | null {
    if (cached) return cached;
    cached = generateLoopBuffer();
    return cached;
}

export async function preloadWaveBuffer(_context?: BaseAudioContext): Promise<void> {
    getCachedWaveBuffer();
}
