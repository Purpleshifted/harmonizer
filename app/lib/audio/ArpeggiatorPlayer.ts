/**
 * Arpeggiator player for Edge mode - Multi-Voice Isolated Architecture
 * (Updated)
 * 
 * Each nearby node has its own completely independent Synth and Panner3D.
 * - Resolves polyphony leaks by isolating voices
 * - Enables true spatial separation without bus mixing issues
 */

import * as Tone from 'tone';
import * as THREE from 'three';
import { ensureOctave } from './core/NoteUtils';
import { createSpatialPanner, updatePannerPosition } from './core/SpatialAudio';
import { createReverb, createDelay } from './core/ReverbFactory';

interface IndependentVoice {
    synth: Tone.Synth;  // Monophonic synth for each voice (no PolySynth overhead)
    panner: Tone.Panner3D;
    gain: Tone.Gain;
    sequence: Tone.Sequence<any>; // Reusable sequence, never null
    currentNote: string | null;
    isEdgeNode: boolean; // true = main pattern, false = sparkle pattern
}

export class ArpeggiatorPlayer {
    // Shared Effects Chain (Post-Synth)
    // Shared Effects Chain (Post-Synth)
    private filter: Tone.Filter;
    private delay: Tone.FeedbackDelay;
    private masterGain: Tone.Gain;
    private limiter: Tone.Limiter;

    // Shared Reverbs (Injected)
    private spatialReverb: Tone.Reverb;
    private deepReverb: Tone.Reverb;

    // Split Gains
    private dryGain: Tone.Gain;
    private spatialSend: Tone.Gain;
    private deepSend: Tone.Gain;

    // Independent Voices
    private voices: IndependentVoice[] = [];
    private readonly MAX_VOICES = 7; // 2 edge nodes + 5 nearby

    // State
    private isPlaying = false;
    private isDisposed = false;
    private currentEdgeKey = '';

    // Timing
    private readonly FADE_IN_TIME = 1.5;

    constructor(sharedSpatialReverb: Tone.Reverb, sharedDeepReverb: Tone.Reverb) {
        this.spatialReverb = sharedSpatialReverb;
        this.deepReverb = sharedDeepReverb;

        this.limiter = new Tone.Limiter(-6).toDestination();
        this.masterGain = new Tone.Gain(0).connect(this.limiter);

        // Main effects chain
        // Filter -> Delay -> Split(Dry, Spatial, Deep)
        this.filter = new Tone.Filter({
            type: 'highpass',
            frequency: 600,
            Q: 1.2
        });

        this.delay = createDelay('8n.', 0.25, 0.3);

        // Split Architecture
        // 1. Dry Path (0.6)
        this.dryGain = new Tone.Gain(0.6).connect(this.masterGain);

        // 2. Spatial Send (0.4)
        this.spatialSend = new Tone.Gain(0.4).connect(this.spatialReverb);

        // 3. Deep Send (0.1) - Ambient Tail
        this.deepSend = new Tone.Gain(0.1).connect(this.deepReverb);

        // Chain
        this.filter.connect(this.delay);
        this.delay.connect(this.dryGain);
        this.delay.connect(this.spatialSend);
        this.delay.connect(this.deepSend);

        // Create independent voices with reusable Sequences
        for (let i = 0; i < this.MAX_VOICES; i++) {
            const panner = createSpatialPanner({
                refDistance: 2,
                maxDistance: 30,
                rolloffFactor: 1.0,
            });

            const gain = new Tone.Gain(0); // Individual voice volume

            // Independent Synth: Monophonic sine (glockenspiel-like)
            // Cheaper than PolySynth since each point plays one note sequence
            const synth = new Tone.Synth({
                oscillator: { type: 'sine' },
                envelope: {
                    attack: 0.002,
                    decay: 0.4,
                    sustain: 0.1,
                    release: 0.8,
                },
                volume: -6
            });

            // Signal Path: Synth -> Panner -> Gain -> Shared Filter
            synth.connect(panner);
            panner.connect(gain);
            gain.connect(this.filter); // Connect to start of shared FX chain

            // Pre-initialize reusable sequence (empty initially)
            const isEdge = i < 2;
            const subdivision = isEdge ? '8n' : '16n';

            const sequence = new Tone.Sequence(
                (time, val: any) => {
                    if (val && val.note) {
                        // Use subdivision as duration
                        const dur = isEdge ? '8n' : '32n';
                        synth.triggerAttackRelease(val.note, dur, time, val.velocity);
                    }
                },
                [], // Empty events initially
                subdivision
            );

            // Start sequence immediately so it's ready, but it has no events so it's silent
            sequence.start(0);

            this.voices.push({
                synth,
                panner,
                gain,
                sequence,
                currentNote: null,
                isEdgeNode: isEdge,
            });
        }
    }

