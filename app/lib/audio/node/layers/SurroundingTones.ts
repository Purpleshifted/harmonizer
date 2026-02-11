import * as Tone from 'tone';
import * as THREE from 'three';
import { ensureOctave } from '../../core/NoteUtils';
import { SynthTank } from '../factory/SynthTank';
import { Spatializer } from '../engine/Spatializer';

/**
 * SurroundingTones - Hexagonal bell-like sounds around the focal node
 */
export class SurroundingTones {
    private voices: {
        synth: Tone.Synth;
        spatializer: Spatializer;
        gain: Tone.Gain;
    }[] = [];
    private isPlaying = false;
    private readonly MAX_VOICES = 6;
    private loop: Tone.Loop | null = null;
    private currentNotes: string[] = [];
    private currentPositions: THREE.Vector3[] = [];

    constructor() {
        for (let i = 0; i < this.MAX_VOICES; i++) {
            const synth = SynthTank.createBellSynth();
            const spatializer = new Spatializer({ refDist: 5, maxDist: 35 });
            const gain = new Tone.Gain(0); // Individual voice gain

            synth.connect(spatializer.panner);
            spatializer.panner.connect(gain);

            this.voices.push({ synth, spatializer, gain });
        }
    }

    public connect(destination: Tone.ToneAudioNode) {
        this.voices.forEach(v => v.gain.connect(destination));
        return this;
    }

    /**
     * Update nearby notes and their 3D positions
     */
    public start(notes: string[], positions: THREE.Vector3[]) {
        if (notes.length === 0) return;

        this.isPlaying = true;
        this.currentNotes = notes;
        this.currentPositions = positions;

        // Setup individual voice volumes and spatial positions
        const count = Math.min(this.currentNotes.length, this.MAX_VOICES);
        for (let i = 0; i < count; i++) {
            const v = this.voices[i];
            v.gain.gain.rampTo(1.0, 1.0);
            v.spatializer.update(this.currentPositions[i], 0.1);
        }

        // Initialize/Start a slow "wind chime" loop if not existing
        if (!this.loop) {
            this.loop = new Tone.Loop((time) => {
                if (!this.isPlaying || this.currentNotes.length === 0) return;

                // Randomly trigger one voice among active ones
                const count = Math.min(this.currentNotes.length, this.MAX_VOICES);
                const voiceIdx = Math.floor(Math.random() * count);
                const v = this.voices[voiceIdx];

                const noteName = this.currentNotes[voiceIdx];
                if (!noteName) return;

                const note = ensureOctave(noteName, 6); // High register bells

                if (Math.random() < 0.4) {
                    v.synth.triggerAttackRelease(note, "2n", time, 0.4 + Math.random() * 0.4);
                }
            }, "2n").start(0);
        }

        if (Tone.getTransport().state !== 'started') {
            Tone.getTransport().start();
        }
    }

    public stop() {
        if (!this.isPlaying) return;
        this.voices.forEach(v => v.gain.gain.rampTo(0, 1.0));
        if (this.loop) {
            this.loop.stop();
            this.loop.dispose();
            this.loop = null;
        }
        this.isPlaying = false;
    }

    public dispose() {
        this.stop();
        this.voices.forEach(v => {
            v.synth.dispose();
            v.spatializer.dispose();
            v.gain.dispose();
        });
    }
}
