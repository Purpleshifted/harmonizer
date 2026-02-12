import * as Tone from 'tone';

/**
 * AudioConfig - Centralized Configuration for the Tonnetz Audio Engine
 * 
 * Manage mixing ratios, timing constants, and spatial parameters here.
 */
export const AudioConfig = {
    // 1. Timing & Global State
    timing: {
        fadeTime: 1.2,           // General crossfade time between modes
        reTriggerInterval: 200, // Interval for orchestral re-triggering (ms)
        lookAhead: 0.3,          // Scheduling lookahead (s)
        ppq: 96,                 // Pulse Per Quarter resolution
    },

    // 2. Transition Profiles (seconds)
    transitions: {
        face: {
            master: 1.2,
            strings: 2.5,
            horns: 1.2,
            astral: 2.5
        },
        edge: {
            master: 1.5,
            arp: 1.5
        },
        node: {
            master: 2.0,
            focus: 3.0
        },
        global: {
            ambient: 2.0,
            wave: 1.5
        }
    },

    // 2. Mix Recipes (Volume & Sends)
    mix: {
        drone: {
            volume: 0.6,
            reverbSend: 0.5
        },
        chord: {
            baseVolume: -25,  // dB
            hornsVolume: 5,  // dB
            centerVolume: 10, // dB
            astralVolume: 2,   // dB
            reverbSend: 0.3,
            deepSend: 0.2
        },
        arp: {
            volume: -2,
            spatialSend: 0.4,
            deepSend: 0.1
        },
        focus: {
            volume: -4,
            deepSend: 0.5
        },
        wave: {
            maxVolume: 0.8,
            reverbSend: 0.7
        }
    },


    calculateVolumes: (mode: 'face' | 'edge' | 'node', dist: number) => {
        const mix = {
            drone: 0,
            chord: 0,
            arp: 0,
            focus: 0,
            wave: 0
        };

        const config = AudioConfig.mix;

        switch (mode) {
            case 'face':
                mix.drone = config.drone.volume * (0.4 + 0.6 * dist);
                mix.chord = Tone.dbToGain(config.chord.baseVolume) * (1 - dist * 0.5);
                mix.wave = 0.3;
                break;
            case 'edge':
                mix.drone = config.drone.volume * 0.8;
                mix.arp = Tone.dbToGain(config.arp.volume);
                mix.wave = config.wave.maxVolume * 0.4;
                break;
            case 'node':
                mix.drone = config.drone.volume * 0.2;
                mix.focus = Tone.dbToGain(config.focus.volume);
                mix.wave = config.wave.maxVolume * 0.5;
                break;
        }
        return mix;
    },

    // 4. Spatial Parameters
    spatial: {
        refDistance: 2,
        maxDistance: 40,
        rolloffFactor: 1.0,
        updateInterval: 60, // ms
    },

    // 5. Polyphony Clamping
    polyphony: {
        centerSynth: 8,
        astralArp: 12,
        arpeggiator: 7, // matches MAX_VOICES
        nodeFocus: 6,
    }
};
