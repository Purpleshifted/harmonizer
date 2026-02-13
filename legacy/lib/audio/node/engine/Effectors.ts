/**
 * Effector - Central effects chain for Node Mode
 * Handles the wobbling LFO Filter, Reverb Sends, and Master Volume
 */

import * as Tone from 'tone';
import { AudioConfig } from '../../core/AudioConfig';
import { AudioPorts, MatrixPlayer } from '../../core/Buses';

export class Effector implements MatrixPlayer {
    public readonly ports: AudioPorts;
    public readonly filter: Tone.Filter;
    public readonly directInput: Tone.Gain; // Bypasses filter, goes to volume (for bells)

    private lfo: Tone.LFO;
    private volume: Tone.Volume;
    private dryGain: Tone.Gain;
    private sendGain: Tone.Gain;
    private isDisposed = false;

    constructor() {
        // 1. Wobble Filter (Main Input)
        this.filter = new Tone.Filter({
            type: 'lowpass',
            frequency: 400,
            Q: 1
        });

        // Slow LFO (breathing effect)
        this.lfo = new Tone.LFO({
            frequency: 0.2, // 5 seconds cycle
            min: 300,
            max: 800,
            type: 'sine'
        }).start();
        this.lfo.connect(this.filter.frequency);

        // 2. Volume Control (Master logic for this player)
        this.volume = new Tone.Volume(-10);

        // 3. Output Split (Dry / Wet) - Linked to AudioConfig
        const deepSend = AudioConfig.mix.focus.deepSend;
        this.dryGain = new Tone.Gain(1 - deepSend);
        this.sendGain = new Tone.Gain(deepSend);

        this.ports = {
            main: this.dryGain,
            deep: this.sendGain
        };

        // Direct Input (Bypass Filter) -> Volume
        this.directInput = new Tone.Gain(1.0);

        // Connections
        // Filter Path: Filter -> Volume
        this.filter.connect(this.volume);

        // Direct Path: Direct -> Volume
        this.directInput.connect(this.volume);

        // Output Path: Volume -> Dry/Wet
        this.volume.connect(this.dryGain);
        this.volume.connect(this.sendGain);
    }

    /**
     * Set the master output volume (linear 0-1)
     */
    public setOutputVolume(volume: number, rampTime: number = 0.1, time: number) {
        if (this.isDisposed) return;

        // Convert linear to dB
        const targetDb = volume < 0.01 ? -60 : 20 * Math.log10(volume);
        this.volume.volume.rampTo(targetDb, rampTime, time);
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;

        this.lfo.dispose();
        this.filter.dispose();
        this.volume.dispose();
        this.directInput.dispose();
        this.dryGain.dispose();
        this.sendGain.dispose();
        // sharedDeepReverb is not disposed here
    }
}
