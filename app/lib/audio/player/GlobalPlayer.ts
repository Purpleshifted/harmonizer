import * as Tone from 'tone';
import * as THREE from 'three';
import { AmbientDrone } from '../global/AmbientDrone';
import { WaveEffect } from '../global/WaveEffect';

/**
 * GlobalPlayer - Coordinates AmbientDrone and WaveEffect
 * Manages background atmospheres and global wave logic.
 */
export class GlobalPlayer {
    private ambientDrone: AmbientDrone;
    private waveEffect: WaveEffect;
    private isDisposed = false;

    constructor(ambientReverb: Tone.Reverb) {
        this.ambientDrone = new AmbientDrone(ambientReverb);
        this.waveEffect = new WaveEffect();
    }

    public start() {
        if (this.isDisposed) return;
        this.ambientDrone.start();
        this.waveEffect.start();
    }

    public update(delta: number, centerPos: THREE.Vector3, nearbyNotes: any[]) {
        if (this.isDisposed) return;

        // Update components
        this.ambientDrone.updateNotes(nearbyNotes);
        this.waveEffect.update(delta, centerPos);
    }

    public setVolumes(ambientVol: number, waveVol: number) {
        if (this.isDisposed) return;
        this.ambientDrone.setVolume(ambientVol, 0.5);
        this.waveEffect.setVolume(waveVol, 1.0);
    }

    public focusOnNode(noteName: string, intensity: number = 0.6) {
        if (this.isDisposed) return;
        this.ambientDrone.focusOnNote(noteName, intensity);
    }

    public clearFocus() {
        if (this.isDisposed) return;
        this.ambientDrone.clearFocus();
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.ambientDrone.dispose();
        this.waveEffect.dispose();
    }
}
