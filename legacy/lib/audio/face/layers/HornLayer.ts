import * as Tone from 'tone';
import * as THREE from 'three';
import { ensureOctave } from '../../../../../app/lib/audio/utils/NoteUtils';
import { createSpatialPanner, updatePannerPosition } from '../../../../../app/lib/audio/utils/SpatialAudio';
import { SeamRemover } from '../../../../../app/lib/audio/engine/SeamRemover';
import { Fader } from '../../../../../app/lib/audio/engine/Fader';
import { loadInstrument } from '../../../../../app/lib/audio/sources/InstrumentFactory';

class HornVoice {
    private spatializer: Tone.Panner3D;
    private fader: Fader;
    private samplerA: Tone.Sampler;
    private samplerB: Tone.Sampler;
    private seamRemover: SeamRemover;
    private readonly zeroVector = new THREE.Vector3();

    public currentNote: string | null = null;
    public isAllocated = false;

    constructor(destination: Tone.ToneAudioNode) {
        this.spatializer = createSpatialPanner({ useHRTF: false, refDistance: 2, maxDistance: 30 });
        this.fader = new Fader(0);
        this.samplerA = loadInstrument('french-horn');
        this.samplerB = loadInstrument('french-horn');
        this.samplerA.volume.value = -2;
        this.samplerB.volume.value = -2;

        this.samplerA.connect(this.spatializer);
        this.samplerB.connect(this.spatializer);
        this.spatializer.connect(this.fader.gain);
        this.fader.connect(destination);

        this.seamRemover = new SeamRemover(this.samplerA, this.samplerB);
    }

    public activate(note: string, pos: THREE.Vector3, time: number) {
        this.currentNote = note;
        this.isAllocated = true;
        updatePannerPosition(this.spatializer, pos, 0);

        const hornNote = ensureOctave(note, 3);
        if (this.samplerA.loaded) {
            this.samplerA.triggerAttack(hornNote, time, 0.8);
        }

        this.fader.rampTo(0.6, 2.0, time);
    }

    public deactivate(time: number) {
        this.isAllocated = false;
        const note = this.currentNote;
        this.currentNote = null;
        this.fader.rampTo(0, 4.0, time);

        // USE Tone.getContext().setTimeout for better accuracy across threads
        (Tone.getContext() as any).setTimeout(() => {
            if (!this.isAllocated && note) {
                this.seamRemover.releaseAll(ensureOctave(note, 3), Tone.now());
            }
        }, 4.2); // Context timeout uses seconds
    }

    public sustainLoop(time: number) {
        if (!this.isAllocated || !this.currentNote) return;
        this.seamRemover.sustainOverlap(ensureOctave(this.currentNote, 3), time, 0.6);
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
    private readonly zeroPoolVector = new THREE.Vector3();

    constructor(destination: Tone.ToneAudioNode) {
        for (let i = 0; i < this.MAX_VOICES; i++) {
            this.pool.push(new HornVoice(destination));
        }
    }

    public update(notes: string[], positions: THREE.Vector3[], time: number) {
        const nextNotes = new Set(notes.map(n => ensureOctave(n, 3)));

        // Remove obsolete
        for (const [note, voice] of this.activeMap) {
            if (!nextNotes.has(note)) {
                voice.deactivate(time);
                this.activeMap.delete(note);
            }
        }

        // Add new
        notes.forEach((rawNote, i) => {
            const note = ensureOctave(rawNote, 3);
            if (!this.activeMap.has(note)) {
                const freeVoice = this.pool.find(v => !v.isAllocated);
                if (freeVoice) {
                    const pos = positions[i] || (this as any).zeroPoolVector;
                    freeVoice.activate(note, pos, time);
                    this.activeMap.set(note, freeVoice);
                }
            }
        });
    }

    public sustainLoop(time: number) {
        this.activeMap.forEach(voice => voice.sustainLoop(time));
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
