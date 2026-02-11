
import * as Tone from 'tone';
import { BusName, MixerBus } from './MixerTypes';
import { createReverb, createDelay, ReverbPreset } from './ReverbFactory';

/**
 * AudioMixer - The Central Hub
 * 
 * Responsibilities:
 * 1. Initialize and hold the Audio Context (via Tone)
 * 2. Create and manage Global Buses (Master, Reverbs, Delays)
 * 3. Provide a factory for ChannelStrips
 * 4. Handle global Mute/Pause
 */
export class AudioMixer {
    private static instance: AudioMixer;

    // Buses
    public masterBus: Tone.Gain;
    public limiter: Tone.Limiter;

    // Aux Buses (Effects)
    private buses: Map<BusName, MixerBus> = new Map();

    // Direct Access for convenience
    public ambientReverb!: Tone.Reverb;
    public spatialReverb!: Tone.Reverb;
    public deepReverb!: Tone.Reverb;

    // Effects Storage (to dispose later)
    private effects: Tone.ToneAudioNode[] = [];

    constructor() {
        // 1. Master Chain
        this.limiter = new Tone.Limiter(-1).toDestination();
        this.masterBus = new Tone.Gain(1.0).connect(this.limiter);

        this.registerBus('master', this.masterBus);

        // 2. Create Common Aux Buses
        this.ambientReverb = createReverb('ambient');
        this.spatialReverb = createReverb('spatial');
        this.deepReverb = createReverb('deep');

        this.createAuxBus('reverb-ambient', this.ambientReverb);
        this.createAuxBus('reverb-spatial', this.spatialReverb);
        this.createAuxBus('reverb-deep', this.deepReverb);
        this.createAuxBus('delay', createDelay('8n.', 0.3, 0.5));
    }

    public static getInstance(): AudioMixer {
        if (!AudioMixer.instance) {
            AudioMixer.instance = new AudioMixer();
        }
        return AudioMixer.instance;
    }

    /**
     * Create an Aux Bus with an Effect
     */
    private createAuxBus(name: BusName, effect: Tone.ToneAudioNode) {
        const busInput = new Tone.Gain(1.0);

        // Routing: BusInput -> Effect -> Master
        // Note: Effects in Aux buses should be 100% Wet usually, 
        // but our createReverb factory might return mixed. 
        // For Sends, we usually want the return to go to Master.

        busInput.connect(effect);
        effect.connect(this.masterBus);

        this.effects.push(effect);
        this.registerBus(name, busInput);
    }

    private registerBus(name: BusName, input: Tone.Gain) {
        this.buses.set(name, { name, input });
    }

    public getBus(name: BusName): Tone.Gain {
        const bus = this.buses.get(name);
        if (!bus) {
            console.warn(`[AudioMixer] Bus '${name}' not found. Returning Master.`);
            return this.masterBus;
        }
        return bus.input;
    }

    /**
     * Set Master Volume (Linear 0-1)
     */
    public setMasterVolume(volume: number, rampTime = 0.1) {
        const now = Tone.now();
        this.masterBus.gain.rampTo(volume, rampTime, now);
    }

    public dispose() {
        this.masterBus.dispose();
        this.limiter.dispose();
        this.buses.forEach(b => b.input.dispose());
        this.effects.forEach(e => e.dispose());
        this.buses.clear();
        this.effects = [];
        // Important: Clear singleton instance on disposal
        (AudioMixer as any).instance = undefined;
    }
}
