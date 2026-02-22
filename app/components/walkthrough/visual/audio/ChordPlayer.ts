/**
 * Chord player for Face mode (3 notes) - Orchestral & Multi-layered & Seamless
 * 
 * Architecture Redesigned for Performance & Smoothness:
 * 
 * 1. Base Layer (Orchestra Body): 
 *    - Single Panner positioned at the center of the active triangle (floating slightly above)
 *    - Uses Double Buffering for seamless looping
 *    - Smoothly ramps position when moving between triangles
 * 
 * 2. Spatial Layer (Horns):
 *    - Dynamic Voice Allocator pool
 *    - Assigns voices to currently active nodes (1-3 nodes depending on mode)
 *    - Preserves voices for shared nodes between transitions (no re-trigger needed)
 *    - Fades in new notes, fades out old notes
 * 
 * 3. Center Layer (Synth):
 *    - Background texture (PolySynth), low volume, filtered
 * 
 * 4. Astral Layer (Arp):
 *    - High sparkle arpeggios
 */

import * as Tone from 'tone';
import * as THREE from 'three';
import { ensureOctave, transposeOctave, sortNotesByPitch } from './core/NoteUtils';
import { createSpatialPanner, updatePannerPosition, updateListener } from './core/SpatialAudio';
import { createReverb, createDelay } from './core/ReverbFactory';
import { createOrchestraEnsemble, OrchestraEnsemble, loadInstrument } from './core/InstrumentFactory';

// --- Helper Class for Dynamic Horn Allocation ---
class HornVoice {
    public panner: Tone.Panner3D;
    public gain: Tone.Gain;
    private samplerA: Tone.Sampler;
    private samplerB: Tone.Sampler;
    private activeBuff: 'A' | 'B' = 'A';

    public currentNote: string | null = null;
    public isAllocated = false;

    constructor(destination: Tone.ToneAudioNode) {
        this.panner = createSpatialPanner({
            useHRTF: false,
            refDistance: 2,
            maxDistance: 30,
        });

        this.gain = new Tone.Gain(0); // Default silent
        this.samplerA = loadInstrument('french-horn');
        this.samplerB = loadInstrument('french-horn');
        this.samplerA.volume.value = -2;
        this.samplerB.volume.value = -2;

        this.samplerA.connect(this.panner);
        this.samplerB.connect(this.panner);
        this.panner.connect(this.gain);
        this.gain.connect(destination);
    }

    public activate(note: string, pos: THREE.Vector3, now: number) {
        this.currentNote = note;
        this.isAllocated = true;
        updatePannerPosition(this.panner, pos, 0); // Jump to pos immediately on allocate

        // Start Sound
        this.activeBuff = 'A';
        this.samplerA.volume.value = 0; // Loudest possible
        this.samplerB.volume.value = 0;

        const hornNote = ensureOctave(note, 3);
        if (this.samplerA.loaded) {
            this.samplerA.triggerAttack(hornNote, now, 0.8);
        }

        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(this.gain.gain.value, now);
        this.gain.gain.rampTo(0.6, 2.0, now);
    }

    public deactivate(now: number) {
        this.isAllocated = false;
        this.currentNote = null;
        this.gain.gain.rampTo(0, 1.0, now); // Fade Out

        // Release after fade out
        setTimeout(() => {
            if (!this.isAllocated) {
                this.samplerA.releaseAll();
                this.samplerB.releaseAll();
            }
        }, 1200);
    }

    public updatePosition(pos: THREE.Vector3) {
        updatePannerPosition(this.panner, pos, 0.5); // Smooth move
    }

    // Called periodically to maintain sustain loop
    public sustainLoop(now: number) {
        if (!this.isAllocated || !this.currentNote) return;

        const note = ensureOctave(this.currentNote, 3);
        const prev = this.activeBuff === 'A' ? this.samplerA : this.samplerB;
        const next = this.activeBuff === 'A' ? this.samplerB : this.samplerA;
        this.activeBuff = this.activeBuff === 'A' ? 'B' : 'A';

        if (next.loaded) next.triggerAttack(note, now, 0.6);
        if (prev.loaded) prev.triggerRelease(note, now);
    }

