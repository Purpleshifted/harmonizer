/**
 * Sampler Sources - Static configurations for orchestral instruments.
 */

export const ORCHESTRA_CONFIG = {
    strings: {
        types: ['contrabass', 'cello'] as const,
        volumes: [-4, -4],
        swellTime: 4.0,
        fadeTime: 6.0
    },
    horns: {
        type: 'french-horn' as const,
        volume: -6,
        biteVelocity: 0.7
    }
};

export const WAVE_SAMPLER_CONFIG = {
    path: '/samples/wave/843316__loredenii__stereo-waterfall-recording-natural-audio-for-audiovisual-productions.wav',
    period: 10.48,
    duration: 4.0,
    baseVolume: 0.1,
    refDistance: 6,
    maxDistance: 80,
    rolloffFactor: 0.7,
    useHRTF: true
};