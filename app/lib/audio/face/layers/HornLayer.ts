import * as Tone from 'tone';
import * as THREE from 'three';
import { ensureOctave } from '../../core/NoteUtils';
import { Spatializer } from '../engine/Spatializer';
import { SeamRemover } from '../engine/SeamRemover';
import { Fader } from '../engine/Fader';
import { loadInstrument } from '../factory/InstrumentFactory';

class HornVoice {
    private spatializer: Spatializer;
    private fader: Fader;
    private samplerA: Tone.Sampler;
    private samplerB: Tone.Sampler;
    private seamRemover: SeamRemover;

    public currentNote: string | null = null;
    public isAllocated = false;

    constructor(destination: Tone.ToneAudioNode) {
        this.spatializer = new Spatializer({ refDist: 2, maxDist: 30 });
        this.fader = new Fader(0);
        this.samplerA = loadInstrument('french-horn');
        this.samplerB = loadInstrument('french-horn');
        this.samplerA.volume.value = -2;
        this.samplerB.volume.value = -2;

        this.samplerA.connect(this.spatializer.panner);
        this.samplerB.connect(this.spatializer.panner);
        this.spatializer.connect(this.fader.gain);
        this.fader.connect(destination);

        this.seamRemover = new SeamRemover(this.samplerA, this.samplerB);
    }

    public activate(note: string, pos: THREE.Vector3, now: number) {
        this.currentNote = note;
        this.isAllocated = true;
        this.spatializer.update(pos, 0);

        const hornNote = ensureOctave(note, 3);
        if (this.samplerA.loaded) {
            this.samplerA.triggerAttack(hornNote, now, 0.8);
        }

        this.fader.rampTo(0.6, 2.0, now);
    }

    public deactivate(now: number) {
        this.isAllocated = false;
        const note = this.currentNote;
        this.currentNote = null;
        this.fader.rampTo(0, 1.0, now);

        setTimeout(() => {
            if (!this.isAllocated && note) {
                this.seamRemover.releaseAll(ensureOctave(note, 3), now);
            }
        }, 1200);
    }

    public sustainLoop(now: number) {
        if (!this.isAllocated || !this.currentNote) return;
        this.seamRemover.sustainOverlap(ensureOctave(this.currentNote, 3), now, 0.6);
    }

    public dispose() {
        this.spatializer.dispose();
        this.fader.dispose();
        this.samplerA.dispose();
        this.samplerB.dispose();
    }
}

export class HornLayer {
    private pool: HornVoice[] = [];
    private activeMap: Map<string, HornVoice> = new Map();
    private readonly MAX_VOICES = 4;

    constructor(destination: Tone.ToneAudioNode) {
        for (let i = 0; i < this.MAX_VOICES; i++) {
            this.pool.push(new HornVoice(destination));
        }
    }

    public update(notes: string[], positions: THREE.Vector3[]) {
        const now = Tone.now();
        const nextNotes = new Set(notes.map(n => ensureOctave(n, 3)));

        // Remove obsolete
        for (const [note, voice] of this.activeMap) {
            if (!nextNotes.has(note)) {
                voice.deactivate(now);
                this.activeMap.delete(note);
            }
        }

        // Add new
        notes.forEach((rawNote, i) => {
            const note = ensureOctave(rawNote, 3);
            if (!this.activeMap.has(note)) {
                const freeVoice = this.pool.find(v => !v.isAllocated);
                if (freeVoice) {
                    const pos = positions[i] || new THREE.Vector3();
                    freeVoice.activate(note, pos, now);
                    this.activeMap.set(note, freeVoice);
                }
            }
        });
    }

    public sustainLoop(now: number) {
        this.activeMap.forEach(voice => voice.sustainLoop(now));
    }

    public stop() {
        const now = Tone.now();
        this.activeMap.forEach(v => v.deactivate(now));
        this.activeMap.clear();
    }

    public dispose() {
        this.pool.forEach(v => v.dispose());
        this.activeMap.clear();
    }
}
