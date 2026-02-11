/**
 * Instrument Factory - Loads sampled instruments from tonejs-instruments
 * 
 * Uses Tone.Sampler for realistic instrument sounds.
 * Samples are loaded from /public/samples/
 * 
 * OPTIMIZED: Uses shared AudioBuffer cache to prevent redundant network requests.
 * REFACTORED: Implements strict preloading to ensure smooth playback.
 */

import * as Tone from 'tone';
import { clampOctave } from './NoteUtils';

export type InstrumentName = 'contrabass' | 'cello' | 'french-horn';

// Sample mappings per instrument (note -> file)
const SAMPLE_MAPS: Record<InstrumentName, Record<string, string>> = {
    contrabass: {
        'A2': 'A2.mp3',
        'A#1': 'As1.mp3',
        'B3': 'B3.mp3',
        'C2': 'C2.mp3',
        'C#3': 'Cs3.mp3',
        'D2': 'D2.mp3',
        'E2': 'E2.mp3',
        'E3': 'E3.mp3',
        'F#1': 'Fs1.mp3',
        'F#2': 'Fs2.mp3',
        'G1': 'G1.mp3',
        'G#2': 'Gs2.mp3',
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

const INSTRUMENT_RANGES: Record<InstrumentName, { min: number, max: number }> = {
    contrabass: { min: 1, max: 3 },
    cello: { min: 2, max: 5 },
    'french-horn': { min: 2, max: 5 },
};

// === BUFFER CACHE SYSTEM ===
// Stores loaded AudioBuffers to be reused across creating multiple Samplers
const bufferCache: Map<string, Tone.ToneAudioBuffer> = new Map();
let areSamplesLoaded = false;
let preloadPromise: Promise<void> | null = null;

/**
 * Preload all instrument samples into memory.
 * Call this once at app startup.
 */
export async function preloadInstruments(): Promise<void> {
    if (areSamplesLoaded) return;
    if (preloadPromise) return preloadPromise;

    console.log('[InstrumentFactory] Starting sample preload...');

    const loadTask = async () => {
        const loadPromises: Promise<void>[] = [];

        for (const [instrumentKey, map] of Object.entries(SAMPLE_MAPS)) {
            const instrument = instrumentKey as InstrumentName;
            const baseUrl = `/samples/${instrument}/`;

            for (const [note, filename] of Object.entries(map)) {
                // Construct the full URL for the sample
                const url = baseUrl + filename;

                if (!bufferCache.has(url)) {
                    // Create a Tone.Buffer explicitly
                    const buffer = new Tone.ToneAudioBuffer();

                    // Helper to load
                    const p = buffer.load(url)
                        .then(() => {
                            bufferCache.set(url, buffer);
                            // Optional: Progress log
                        })
                        .catch(err => {
                            console.error(`[InstrumentFactory] Failed to load ${url}:`, err);
                            // We don't throw here to allow partial loading, 
                            // but playback might be missing notes.
                        });
                    loadPromises.push(p);
                }
            }
        }

        await Promise.all(loadPromises);
        areSamplesLoaded = true;
        console.log(`[InstrumentFactory] All ${bufferCache.size} samples loaded successfully.`);
    };

    preloadPromise = loadTask();
    return preloadPromise;
}

/**
 * Load a single instrument sampler using CACHED buffers
 */
export function loadInstrument(name: InstrumentName): Tone.Sampler {
    const baseUrl = `/samples/${name}/`;
    const sampleMap = SAMPLE_MAPS[name];

    // Construct url map using buffers if available
    const urls: Record<string, Tone.ToneAudioBuffer | string> = {};
    let allCached = true;

    for (const [note, filename] of Object.entries(sampleMap)) {
        const url = baseUrl + filename;
        if (bufferCache.has(url)) {
            // Use cached buffer directly implies NO network request
            urls[note] = bufferCache.get(url)!;
        } else {
            // Fallback (Should not happen if preloaded)
            urls[note] = filename;
            allCached = false;
        }
    }

    // Config for sampler
    const samplerOptions: Partial<Tone.SamplerOptions> = {
        release: 4.0,
        attack: 2.5,
        curve: 'exponential',
        urls: urls,
    };

    // Only set baseUrl if we are NOT using buffers exclusively
    if (!allCached) {
        samplerOptions.baseUrl = baseUrl;
    }

    const sampler = new Tone.Sampler(samplerOptions);
    return sampler;
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
        get isLoaded() {
            // If buffers are cached, Sampler is ready practically immediately.
            // Tone.Sampler with buffers doesn't need to 'load'.
            return areSamplesLoaded || samplers.every(s => s.loaded);
        },

        triggerAttack(note, time, velocity = 0.8) {
            // Strict check: if not loaded, don't play (silence).
            // But if we used cached buffers, it IS loaded.
            if (!this.isLoaded) return;
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
            if (!this.isLoaded) return;
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
