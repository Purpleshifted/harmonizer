export const AudioConfig = {
    // Master Output
    master: {
        volume: 0, // dB
        limiterThreshold: -2 // dB
    },

    // Global Reverbs & Delays
    reverb: {
        spatial: {
            decay: 4.0,
            preDelay: 0.1,
            wet: 0.5 // Base wetness
        },
        deep: {
            decay: 10.0,
            preDelay: 0.2,
            wet: 0.7
        },
        delay: {
            feedback: 0.3,
            wet: 0.25
        }
    },

    // Mix Levels (Volumes in relative linear gain 0-1 or dB where specified)
    // These should act as valid starting points for ChannelStrips
    mix: {
        drone: {
            volume: 0.6, // Linear target
            reverbSend: 0.5
        },
        chord: {
            baseVolume: -6, // dB
            hornsVolume: -4, // dB
            centerVolume: -8, // dB
            astralVolume: -12, // dB
            reverbSend: 0.3,
            deepSend: 0.2
        },
        arp: {
            volume: -2, // Boosted for clarity
            spatialSend: 0.4,
            deepSend: 0.1
        },
        focus: {
            volume: -4, // Boosted to match Astral Pad intensity
            deepSend: 0.5
        },
        wave: {
            maxVolume: 0.8, // Linear
            reverbSend: 0.7
        }
    },

    // Spatial Audio Settings
    spatial: {
        rolloff: 1.0,
        refDistance: 2,
        maxDistance: 50,
        panningModel: 'HRTF' as PanningModelType // or 'equalpower'
    }
};
