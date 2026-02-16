/**
 * BusSystem - Centralized Signal Routing & Global Effects.
 */
import * as Tone from 'tone';
import { createReverb } from './ReverbFactory';
import { RotationSpatializer } from './RotationSpatializer';

export class BusSystem {
    public readonly ambientBus: Tone.Reverb;
    public readonly spatialBus: Tone.Reverb;
    public readonly deepBus: Tone.Reverb;  // Long tail for Astral/Drones
    public readonly waveBus: Tone.Reverb;  // Lush IR-like for environment
    public readonly waveSpatializer: RotationSpatializer;  // Reverb → spatializer → destination
    public readonly masterBus: Tone.Gain;
    private readonly masterLimiter: Tone.Limiter;

    constructor() {
        // Initialize Reverb Buses (Pure wet for send-bus architecture)
        this.ambientBus = createReverb('ambient');
        this.ambientBus.wet.value = 1.0;
        this.ambientBus.toDestination();

        this.spatialBus = createReverb('spatial');
        this.spatialBus.wet.value = 1.0;
        this.spatialBus.toDestination();

        this.deepBus = createReverb('deep');
        this.deepBus.wet.value = 1.0;
        this.deepBus.toDestination();

        // Wave: reverb first, then rotation-based spatializer (no HRTF)
        this.waveBus = createReverb('wave');
        this.waveBus.wet.value = 1.0;
        this.waveSpatializer = new RotationSpatializer();
        this.waveBus.connect(this.waveSpatializer);
        this.waveSpatializer.connect(Tone.getDestination());

        // Master Limiter to prevent clipping
        this.masterLimiter = new Tone.Limiter(-1.5).toDestination();
        this.masterBus = new Tone.Gain(1.0).connect(this.masterLimiter);
    }

    public dispose() {
        this.ambientBus.dispose();
        this.spatialBus.dispose();
        this.deepBus.dispose();
        this.waveBus.dispose();
        this.waveSpatializer.dispose();
        this.masterBus.dispose();
        this.masterLimiter.dispose();
    }
}
