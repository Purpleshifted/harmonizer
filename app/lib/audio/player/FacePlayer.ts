import * as Tone from 'tone';
import * as THREE from 'three';
import { ensureOctave } from '../core/NoteUtils';
import { BaseLayer } from '../face/layers/BaseLayer';
import { HornLayer } from '../face/layers/HornLayer';
import { CenterSynthLayer } from '../face/layers/CenterSynthLayer';
import { AstralArpLayer } from '../face/layers/AstralArpLayer';

/**
 * FacePlayer - Central Manager for Face Mode (Chordal / Orchestral)
 * Coordinates multiple musical layers and handles high-level playback logic.
 */
export class FacePlayer {
    private baseLayer: BaseLayer;
    private hornLayer: HornLayer;
    private centerSynth: CenterSynthLayer;
    private astralArp: AstralArpLayer;

    // Shared Routing
    private masterGain: Tone.Gain;
    private vibratoSpatial: Tone.Vibrato;
    private vibratoDeep: Tone.Vibrato;

    // Split Gains (for Send/Dry)
    private spatialDry: Tone.Gain;
    private spatialSend: Tone.Gain;
    private centerDry: Tone.Gain;
    private centerSend: Tone.Gain;
    private astralDry: Tone.Gain;
    private astralSend: Tone.Gain;

    // State
    private isPlaying = false;
    private isAudible = false;
    private isDisposed = false;
    private currentNotes: string[] = [];

    // Throttling / Loop
    private lastTriggerTime = 0;
    private reTriggerIntervalId: ReturnType<typeof setInterval> | null = null;
    readonly RE_TRIGGER_INTERVAL = 6000;

    constructor(spatialReverb: Tone.Reverb, deepReverb: Tone.Reverb) {
        // Connect to Destination (controlled by masterGain)
        this.masterGain = new Tone.Gain(0).toDestination();

        // Vibratos
        this.vibratoSpatial = new Tone.Vibrato({ frequency: 3, depth: 0.08, type: 'sine' });
        this.vibratoDeep = new Tone.Vibrato({ frequency: 3, depth: 0.08, type: 'sine' });

        // Routing Chains
        this.spatialDry = new Tone.Gain(0.6).connect(this.masterGain);
        this.spatialSend = new Tone.Gain(0.4).connect(spatialReverb);
        this.vibratoSpatial.connect(this.spatialDry);
        this.vibratoSpatial.connect(this.spatialSend);

        this.centerDry = new Tone.Gain(0.2).connect(this.masterGain);
        this.centerSend = new Tone.Gain(0.8).connect(deepReverb);
        this.vibratoDeep.connect(this.centerDry);
        this.vibratoDeep.connect(this.centerSend);

        this.astralDry = new Tone.Gain(0.2).connect(this.masterGain);
        this.astralSend = new Tone.Gain(0.8).connect(deepReverb);

        // Instantiate Layers from face/layers/
        this.baseLayer = new BaseLayer(this.vibratoSpatial);
        this.hornLayer = new HornLayer(this.vibratoSpatial);
        this.centerSynth = new CenterSynthLayer(this.vibratoDeep);
        this.astralArp = new AstralArpLayer(this.astralDry, this.astralSend);
    }

    public update(detection: any, structureChanged: boolean, orchestraVol: number) {
        if (this.isDisposed) return;
        const now = Tone.now();

        if (detection.activeTriangle && structureChanged) {
            const validNotes = detection.activeTriangle.notes.filter((n: any) => n && typeof n === 'string');
            const sortedNotes = [...validNotes].map(n => ensureOctave(n, 3)).sort();
            const notesKey = sortedNotes.join('-');

            if (this.currentNotes.join('-') !== notesKey) {
                if (now - this.lastTriggerTime > 0.1) {
                    this.currentNotes = sortedNotes;
                    this.lastTriggerTime = now;

                    this.baseLayer.trigger(sortedNotes, false);
                    this.centerSynth.trigger(validNotes, now);
                    this.astralArp.updateSequence(validNotes, detection.activeTriangle.isMajor);
                }
            }

            // Also update horn allocation on structure change
            this.hornLayer.update(validNotes, detection.activeTriangle.positions);
        }

        if (detection.activeTriangle) {
            this.baseLayer.updatePosition(detection.activeTriangle.positions);
        }
    }

    public setVolume(volume: number, bgScale: number, rampTime: number = 0.1) {
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

        // Set layer-specific volume scales
        this.baseLayer.setVolume(bgScale, rampTime);
        this.centerSynth.setVolume(bgScale, rampTime);
        this.astralArp.setVolume(bgScale, rampTime);
    }

    private startLoop() {
        if (this.reTriggerIntervalId) clearInterval(this.reTriggerIntervalId);
        this.reTriggerIntervalId = setInterval(() => {
            if (this.isAudible && !this.isDisposed) {
                if (this.currentNotes.length > 0) this.baseLayer.trigger(this.currentNotes, true);
                this.hornLayer.sustainLoop(Tone.now());
            }
        }, this.RE_TRIGGER_INTERVAL);
    }

    private stopSoundGeneration() {
        if (this.reTriggerIntervalId) {
            clearInterval(this.reTriggerIntervalId);
            this.reTriggerIntervalId = null;
        }
        this.baseLayer.stop();
        this.hornLayer.stop();
        this.centerSynth.stop();
        this.astralArp.stop();
        this.currentNotes = [];
    }

    public triggerExit() {
        if (this.isDisposed) return;
        this.stopSoundGeneration();
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.stopSoundGeneration();

        this.baseLayer.dispose();
        this.hornLayer.dispose();
        this.centerSynth.dispose();
        this.astralArp.dispose();

        this.vibratoSpatial.dispose();
        this.vibratoDeep.dispose();
        this.spatialDry.dispose();
        this.spatialSend.dispose();
        this.centerDry.dispose();
        this.centerSend.dispose();
        this.astralDry.dispose();
        this.astralSend.dispose();
        this.masterGain.dispose();
    }
}
