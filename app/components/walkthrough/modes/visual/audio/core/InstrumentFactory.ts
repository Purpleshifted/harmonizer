/**
 * Instrument Factory - Loads sampled instruments from tonejs-instruments
 * 
 * Uses Tone.Sampler for realistic instrument sounds.
 * Samples are loaded from /public/samples/
 */

import * as Tone from 'tone';
import { clampOctave } from './NoteUtils';

export type InstrumentName = 'contrabass' | 'cello' | 'french-horn';

// Sample mappings per instrument (note -> file)
// Keys MUST be valid Tone.js notes (e.g. "A#1" not "As1")
// Values are file names (e.g. "As1.mp3")
const SAMPLE_MAPS: Record<InstrumentName, Record<string, string>> = {
    contrabass: {
        'A2': 'A2.mp3',
        'A#1': 'As1.mp3', // As -> A#
        'B3': 'B3.mp3',
        'C2': 'C2.mp3',
        'C#3': 'Cs3.mp3', // Cs -> C#
        'D2': 'D2.mp3',
        'E2': 'E2.mp3',
        'E3': 'E3.mp3',
        'F#1': 'Fs1.mp3', // Fs -> F#
        'F#2': 'Fs2.mp3',
        'G1': 'G1.mp3',
        'G#2': 'Gs2.mp3', // Gs -> G#
        'G#3': 'Gs3.mp3',
    },
    cello: {
        'A2': 'A2.mp3', 'A3': 'A3.mp3', 'A4': 'A4.mp3',
        'A#2': 'As2.mp3', 'A#3': 'As3.mp3',
        'B2': 'B2.mp3', 'B3': 'B3.mp3', 'B4': 'B4.mp3',
        'C2': 'C2.mp3', 'C3': 'C3.mp3', 'C4': 'C4.mp3', 'C5': 'C5.mp3',
        'C#3': 'Cs3.mp3', 'C#4': 'Cs4.mp3',
        'D2': 'D2.mp3', 'D3': 'D3.mp3', 'D4': 'D4.mp3',
        'D#2': 'Ds2.mp3', 'D#3': 'Ds3.mp3', 'D#4': 'Ds4.mp3',
        'E2': 'E2.mp3', 'E3': 'E3.mp3', 'E4': 'E4.mp3',
        'F2': 'F2.mp3', 'F3': 'F3.mp3', 'F4': 'F4.mp3',
        'F#3': 'Fs3.mp3', 'F#4': 'Fs4.mp3',
        'G2': 'G2.mp3', 'G3': 'G3.mp3', 'G4': 'G4.mp3',
        'G#2': 'Gs2.mp3', 'G#3': 'Gs3.mp3', 'G#4': 'Gs4.mp3',
    },
    'french-horn': {
        'A1': 'A1.mp3', 'A3': 'A3.mp3',
        'C2': 'C2.mp3', 'C4': 'C4.mp3',
        'D3': 'D3.mp3', 'D5': 'D5.mp3',
        'D#2': 'Ds2.mp3',
        'F3': 'F3.mp3', 'F5': 'F5.mp3',
        'G2': 'G2.mp3',
    }
};

// Define safe playing ranges for each instrument (to prevent playback errors)
const INSTRUMENT_RANGES: Record<InstrumentName, { min: number, max: number }> = {
    contrabass: { min: 1, max: 3 },
    cello: { min: 2, max: 5 },
    'french-horn': { min: 2, max: 5 },
};

/**
 * Load a single instrument sampler
 */
export function loadInstrument(name: InstrumentName): Tone.Sampler {
    const baseUrl = `/samples/${name}/`;
    const sampleMap = SAMPLE_MAPS[name];

    return new Tone.Sampler({
        urls: sampleMap,
        baseUrl,
        release: 4.0, // Long release for overlaps
        attack: 2.5,  // Much softer attack for orchestral swelling
        curve: 'exponential',
    });
}

/**
 * Create an orchestral ensemble (multiple instruments layered)
 * Returns a controller that automatically clamps notes to valid ranges per instrument
 */
export interface OrchestraEnsemble {
    samplers: Tone.Sampler[];
    isLoaded: boolean;
    triggerAttack: (note: string | string[], time?: Tone.Unit.Time, velocity?: number) => void;
    triggerRelease: (note: string | string[], time?: Tone.Unit.Time) => void;
    triggerAttackRelease: (note: string | string[], duration: Tone.Unit.Time, time?: Tone.Unit.Time, velocity?: number) => void;
    releaseAll: () => void;
    connect: (destination: Tone.InputNode) => void;
    dispose: () => void;
}

export function createOrchestraEnsemble(
    instruments: InstrumentName[],
    volumes: number[] = []
): OrchestraEnsemble {
    const samplers = instruments.map((name, i) => {
        const sampler = loadInstrument(name);
        sampler.volume.value = volumes[i] ?? -6;
        return sampler;
    });

    const ranges = instruments.map(name => INSTRUMENT_RANGES[name]);

    let isLoaded = false;

    // Wait for all samplers to load
    Tone.loaded().then(() => {
        isLoaded = true;
        console.log('[OrchestraEnsemble] All samples loaded');
    });

    function getClampedNote(note: string, index: number): string {
        const range = ranges[index];
        return clampOctave(note, range.min, range.max);
    }

    function processNotes(notes: string | string[], index: number): string | string[] {
        if (Array.isArray(notes)) {
            return notes.map(n => getClampedNote(n, index));
        }
        return getClampedNote(notes, index);
    }

    return {
        samplers,
        get isLoaded() { return isLoaded; },

        triggerAttack(note, time, velocity = 0.8) {
            if (!isLoaded) return; // Wait for samples to load
            samplers.forEach((s, i) => {
                s.triggerAttack(processNotes(note, i), time, velocity);
            });
        },

        triggerRelease(note, time) {
            samplers.forEach((s, i) => {
                s.triggerRelease(processNotes(note, i), time);
            });
        },

        triggerAttackRelease(note, duration, time, velocity = 0.8) {
            samplers.forEach((s, i) => {
                s.triggerAttackRelease(processNotes(note, i), duration, time, velocity);
            });
        },

        releaseAll() {
            samplers.forEach(s => s.releaseAll());
        },

        connect(destination) {
            samplers.forEach(s => s.connect(destination));
        },

        dispose() {
            samplers.forEach(s => s.dispose());
        }
    };
}
