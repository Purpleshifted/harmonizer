/**
 * WaveBufferCache - Pre-decodes wave sample to avoid main-thread blocking when first needed.
 * decodeAudioData blocks the main thread; doing it during initial preload prevents
 * audio glitches when sampler effects kick in.
 */
import { WAVE_SAMPLER_CONFIG } from './Sampler';

interface CachedWave {
    channel0: Float32Array;
    channel1: Float32Array;
    length: number;
    sampleRate: number;
}

let cached: CachedWave | null = null;
let preloadPromise: Promise<CachedWave | null> | null = null;

/**
 * Preload and decode the wave buffer. Call during initial load (before user enters).
 * Uses OfflineAudioContext so it works without user gesture if needed.
 */
export async function preloadWaveBuffer(): Promise<void> {
    if (cached) return;
    if (preloadPromise) return preloadPromise as Promise<void>;

    preloadPromise = (async (): Promise<CachedWave | null> => {
        try {
            console.log('[WaveBufferCache] Preloading wave sample...');
            const res = await fetch(WAVE_SAMPLER_CONFIG.path);
            const arrayBuffer = await res.arrayBuffer();

            // Use OfflineAudioContext for decoding (works without user gesture, doesn't block playback)
            const Ctx = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : (window as any).webkitOfflineAudioContext;
            if (!Ctx) {
                console.warn('[WaveBufferCache] OfflineAudioContext not available, will decode on first use.');
                return null;
            }
            const ctx = new Ctx(1, 1, 44100);
            const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

            const ch0 = audioBuffer.getChannelData(0);
            const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;

            cached = {
                channel0: ch0.slice(0),
                channel1: ch1 === ch0 ? ch0.slice(0) : ch1.slice(0),
                length: audioBuffer.length,
                sampleRate: audioBuffer.sampleRate,
            };
            console.log('[WaveBufferCache] Wave sample preloaded.');
            return cached;
        } catch (e) {
            console.error('[WaveBufferCache] Failed to preload:', e);
            return null;
        }
    })();

    await preloadPromise;
}

/**
 * Get pre-decoded wave buffer for WaveEffectWorklet. Returns null if not yet preloaded.
 */
export function getCachedWaveBuffer(): CachedWave | null {
    return cached;
}
