import * as Tone from 'tone';
import * as THREE from 'three';
import { ensureOctave } from '../core/NoteUtils';
import { AudioConfig } from '../core/AudioConfig';
import { StringsLayer } from '../face/layers/StringsLayer';
import { HornLayer } from '../face/layers/HornLayer';
import { CenterSynthLayer } from '../face/layers/CenterSynthLayer';
import { AstralArpLayer } from '../face/layers/AstralArpLayer';
import { AudioPorts, MatrixPlayer } from '../core/Buses';

/**
 * FacePlayer - Central Manager for Face Mode (Chordal / Orchestral)
 * Coordinates multiple musical layers and handles high-level playback logic.
 */
export class FacePlayer implements MatrixPlayer {
    public readonly ports: AudioPorts;
    private baseLayer: StringsLayer;
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
    private reTriggerLoop: Tone.Loop | null = null;
    private pendingStop = false;
    readonly RE_TRIGGER_INTERVAL = AudioConfig.timing.reTriggerInterval;

    constructor() {
        // Connect to Destination (controlled by masterGain)
        this.masterGain = new Tone.Gain(0);

        this.ports = {
            main: this.masterGain,
            spatial: new Tone.Gain(1.0),
            deep: new Tone.Gain(1.0)
        };

        // Vibratos
        this.vibratoSpatial = new Tone.Vibrato({ frequency: 3, depth: 0.08, type: 'sine' });
        this.vibratoDeep = new Tone.Vibrato({ frequency: 3, depth: 0.08, type: 'sine' });

        const config = AudioConfig.mix.chord;

        // Routing Chains - Dynamically linked to AudioConfig
        this.spatialDry = new Tone.Gain(1 - config.reverbSend).connect(this.masterGain);
        this.spatialSend = new Tone.Gain(config.reverbSend);
        if (this.ports.spatial) this.spatialSend.connect(this.ports.spatial);

        this.vibratoSpatial.connect(this.spatialDry);
        this.vibratoSpatial.connect(this.spatialSend);

        this.centerDry = new Tone.Gain(1 - config.deepSend).connect(this.masterGain);
        this.centerSend = new Tone.Gain(config.deepSend);
        if (this.ports.deep) this.centerSend.connect(this.ports.deep);

        this.vibratoDeep.connect(this.centerDry);
        this.vibratoDeep.connect(this.centerSend);

        this.astralDry = new Tone.Gain(1 - config.deepSend).connect(this.masterGain);
        this.astralSend = new Tone.Gain(config.deepSend);
        if (this.ports.deep) this.astralSend.connect(this.ports.deep);

        // Instantiate Layers from face/layers/
        this.baseLayer = new StringsLayer(this.vibratoSpatial);
        this.hornLayer = new HornLayer(this.vibratoSpatial);
        this.centerSynth = new CenterSynthLayer(this.vibratoDeep);
        this.astralArp = new AstralArpLayer(this.astralDry, this.astralSend);
    }

    public update(detection: any, structureChanged: boolean, orchestraVol: number, time: number) {
        if (this.isDisposed) return;

        if (detection.activeTriangle && structureChanged) {
            const validNotes = detection.activeTriangle.notes.filter((n: any) => n && typeof n === 'string');
            const sortedNotes = [...validNotes].map(n => ensureOctave(n, 3)).sort();
            const notesKey = sortedNotes.join('-');

            // Force re-trigger if structureChanged (e.g. mode transition) OR if notes actually changed
            const isSameNotes = this.currentNotes.join('-') === notesKey;

            if (!isSameNotes || structureChanged) {
                if (time - this.lastTriggerTime > 0.1) {
                    this.currentNotes = sortedNotes;
                    this.lastTriggerTime = time;

                    this.baseLayer.trigger(sortedNotes, false, time);
                    this.centerSynth.trigger(validNotes, time);
                    this.astralArp.updateSequence(validNotes, detection.activeTriangle.isMajor);
                }
            }

            // Also update horn allocation on structure change
            this.hornLayer.update(validNotes, detection.activeTriangle.positions, time);
        }

        if (detection.activeTriangle) {
            this.baseLayer.updatePosition(detection.activeTriangle.positions);
        }
    }

    public setVolume(volume: number, bgScale: number, rampTime: number = 0.1, time: number) {
        if (this.isDisposed) return;
        const profile = AudioConfig.transitions.face;

        // Use the profile's master fade time when fading out
        const effectiveMasterRamp = volume < 0.01 ? profile.master : rampTime;
        this.masterGain.gain.rampTo(volume, effectiveMasterRamp, time);

        if (volume > 0.001) {
            this.isAudible = true;
            this.isPlaying = true;
            if (!this.reTriggerLoop) this.startLoop();

            // Cancel pending stop generation if we just became audible
            this.pendingStop = false;
        } else {
            // Only schedule stop if we were audible and aren't already stopping
            if (this.isAudible && !this.pendingStop) {
                this.isAudible = false;
                this.pendingStop = true;

                (Tone.getContext() as any).setTimeout(() => {
                    if (!this.isAudible && !this.isDisposed) {
                        this.stopSoundGeneration();
                        this.isPlaying = false;
                    }
                    this.pendingStop = false;
                }, profile.horns + 0.1);
            }
        }

        // --- LAYER-SPECIFIC FADE TIMES FROM PROFILE ---
        this.baseLayer.setVolume(bgScale, profile.strings, time);
        this.centerSynth.setVolume(bgScale, profile.strings, time);
        this.astralArp.setVolume(bgScale, profile.astral, time);
    }

    private startLoop() {
        if (this.reTriggerLoop) return; // Already running

        this.reTriggerLoop = new Tone.Loop((time) => {
            if (this.isAudible && !this.isDisposed) {
                if (this.currentNotes.length > 0) this.baseLayer.trigger(this.currentNotes, true, time);
                this.hornLayer.sustainLoop(time);
            }
        }, this.RE_TRIGGER_INTERVAL / 1000).start(0);

        // Ensure Transport is running
        if (Tone.getTransport().state !== 'started') {
            Tone.getTransport().start();
        }
    }

    private stopSoundGeneration() {
        if (this.reTriggerLoop) {
            this.reTriggerLoop.stop();
            this.reTriggerLoop.dispose();
            this.reTriggerLoop = null;
        }
        this.baseLayer.stop();
        this.hornLayer.stop();
        this.centerSynth.stop();
        this.astralArp.stop();
        this.currentNotes = [];
    }

    public triggerExit(time: number) {
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
