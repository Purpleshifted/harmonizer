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
        reTriggerInterval: 6000, // Increased to 6s for grand orchestral overlap
        lookAhead: 0.1,          // Reduced from 0.3 to improve interaction 'feel'
        ppq: 96,                 // Pulse Per Quarter resolution
    },

    // 2. Transition Profiles (seconds)
    transitions: {
        face: {
            master: 5.0,
            strings: 5.0,
            horns: 4.0,
            astral: 4.0
        },
        edge: {
            master: 2.0,
            arp: 2.5
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
            baseVolume: -20,  // dB
            hornsVolume: 15,  // dB
            centerVolume: 10, // dB
            astralVolume: 10,   // dB
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
            maxVolume: 0.5,
            reverbSend: 0.7
        }
    },


    calculateVolumes: (mode: 'face' | 'edge' | 'node', dist: number) => {
        const config = AudioConfig.mix;

        // Base volumes that always exist to some degree
        const mix = {
            drone: config.drone.volume * 0.8,
            chord: 0,
            arp: 0,
            focus: 0,
            wave: config.wave.maxVolume * 0.5
        };

        // 1. Drone logic (always present, but shifts)
        mix.drone = config.drone.volume * (0.5 + 0.5 * dist);

        // 2. Chord / Orchestral (Face) - Keep a 'tail' even in other modes
        const baseChordGain = Tone.dbToGain(config.chord.baseVolume);
        if (mode === 'face') {
            mix.chord = baseChordGain * (1 - dist * 0.4);
        } else {
            // Presence tail when near but not inside a face
            mix.chord = baseChordGain * 0.15;
        }

        // 3. Arpeggiator (Edge)
        const baseArpGain = Tone.dbToGain(config.arp.volume);
        if (mode === 'edge') {
            mix.arp = baseArpGain;
        } else if (mode === 'face') {
            mix.arp = baseArpGain * 0.2; // Subtle sparkles in face mode
        }

        // 4. Focus Pad (Node)
        const baseFocusGain = Tone.dbToGain(config.focus.volume);
        if (mode === 'node') {
            mix.focus = baseFocusGain;
        } else {
            mix.focus = baseFocusGain * 0.3; // Ghostly presence
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