    public dispose() {
        this.panner.dispose();
        this.gain.dispose();
        this.samplerA.dispose();
        this.samplerB.dispose();
    }
}

export class ChordPlayer {
    // === Base Layer (Center Panned Orchestra) - Triple Buffer for Seamless Overlap ===
    private baseLayers: Array<{
        ensemble: OrchestraEnsemble;
        gain: Tone.Gain;
    }> = [];
    private currentLayerIndex = 0;
    private basePanner: Tone.Panner3D;
    private baseGain: Tone.Gain;

    // === Spatial Layer (Horns) ===
    private hornPool: HornVoice[] = [];
    private readonly MAX_HORNS = 4; // Max concurrent notes (max 3 for triangle + buffer)
    private activeHornMap: Map<string, HornVoice> = new Map(); // Note -> Voice

    // === Center Layer (Synth) ===
    private centerSynth: Tone.PolySynth;
    private centerFilter: Tone.Filter;
    private centerReverb: Tone.Reverb;
    private centerGain: Tone.Gain;

    // === Astral Layer ===
    private astralSynth: Tone.PolySynth;
    private astralFilter: Tone.Filter;
    private astralReverb: Tone.Reverb;
    private astralDelay: Tone.FeedbackDelay;
    private astralGain: Tone.Gain;
    private astralSequence: Tone.Sequence | null = null;

    // Shared
    private masterGain: Tone.Gain;
    private vibrato: Tone.Vibrato;
    private spatialReverb: Tone.Reverb;

    // State
    private isPlaying = false;
    private isAudible = false;
    private isDisposed = false;
    private currentNotes: string[] = [];
    private currentTriangleCenter: THREE.Vector3 | null = null;

    // Throttling
    private lastListenerUpdate = 0;
    private readonly LISTENER_UPDATE_INTERVAL = 100;
    private lastPannerUpdate = 0;
    private readonly PANNER_UPDATE_INTERVAL = 50;
    private lastTriggerTime = 0;

    // Loop (Orchestral Overlap)
    private reTriggerIntervalId: ReturnType<typeof setInterval> | null = null;
    readonly RE_TRIGGER_INTERVAL = 10000; // 10 seconds (Longer loop)

    // Fade
    readonly FADE_TIME = 1.0;

