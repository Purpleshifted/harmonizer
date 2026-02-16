/**
 * WaveRevolver - The Environmental Performer (Worklet-based)
 * Chain: worklet → reverb → RotationSpatializer (no HRTF).
 */
import { WaveEffectWorklet } from '../worklets/WaveEffectWorklet';
import type { RotationSpatializer } from '../engine/RotationSpatializer';

export interface WaveRevolverPorts {
    main?: AudioNode | any;
    wave?: AudioNode | any;
    waveSpatializer?: RotationSpatializer;
}

export class WaveRevolver {
    private worklet: WaveEffectWorklet;
    private spatializer: RotationSpatializer | null = null;
    private isDisposed = false;

    constructor(ports: WaveRevolverPorts | any) {
        this.worklet = new WaveEffectWorklet();
        // Wave goes to reverb only (reverb → spatializer chain is in Buses)
        if (ports?.wave) {
            this.worklet.output.connect(ports.wave as any);
        }
        this.spatializer = ports?.waveSpatializer ?? null;
    }

    /**
     * Apply DSP updates. Spatializer uses listenerYaw + waveAngle (rotation only).
     */
    update(
        intensity: number,
        filterFreq: number,
        listenerYaw: number,
        waveAngle: number,
        time: number
    ) {
        if (this.isDisposed) return;
        this.worklet.update(intensity, filterFreq, time);
        if (this.spatializer) {
            this.spatializer.update(listenerYaw, waveAngle, time);
        }
    }

    stop() {
        if (this.isDisposed) return;
        this.worklet.stop();
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.worklet.stop();
        this.worklet.dispose();
    }
}
