/**
 * Buses - Centralized Signal Routing for the Tonnetz Audio Engine
 */
import * as Tone from 'tone';
import { createReverb } from './ReverbFactory';

/**
 * Standardized output ports for Matrix-compatible players
 */
export interface AudioPorts {
    main: Tone.Gain;
    spatial?: Tone.Gain;
    deep?: Tone.Gain;
    ambient?: Tone.Gain;
    wave?: Tone.Gain;
}

export interface MatrixPlayer {
    readonly ports: AudioPorts;
}

/**
 * BusSystem - Manages global effect buses and routing
 */
export class BusSystem {
    public readonly ambientBus: Tone.Reverb;
    public readonly spatialBus: Tone.Reverb;
    public readonly deepBus: Tone.Reverb;
    public readonly waveBus: Tone.Reverb;
    public readonly masterBus: Tone.Gain;
    private readonly masterLimiter: Tone.Limiter;

    private isDisposed = false;

    constructor() {
        // Initialize Reverb Buses (Set wet to 1.0 for send-bus architecture)
        this.ambientBus = createReverb('ambient');
        this.ambientBus.wet.value = 1.0;
        this.ambientBus.toDestination();

        this.spatialBus = createReverb('spatial');
        this.spatialBus.wet.value = 1.0;
        this.spatialBus.toDestination();

        this.deepBus = createReverb('deep');
        this.deepBus.wet.value = 1.0;
        this.deepBus.toDestination();

        this.waveBus = createReverb('wave');
        this.waveBus.wet.value = 1.0;
        this.waveBus.toDestination();

        // Master Output Bus with Limiter to prevent crackling/clipping
        this.masterLimiter = new Tone.Limiter(-1.5).toDestination();
        this.masterBus = new Tone.Gain(1.0).connect(this.masterLimiter);
    }

    /**
     * Wire a player's ports to the global buses
     */
    public connectPlayer(player: MatrixPlayer) {
        if (this.isDisposed) return;

        // 1. Main output always goes to master
        player.ports.main.connect(this.masterBus);

        // 2. Optional Sends
        if (player.ports.spatial) {
            player.ports.spatial.connect(this.spatialBus);
        }
        if (player.ports.deep) {
            player.ports.deep.connect(this.deepBus);
        }
        if (player.ports.ambient) {
            player.ports.ambient.connect(this.ambientBus);
        }
        if (player.ports.wave) {
            player.ports.wave.connect(this.waveBus);
        }
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;

        this.ambientBus.dispose();
        this.spatialBus.dispose();
        this.deepBus.dispose();
        this.waveBus.dispose();
        this.masterBus.dispose();
        this.masterLimiter.dispose();
    }
}