    constructor() {
        this.masterGain = new Tone.Gain(0).toDestination();
        this.vibrato = new Tone.Vibrato({ frequency: 3, depth: 0.08, type: 'sine' }).connect(this.masterGain);
        this.spatialReverb = new Tone.Reverb({
            decay: 5,        // Longer, hall-like decay
            preDelay: 0.1,   // Adds space
            wet: 0.4
        });
        this.spatialReverb.generate(); // Asynchronous IR generation (Convolution-based)
        this.spatialReverb.connect(this.vibrato);

        // === 1. Base Layer (Triangle Center Panner) ===
        this.basePanner = createSpatialPanner({
            useHRTF: false,
            refDistance: 3,
            maxDistance: 40,
        });
        this.baseGain = new Tone.Gain(0.8);

        // Initialize 3 layers for overlapping crossfades
        for (let i = 0; i < 3; i++) {
            const ensemble = createOrchestraEnsemble(['contrabass', 'cello'], [-3, -3]); // Slightly boosted
            const gain = new Tone.Gain(0);
            ensemble.connect(gain);
            gain.connect(this.basePanner);
            this.baseLayers.push({ ensemble, gain });
        }
        this.basePanner.connect(this.baseGain);
        this.baseGain.connect(this.spatialReverb);

        // === 2. Spatial Layer (Horns) ===
        for (let i = 0; i < this.MAX_HORNS; i++) {
            this.hornPool.push(new HornVoice(this.spatialReverb));
        }

        // === 3. Center Layer (Synth) ===
        this.centerGain = new Tone.Gain(0.3);
        this.centerReverb = createReverb('deep');
        this.centerReverb.connect(this.vibrato);
        this.centerFilter = new Tone.Filter({ type: 'lowpass', frequency: 1500, rolloff: -12 });
        this.centerSynth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 30 } as any,
            envelope: { attack: 1.5, decay: 1.0, sustain: 0.7, release: 1.5 },
            volume: -20
        });
        this.centerSynth.maxPolyphony = 16; // Increased polyphony
        this.centerSynth.connect(this.centerFilter);
        this.centerFilter.connect(this.centerReverb);
        this.centerReverb.connect(this.centerGain);
        this.centerGain.connect(this.masterGain);

        // === 4. Astral Layer (Arp) ===
        this.astralGain = new Tone.Gain(1.0);
        this.astralReverb = createReverb('deep');
        this.astralDelay = createDelay("4n.", 0.4, 0.5);
        this.astralFilter = new Tone.Filter({ type: 'highpass', frequency: 600 });
        this.astralSynth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, volume: 2 });

        this.astralSynth.connect(this.astralFilter);
        this.astralFilter.connect(this.astralDelay);
        this.astralDelay.connect(this.astralReverb);
        this.astralReverb.connect(this.astralGain);
        this.astralGain.connect(this.masterGain);

        this.masterGain.toDestination();
    }

    setGlobalVolume(volume: number, rampTime: number = 0.1) {
        if (this.isDisposed) return;
        const now = Tone.now();
        this.masterGain.gain.rampTo(volume, rampTime, now);

        if (volume > 0.001) {
            this.isAudible = true;
            this.isPlaying = true;
            if (!this.reTriggerIntervalId) this.startLoop();
        } else {
            this.isAudible = false;
            if (volume === 0) {
                setTimeout(() => {
                    if (!this.isAudible && !this.isDisposed) {
                        this.stopSoundGeneration();
                        this.isPlaying = false;
                    }
                }, rampTime * 1000 + 100);
            }
        }
    }

    private startLoop() {
        if (this.reTriggerIntervalId) clearInterval(this.reTriggerIntervalId);
        this.reTriggerIntervalId = setInterval(() => {
            if (this.isAudible && !this.isDisposed) {
                // Loop Base Layer
                if (this.currentNotes.length > 0) this.triggerBaseLayer(this.currentNotes, true);
                // Loop Active Horns
                const now = Tone.now();
                this.activeHornMap.forEach(voice => voice.sustainLoop(now));
            }
        }, this.RE_TRIGGER_INTERVAL);
    }

    private stopSoundGeneration() {
        if (this.reTriggerIntervalId) {
            clearInterval(this.reTriggerIntervalId);
            this.reTriggerIntervalId = null;
        }

        this.baseLayers.forEach(layer => {
            layer.ensemble.releaseAll();
            layer.gain.gain.value = 0;
        });
        this.centerSynth.releaseAll();

        // Deactivate all horns
        const now = Tone.now();
        this.activeHornMap.forEach(v => v.deactivate(now));
        this.activeHornMap.clear();

        this.currentNotes = [];
    }

    updateListenerPosition(position: THREE.Vector3, forward: THREE.Vector3) {
        if (this.isDisposed) return;
        const now = performance.now();
        if (now - this.lastListenerUpdate < this.LISTENER_UPDATE_INTERVAL) return;
        this.lastListenerUpdate = now;
        updateListener(position, forward);
    }

    updatePositions(positions: THREE.Vector3[]) {
        if (this.isDisposed) return;
        const now = performance.now();
        if (now - this.lastPannerUpdate < this.PANNER_UPDATE_INTERVAL) return;
        this.lastPannerUpdate = now;

        // Calc center of current positions (Approximation of triangle center)
        if (positions.length > 0) {
            const center = new THREE.Vector3();
            positions.forEach(p => center.add(p));
            center.divideScalar(positions.length);
            // Height adjust (floating above)
            // center.y += 2.0; // Already 2D plane? Tonnetz is 3D mesh. Visual nodes have positions.
            // Let's assume we want it slightly towards the camera (Normal) or just 'up' if Y is up.
            // Actually Tonnetz logic creates mesh in 3D.

            // Just update Base Panner to center
            updatePannerPosition(this.basePanner, center, 0.5);

            // Update individual Horn Voices
            // We need to know which voice maps to which position.
            // But positions array is ordered same as notes array usually.
            // Assuming playChord passes [n1, n2, n3] and [p1, p2, p3]
            // We can match by notes order in playChord logic, 
            // BUT updatePositions is separate.
            // Limitation: updatePositions receives just array.
            // We need activeHornMap to know positions?
            // Actually, static updatePositions is hard with Map.
            // Better to update positions inside playChord (on structure change),
            // OR pass a mapped object.

            // COMPROMISE: Don't update individual horn positions every frame.
            // Only update activeHornMap positions when `playChord` is called.
            // Since nodes don't move (Grid is static, Player moves), 
            // Panner position needs to be set ONLY ONCE when allocated!
            // Wait, does the Grid move relative to camera? No, Camera moves.
            // Panner is world space. Grid nodes are world space.
            // SO: We only need to set Voice Position once when allocated!
            // UNLESS grid is dynamic/wobbly. Assuming static grid.
        }
    }

    playChord(notes: string[], positions: THREE.Vector3[], isMajor: boolean) {
        if (this.isDisposed) return;
        const now = Tone.now();
        const validNotes = notes.filter(n => n && typeof n === 'string');
        const notesWithOctave = validNotes.map(n => ensureOctave(n, 3));
        const sortedNotes = [...notesWithOctave].sort();

        // 1. Manage Base Layer (Orchestra)
        const notesKey = sortedNotes.join('-');
        if (this.currentNotes.join('-') !== notesKey) {
            if (now - this.lastTriggerTime > 0.1) {
                this.currentNotes = sortedNotes;
                this.lastTriggerTime = now;

                // Trigger Base
                this.triggerBaseLayer(sortedNotes, false);
                this.triggerCenterSynth(validNotes, now);
                // Astral arp is handled by independent FaceArp layer.

                // Note: Horn allocation is now handled separately via updateActiveHorns
            }
        }

        // 2. Just update Base Panner position (Center of active notes)
        if (positions.length > 0) {
            const center = new THREE.Vector3();
            positions.forEach(p => center.add(p));
            center.divideScalar(positions.length);
            // Floating above
            center.add(new THREE.Vector3(0, 0, 1)); // Assuming Z is up/normal for visibility
            updatePannerPosition(this.basePanner, center, 1.0); // Slow tracking
        }
    }

    public setBackgroundVolume(scale: number, rampTime: number = 1.0) {
        if (this.isDisposed) return;
        const now = Tone.now();
        this.baseGain.gain.rampTo(0.8 * scale, rampTime, now);
        this.centerGain.gain.rampTo(0.3 * scale, rampTime, now);
        this.astralGain.gain.rampTo(1.0 * scale, rampTime, now);
    }

    // Dynamic Voice Allocation - Now Public
    // OPTIMIZATION: Internal throttle as safety net
    private lastHornUpdateTime = 0;
    private readonly HORN_UPDATE_INTERVAL = 100; // ms

    public updateActiveHorns(notes: string[], positions: THREE.Vector3[]) {
        if (this.isDisposed) return;

        // Throttle updates
        const perfNow = performance.now();
        if (perfNow - this.lastHornUpdateTime < this.HORN_UPDATE_INTERVAL) return;
        this.lastHornUpdateTime = perfNow;

        const now = Tone.now();
        const nextNotes = new Set(notes.map(n => ensureOctave(n, 3)));

        // 1. Remove obsolete voices
        for (const [note, voice] of this.activeHornMap) {
            if (!nextNotes.has(note)) {
                voice.deactivate(now);
                this.activeHornMap.delete(note);
            }
        }

        // 2. Add new voices
        notes.forEach((rawNote, i) => {
            const note = ensureOctave(rawNote, 3);
            if (!this.activeHornMap.has(note)) {
                // Find free voice
                const activeValues = Array.from(this.activeHornMap.values());
                const freeVoice = this.hornPool.find(v => !v.isAllocated && !activeValues.includes(v));

                // Better find logic
                let targetVoice: HornVoice | undefined;
                for (const v of this.hornPool) {
                    if (!v.isAllocated) {
                        targetVoice = v;
                        break;
                    }
                }

                if (freeVoice) {
                    const pos = positions[i] || new THREE.Vector3();
                    freeVoice.activate(note, pos, now);
                    this.activeHornMap.set(note, freeVoice);
                }
            }
        });
    }

    private triggerBaseLayer(notes: string[], isLoop: boolean) {
        const now = Tone.now();
        const velocity = isLoop ? 0.6 : 0.8;
        const SWELL_TIME = 4.0;
        const FADE_OUT_TIME = 6.0;

        const nextLayer = this.baseLayers[this.currentLayerIndex];

        // Cycle Index (Round Robin)
        this.currentLayerIndex = (this.currentLayerIndex + 1) % this.baseLayers.length;

        // 1. Swell next layer
        if (nextLayer.ensemble.isLoaded) {
            nextLayer.gain.gain.cancelScheduledValues(now);
            nextLayer.gain.gain.setTargetAtTime(1.0, now, SWELL_TIME / 3);
            nextLayer.ensemble.triggerAttack(notes, now, velocity);
        }

        // 2. Manage previous layers fading (The ones before the 'next' we just triggered)
        const prevIdx = (this.currentLayerIndex + 1) % this.baseLayers.length; // The layer from 2 steps ago
        const oldLayer = this.baseLayers[prevIdx];
        if (oldLayer.ensemble.isLoaded) {
            oldLayer.gain.gain.setTargetAtTime(0, now, FADE_OUT_TIME / 3);
            // Slowly release after fade-out to keep memory clean but avoid cuts
            setTimeout(() => {
                if (!this.isDisposed) oldLayer.ensemble.releaseAll();
            }, FADE_OUT_TIME * 1000);
        }
    }

    // ... CenterSynth & Astral code same as before ... 
    private triggerCenterSynth(notes: string[], time: number) {
        // ... same impl
        const validNotes = notes.filter(n => n && typeof n === 'string');
        if (validNotes.length === 0) return;
        this.centerSynth.releaseAll(time);
        const centerNotes = validNotes.map(n => ensureOctave(n, 4));
        centerNotes.forEach(note => {
            this.centerSynth.triggerAttack(note, time, 0.5);
        });
    }

    public refreshAstralFromTriangle(notes: string[], isMajor: boolean) {
        this.updateAstralSequence(notes, isMajor);
    }

    private updateAstralSequence(notes: string[], isMajor: boolean) {
        if (this.astralSequence) {
            this.astralSequence.stop();
            this.astralSequence.dispose();
            this.astralSequence = null;
        }
        const validNotes = notes.filter((n): n is string => !!n && typeof n === 'string');
        if (validNotes.length === 0) return;

        const expandedNotes: string[] = [];
        validNotes.forEach((note) => {
            const n = ensureOctave(note, 4);
            expandedNotes.push(transposeOctave(n, -1));
            expandedNotes.push(n);
            expandedNotes.push(transposeOctave(n, 1));
        });
        const sortedNotes = sortNotesByPitch(expandedNotes);
        if (isMajor) sortedNotes.reverse();

        const patternEvents: (string | null)[] = [];
        const length = 16;
        for (let i = 0; i < length; i++) {
            if (Math.random() < 0.35) {
                const idx = Math.floor((i / length) * sortedNotes.length);
                patternEvents.push(sortedNotes[Math.min(idx, sortedNotes.length - 1)]);
            } else patternEvents.push(null);
        }

        this.astralSequence = new Tone.Sequence((time, note) => {
            if (note && this.isAudible) {
                try {
                    this.astralSynth.triggerAttackRelease(note, '4n', time, 0.3);
                } catch {}
            }
        }, patternEvents, '4n');
        this.astralSequence.start(0);
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.stopSoundGeneration();

        this.baseLayers.forEach(layer => {
            layer.ensemble.dispose();
            layer.gain.dispose();
        });
        this.basePanner.dispose();
        this.baseGain.dispose();

        this.hornPool.forEach(v => v.dispose());
        this.activeHornMap.clear();

        this.centerSynth.dispose();
        this.centerReverb.dispose();
        this.centerGain.dispose();

        this.astralSynth.dispose();
        this.astralFilter.dispose();
        this.astralReverb.dispose();
        this.astralDelay.dispose();
        this.astralGain.dispose();

        this.spatialReverb.dispose();
        this.vibrato.dispose();
        this.masterGain.dispose();
    }
}
