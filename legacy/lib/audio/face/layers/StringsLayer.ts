import * as Tone from 'tone';
import * as THREE from 'three';
import { createSpatialPanner, updatePannerPosition } from '../../../../../app/lib/audio/utils/SpatialAudio';
import { Fader } from '../../../../../app/lib/audio/engine/Fader';
import { createOrchestraEnsemble, OrchestraEnsemble } from '../../../../../app/lib/audio/sources/InstrumentFactory';
import { ensureOctave } from '../../../../../app/lib/audio/utils/NoteUtils';

class StringsVoice {
    public ensemble: OrchestraEnsemble;
    public fader: Fader;
    public spatializer: Tone.Panner3D;
    public currentNote: string | null = null;
    public isAllocated = false;
    private isDisposed = false;

    constructor(destination: Tone.ToneAudioNode) {
        this.spatializer = createSpatialPanner({ useHRTF: false, refDistance: 5, maxDistance: 50 });
        this.fader = new Fader(0);
        this.ensemble = createOrchestraEnsemble(['contrabass', 'cello'], [-4, -4]);

        this.ensemble.connect(this.fader.gain);
        this.fader.connect(this.spatializer);
        this.spatializer.connect(destination);
    }

    public activate(note: string, position: THREE.Vector3, time: number, velocity: number) {
        this.currentNote = note;
        this.isAllocated = true;
        updatePannerPosition(this.spatializer, position, 0);

        const SWELL_TIME = 4.0;
        this.fader.rampTo(0.8, SWELL_TIME, time);
        this.ensemble.triggerAttack(note, time, velocity);
    }

    public deactivate(time: number) {
        this.isAllocated = false;
        const note = this.currentNote;
        this.currentNote = null;

        const FADE_OUT_TIME = 6.0;
        this.fader.rampTo(0, FADE_OUT_TIME, time);

        (Tone.getContext() as any).setTimeout(() => {
            if (!this.isAllocated && note && !this.isDisposed) {
                this.ensemble.releaseAll();
            }
        }, FADE_OUT_TIME + 0.5);
    }

    public updatePosition(position: THREE.Vector3) {
        updatePannerPosition(this.spatializer, position, 1.0);
    }

    public stop() {
        this.isAllocated = false;
        this.currentNote = null;
        this.ensemble.releaseAll();
        this.fader.setValue(0);
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.ensemble.dispose();
        this.fader.dispose();
        this.spatializer.dispose();
    }
}

export class StringsLayer {
    private voicePool: StringsVoice[] = [];
    private activeMap: Map<string, StringsVoice> = new Map();
    private readonly MAX_VOICES = 6;
    private isDisposed = false;
    private outputFader: Fader;

    constructor(destination: Tone.ToneAudioNode) {
        this.outputFader = new Fader(1.0);
        this.outputFader.connect(destination);

        for (let i = 0; i < this.MAX_VOICES; i++) {
            this.voicePool.push(new StringsVoice(this.outputFader.gain));
        }
    }

    /**
     * Tone Tie Implementation:
     * Sustains common notes and triggers only new ones.
     */
    public trigger(notes: string[], isLoop: boolean, time: number) {
        if (this.isDisposed) return;

        const nextNotes = new Set(notes.map(n => ensureOctave(n, 3)));
        const velocity = isLoop ? 0.4 : 0.8; // New notes get higher velocity (Lead)

        // 1. Release notes that are no longer in the chord
        for (const [note, voice] of this.activeMap) {
            if (!nextNotes.has(note)) {
                voice.deactivate(time);
                this.activeMap.delete(note);
            }
        }

        // 2. Trigger new notes or reinforce common ones
        notes.forEach((rawNote, i) => {
            const note = ensureOctave(rawNote, 3);

            if (!this.activeMap.has(note)) {
                // ADDED note: Find a free voice
                const voice = this.voicePool.find(v => !v.isAllocated);
                if (voice) {
                    // Position is usually relative to triangle, assuming default for now
                    // Positions update will follow in updatePosition
                    voice.activate(note, new THREE.Vector3(), time, velocity);
                    this.activeMap.set(note, voice);
                }
            } else {
                // COMMON note (Tone Tie): Just keep it playing
                // Optional: subtle reinforcement if it's a loop
                if (isLoop) {
                    // this.activeMap.get(note)!.ensemble.triggerAttack(note, time, 0.2);
                }
            }
        });
    }

    public updatePosition(positions: THREE.Vector3[]) {
        if (this.isDisposed) return;

        // Update each active voice's position based on its note index in the original chord
        // This gives each note in the chord its own spatial point
        Array.from(this.activeMap.values()).forEach((voice, i) => {
            const pos = positions[i % positions.length];
            if (pos) voice.updatePosition(pos);
        });
    }

    public setVolume(scale: number, rampTime: number, time: number) {
        this.outputFader.rampTo(scale, rampTime, time);
    }

    public stop() {
        this.activeMap.forEach(v => v.stop());
        this.activeMap.clear();
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.voicePool.forEach(v => v.dispose());
        this.outputFader.dispose();
    }
}
