import * as Tone from 'tone';
import * as THREE from 'three';
import { AmbientDrone } from '../global/AmbientDrone';
import { WaveEffect } from '../global/WaveEffect';
import { AudioConfig } from '../core/AudioConfig';
import { AudioPorts, MatrixPlayer } from '../core/Buses';

/**
 * GlobalPlayer - Coordinates AmbientDrone and WaveEffect
 * Manages background atmospheres and global wave logic.
 */
export class GlobalPlayer implements MatrixPlayer {
    public readonly ports: AudioPorts;
    private ambientDrone: AmbientDrone;
    private waveEffect: WaveEffect;
    private isDisposed = false;

    constructor() {
        this.ambientDrone = new AmbientDrone();
        this.waveEffect = new WaveEffect();

        // Standardized Ports
        this.ports = {
            main: new Tone.Gain(1.0),
            ambient: new Tone.Gain(1.0)
        };

        // Wire internal components to our ports
        this.ambientDrone.ports.main.connect(this.ports.main);
        if (this.ambientDrone.ports.ambient && this.ports.ambient) {
            this.ambientDrone.ports.ambient.connect(this.ports.ambient as unknown as Tone.InputNode);
        }

        this.waveEffect.ports.main.connect(this.ports.main);
        if (this.waveEffect.ports.ambient && this.ports.ambient) {
            this.waveEffect.ports.ambient.connect(this.ports.ambient as unknown as Tone.InputNode);
        }
    }

    public start() {
        if (this.isDisposed) return;
        this.ambientDrone.start();
        this.waveEffect.start();
    }

    public update(delta: number, centerPos: THREE.Vector3, nearbyNotes: any[], time: number) {
        if (this.isDisposed) return;

        // Update components
        this.ambientDrone.updateNotes(nearbyNotes, time);
        this.waveEffect.update(delta, centerPos);
    }

    public setVolumes(ambientVol: number, waveVol: number, time: number) {
        if (this.isDisposed) return;
        const profile = AudioConfig.transitions.global;

        // Use profile timings from AudioConfig
        this.ambientDrone.setVolume(ambientVol, profile.ambient, time);
        this.waveEffect.setVolume(waveVol, profile.wave, time);
    }

    public focusOnNode(noteName: string, intensity: number = 0.6, time: number) {
        if (this.isDisposed) return;
        this.ambientDrone.focusOnNote(noteName, intensity, time);
    }

    public clearFocus(time: number) {
        if (this.isDisposed) return;
        this.ambientDrone.clearFocus(time);
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.ambientDrone.dispose();
        this.waveEffect.dispose();
    }
}
