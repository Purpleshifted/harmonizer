/**
 * Sampler Sources - Static configurations for orchestral instruments.
 */

export const ORCHESTRA_CONFIG = {
    strings: {
        types: ['contrabass', 'cello'] as const,
        volumes: [-10, -14],
        swellTime: 4.0,
        fadeTime: 10.0,
        attack: 5.0,
        release: 12.0,
        staggerSeconds: 0.3,
    },
    horns: {
        type: 'french-horn' as const,
        /** dB – subtle, distant presence alongside strings */
        volume: -8,
        biteVelocity: 0.85,
        attack: 5.0,
        release: 12.0,
        staggerAfterStrings: 0.35,
    },
    /** Only fade out orchestra after this many seconds in edge/node (keeps sound when briefly leaving face) */
    leaveFaceDelaySec: 5,
    /** When fading out after leave delay, use this long fade (very gradual) */
    leaveFaceFadeOutSec: 18,
};

export const WAVE_SAMPLER_CONFIG = {
    path: '/samples/wave/843316__loredenii__stereo-waterfall-recording-natural-audio-for-audiovisual-productions.wav',
    period: 8.0,
    duration: 3.0,
    baseVolume: 0.06,
    refDistance: 12,
    maxDistance: 80,
    rolloffFactor: 0.9,
    useHRTF: true
};