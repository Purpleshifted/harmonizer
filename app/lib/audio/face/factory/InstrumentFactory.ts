/**
 * Instrument Factory - Loads sampled instruments from tonejs-instruments
 * 
 * Uses Tone.Sampler for realistic instrument sounds.
 * Samples are loaded from /public/samples/
 * 
 * CACHE: Uses shared AudioBuffer cache to prevent redundant network requests.
 */

import * as Tone from 'tone';
import { clampOctave } from '../../core/NoteUtils';
import { InstrumentName, SAMPLE_MAPS, INSTRUMENT_RANGES } from './Instruments';

// === BUFFER CACHE SYSTEM ===
// Stores loaded AudioBuffers to be reused across creating multiple Samplers
const bufferCache: Map<string, Tone.ToneAudioBuffer> = new Map();
let areSamplesLoaded = false;
let preloadPromise: Promise<void> | null = null;

/**
 * Preload all instrument samples into memory.
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
                const url = baseUrl + filename;

                if (!bufferCache.has(url)) {
                    const buffer = new Tone.ToneAudioBuffer();
                    const p = buffer.load(url)
                        .then(() => {
                            bufferCache.set(url, buffer);
                        })
                        .catch(err => {
                            console.error(`[InstrumentFactory] Failed to load ${url}:`, err);
                        });
                    loadPromises.push(p);
                }
            }
        }

        await Promise.all(loadPromises);
        areSamplesLoaded = true;
        console.log(`[InstrumentFactory] All ${bufferCache.size} samples loaded.`);
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

    const urls: Record<string, Tone.ToneAudioBuffer | string> = {};
    let allCached = true;

    for (const [note, filename] of Object.entries(sampleMap)) {
        const url = baseUrl + filename;
        if (bufferCache.has(url)) {
            urls[note] = bufferCache.get(url)!;
        } else {
            urls[note] = filename;
            allCached = false;
        }
    }

    const samplerOptions: Partial<Tone.SamplerOptions> = {
        release: 4.0,
        attack: 2.5,
        curve: 'exponential',
        urls: urls,
    };

    if (!allCached) {
        samplerOptions.baseUrl = baseUrl;
    }

    return new Tone.Sampler(samplerOptions);
}

/**
 * Create an orchestral ensemble (multiple instruments layered)
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
            return areSamplesLoaded || samplers.every(s => s.loaded);
        },

        triggerAttack(note, time, velocity = 0.8) {
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
