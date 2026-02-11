import * as Tone from 'tone';
import * as THREE from 'three';
import { Spatializer } from '../engine/Spatializer';
import { Fader } from '../engine/Fader';
import { createOrchestraEnsemble, OrchestraEnsemble } from '../factory/InstrumentFactory';

export class BaseLayer {
    private layers: Array<{
        ensemble: OrchestraEnsemble;
        fader: Fader;
    }> = [];
    private currentLayerIndex = 0;
    private spatializer: Spatializer;
    private outputFader: Fader;

    constructor(destination: Tone.ToneAudioNode) {
        this.spatializer = new Spatializer({ refDist: 3, maxDist: 40 });
        this.outputFader = new Fader(0.8);

        for (let i = 0; i < 3; i++) {
            const ensemble = createOrchestraEnsemble(['contrabass', 'cello'], [-3, -3]);
            const fader = new Fader(0);
            ensemble.connect(fader.gain);
            fader.connect(this.spatializer.panner);
            this.layers.push({ ensemble, fader });
        }

        this.spatializer.connect(this.outputFader.gain);
        this.outputFader.connect(destination);
    }

    public trigger(notes: string[], isLoop: boolean) {
        const now = Tone.now();
        const velocity = isLoop ? 0.6 : 0.8;
        const SWELL_TIME = 4.0;
        const FADE_OUT_TIME = 6.0;

        const nextLayer = this.layers[this.currentLayerIndex];
        this.currentLayerIndex = (this.currentLayerIndex + 1) % this.layers.length;

        if (nextLayer.ensemble.isLoaded) {
            nextLayer.fader.rampTo(1.0, SWELL_TIME / 3, now);
            nextLayer.ensemble.triggerAttack(notes, now, velocity);
        }

        const prevIdx = (this.currentLayerIndex + 1) % this.layers.length;
        const oldLayer = this.layers[prevIdx];
        if (oldLayer.ensemble.isLoaded) {
            oldLayer.fader.rampTo(0, FADE_OUT_TIME / 3, now);
            setTimeout(() => {
                oldLayer.ensemble.releaseAll();
            }, FADE_OUT_TIME * 1000);
        }
    }

    public updatePosition(positions: THREE.Vector3[]) {
        if (positions.length === 0) return;
        const center = new THREE.Vector3();
        positions.forEach(p => center.add(p));
        center.divideScalar(positions.length);
        center.add(new THREE.Vector3(0, 0, 1)); // Float offset
        this.spatializer.update(center, 1.0);
    }

    public setVolume(scale: number, rampTime: number) {
        this.outputFader.rampTo(0.8 * scale, rampTime);
    }

    public stop() {
        this.layers.forEach(layer => {
            layer.ensemble.releaseAll();
            layer.fader.setValue(0);
        });
    }

    public dispose() {
        this.layers.forEach(layer => {
            layer.ensemble.dispose();
            layer.fader.dispose();
        });
        this.spatializer.dispose();
        this.outputFader.dispose();
    }
}
