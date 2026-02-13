/**
 * ArpeggioEngine - The Sound Engine for Edge Mode
 * Manages 7 independent monophonic voices with shared effects processing
 */

import * as Tone from 'tone';
import { createSpatialPanner, updatePannerPosition } from '../../../../../app/lib/audio/utils/SpatialAudio';
import { createDelay } from '../../../../../app/lib/audio/engine/ReverbFactory';
import * as THREE from 'three';

export interface Voice {
    synth: Tone.Synth;
    panner: Tone.Panner3D;
    gain: Tone.Gain;
    sequence: Tone.Sequence<any>;
    currentNote: string | null;
    isEdgeNode: boolean;
}

export class ArpeggioEngine {
    public voices: Voice[] = [];
    public readonly MAX_VOICES = 7;

    private filter: Tone.Filter;
    private delay: Tone.FeedbackDelay;
    private masterGain: Tone.Gain;
    private limiter: Tone.Limiter;

    private spatialSend: Tone.Gain;
    private deepSend: Tone.Gain;
    private dryGain: Tone.Gain;

    private isDisposed = false;

    constructor(sharedSpatialReverb: Tone.Reverb, sharedDeepReverb: Tone.Reverb) {
        this.limiter = new Tone.Limiter(-6).toDestination();
        this.masterGain = new Tone.Gain(0).connect(this.limiter);

        // 1. Effects Chain
        this.filter = new Tone.Filter({
            type: 'highpass',
            frequency: 600,
            Q: 1.2
        });

        this.delay = createDelay('8n.', 0.25, 0.3);

        // 2. Output Split
        this.dryGain = new Tone.Gain(0.6).connect(this.masterGain);
        this.spatialSend = new Tone.Gain(0.4).connect(sharedSpatialReverb);
        this.deepSend = new Tone.Gain(0.1).connect(sharedDeepReverb);

        this.filter.connect(this.delay);
        this.delay.connect(this.dryGain);
        this.delay.connect(this.spatialSend);
        this.delay.connect(this.deepSend);

        // 3. Create Voices
        this.initVoices();
    }

    private initVoices() {
        for (let i = 0; i < this.MAX_VOICES; i++) {
            const panner = createSpatialPanner({
                refDistance: 2,
                maxDistance: 30,
                rolloffFactor: 1.0,
            });

            const gain = new Tone.Gain(0);

            // Simple Monophonic Sine (Glockenspiel)
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

            synth.connect(panner);
            panner.connect(gain);
            gain.connect(this.filter);

            // Placeholder Sequence
            const isEdge = i < 2;
            const subdivision = isEdge ? '8n' : '16n';

            const sequence = new Tone.Sequence(
                (time, val: any) => {
                    if (val && val.note) {
                        const dur = isEdge ? '8n' : '32n';
                        synth.triggerAttackRelease(val.note, dur, time, val.velocity);
                    }
                },
                [],
                subdivision
            ).start(0);

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

    public setVolume(volume: number, rampTime: number) {
        if (this.isDisposed) return;
        this.masterGain.gain.rampTo(volume, rampTime);
    }

    public updateVoicePosition(index: number, pos: THREE.Vector3, rampTime: number = 0.1) {
        if (this.voices[index]) {
            updatePannerPosition(this.voices[index].panner, pos, rampTime);
        }
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;

        this.voices.forEach(v => {
            v.synth.dispose();
            v.panner.dispose();
            v.gain.dispose();
            v.sequence.dispose();
        });

        this.filter.dispose();
        this.delay.dispose();
        this.masterGain.dispose();
        this.limiter.dispose();
        this.dryGain.dispose();
        this.spatialSend.dispose();
        this.deepSend.dispose();
    }
}
