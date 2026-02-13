/**
 * SurroundingTones - Creates intermittent, spatialized bell sparkles around the central node
 * (Randomly picks one of the 6 surrounding notes to play)
 */

import * as Tone from 'tone';
import * as THREE from 'three';
import { ensureOctave } from '../../../../../app/lib/audio/utils/NoteUtils';
import { SynthTank } from '../factory/SynthTank';
import { Spatializer } from '../engine/Spatializer';
import { Effector } from '../engine/Effectors';

export class SurroundingTones {
    private synth: Tone.PolySynth;
    private spatializer: Spatializer;
    private isPlaying = false;
    private isDisposed = false;

    // Candidates state
    private candidates: { note: string, pos: THREE.Vector3 }[] = [];
    private loop: Tone.Loop;

    constructor() {
        this.synth = SynthTank.createBellSynth();
        this.spatializer = new Spatializer({ hrtf: true, refDistance: 4, maxDistance: 40 });

        // Connect Synth -> Spatializer
        this.synth.connect(this.spatializer.panner);

        // Schedule random sparkles (Using Transport-synced loop for timing, but randomness inside)
        this.loop = new Tone.Loop((time) => {
            this.triggerRandomSparkle(time);
        }, "1m").start(0); // Every measure (~2-3s)
    }

    /**
     * Connect the spatial output to the effector's direct input (bypass lowpass filter)
     */
    public connect(effector: Effector) {
        this.spatializer.connect(effector.directInput);
    }

    /**
     * Update the candidate pool of surrounding notes
     */
    public updateCandidates(notes: string[], positions: THREE.Vector3[]) {
        if (notes.length !== positions.length) return;

        this.candidates = notes.map((note, i) => ({
            note,
            pos: positions[i]
        }));
    }

    private triggerRandomSparkle(time: number) {
        if (!this.isPlaying || this.candidates.length === 0 || this.isDisposed) return;

        // 30% chance to play on any given measure check
        if (Math.random() > 0.4) return;

        // Pick random neighbor
        const idx = Math.floor(Math.random() * this.candidates.length);
        const candidate = this.candidates[idx];
        if (!candidate) return;

        // 1. Move Spatializer to position (Immediate jump is fine for discrete sparkles)
        this.spatializer.update(candidate.pos, 0.1);

        // 2. Play Note
        const note = ensureOctave(candidate.note, 5 + (Math.random() > 0.5 ? 1 : 0)); // Octave 5 or 6
        const velocity = 0.3 + Math.random() * 0.3; // Soft velocity

        this.synth.triggerAttackRelease(note, "8n", time, velocity);
    }

    public start() {
        if (this.isDisposed) return;
        this.isPlaying = true;
    }

    public stop(time: number = Tone.now()) {
        if (this.isDisposed) return;
        this.isPlaying = false;
        this.synth.releaseAll(time);
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.loop.dispose();
        this.synth.dispose();
        this.spatializer.dispose();
    }
}