    setGlobalVolume(volume: number, rampTime: number = 0.1) {
        if (this.isDisposed) return;
        const now = Tone.now();
        this.masterGain.gain.rampTo(volume, rampTime, now);

        if (volume > 0.01 && !this.isPlaying) {
            Tone.getTransport().start();
            this.isPlaying = true;
        } else if (volume === 0) {
            // Keeping them running for seamless re-entry
        }
    }

    /**
     * Start arpeggio with per-node spatial audio
     */
    startArpeggio(
        note1: string,
        note2: string,
        pos1: THREE.Vector3,
        pos2: THREE.Vector3,
        _distance1: number,
        _distance2: number,
        _edgeMidpoint: THREE.Vector3,
        nearbyNotes?: string[],
        nearbyPositions?: THREE.Vector3[]
    ) {
        if (this.isDisposed) return;

        const edgeKey = `${note1}-${note2}`;

        // Just update positions if edge hasn't changed
        if (this.currentEdgeKey === edgeKey) {
            this.updatePositions(pos1, pos2, nearbyPositions || []);
            return;
        }

        this.currentEdgeKey = edgeKey;
        const now = Tone.now();

        // 1. Setup Edge Voices (Voice 0 & 1)
        this.setupVoice(0, note1, pos1, true);
        this.setupVoice(1, note2, pos2, true);

        // 2. Setup Nearby Voices (Voice 2..6)
        const nearbyCount = Math.min(nearbyNotes?.length || 0, this.MAX_VOICES - 2);

        for (let i = 0; i < nearbyCount; i++) {
            if (nearbyNotes && nearbyPositions) {
                this.setupVoice(i + 2, nearbyNotes[i], nearbyPositions[i], false);
            }
        }

        // Disable unused voices
        for (let i = nearbyCount + 2; i < this.MAX_VOICES; i++) {
            const voice = this.voices[i];
            voice.gain.gain.rampTo(0, 0.5, now);
            voice.sequence.events = []; // Clear events to silence
        }

        // Fade in Master
        this.masterGain.gain.rampTo(0.5, this.FADE_IN_TIME, now);

        if (Tone.getTransport().state !== 'started') {
            Tone.getTransport().start();
        }
        this.isPlaying = true;
    }

    private setupVoice(index: number, note: string, position: THREE.Vector3, isEdgeNode: boolean) {
        const voice = this.voices[index];
        if (!voice) return;

        const now = Tone.now();
        const noteWithOctave = ensureOctave(note, isEdgeNode ? 5 : 6);

        // Update panner position (Throttled wrapper already used, but immediate jump here)
        updatePannerPosition(voice.panner, position, 0);
        voice.currentNote = noteWithOctave;
        voice.isEdgeNode = isEdgeNode;

        // OPTIMIZATION: Update sequence events instead of recreating
        if (isEdgeNode) {
            // Main pattern (8n)
            const pattern = this.generateMainPattern(noteWithOctave);
            voice.sequence.events = pattern;
            voice.gain.gain.rampTo(0.6, 0.5, now);
        } else {
            // Sparkle pattern (16n)
            const pattern = this.generateSparklePattern(noteWithOctave);
            voice.sequence.events = pattern;
            voice.gain.gain.rampTo(0.15, 0.5, now);
        }
    }

    private generateMainPattern(note: string) {
        const pattern = [];
        const length = 8;
        for (let i = 0; i < length; i++) {
            if (Math.random() < 0.5) {
                pattern.push({ note, velocity: 0.6 + Math.random() * 0.3 });
            } else {
                pattern.push({ note: null, velocity: 0 });
            }
        }
        return pattern;
    }

    private generateSparklePattern(note: string) {
        const pattern = [];
        const length = 16;
        for (let i = 0; i < length; i++) {
            if (Math.random() < 0.25) {
                pattern.push({ note, velocity: 0.3 + Math.random() * 0.3 });
            } else {
                pattern.push({ note: null, velocity: 0 });
            }
        }
        return pattern;
    }

    updatePositions(pos1: THREE.Vector3, pos2: THREE.Vector3, nearbyPositions: THREE.Vector3[]) {
        if (this.isDisposed) return;

        updatePannerPosition(this.voices[0].panner, pos1, 0.1);
        updatePannerPosition(this.voices[1].panner, pos2, 0.1);

        nearbyPositions.forEach((pos, i) => {
            const idx = i + 2;
            if (idx < this.MAX_VOICES) {
                updatePannerPosition(this.voices[idx].panner, pos, 0.1);
            }
        });
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.isPlaying = false;

        this.voices.forEach(v => {
            v.synth.dispose();
            v.panner.dispose();
            v.gain.dispose();
            v.sequence.dispose(); // Reuseable sequences must be disposed
        });

        this.filter.dispose();
        // Shared reverb - do not dispose
        this.dryGain.dispose();
        this.spatialSend.dispose();
        this.deepSend.dispose();
        this.delay.dispose();
        this.masterGain.dispose();
        this.limiter.dispose();
    }
}
