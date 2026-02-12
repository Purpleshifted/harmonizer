/**
 * NodePlayer - Orchestrates the Node Mode audio experience
 * Coordinates the Central Tone and Surrounding Tones via the Effector
 */

import * as Tone from 'tone';
import * as THREE from 'three';
import { Effector } from '../node/engine/Effectors';
import { CentorTone } from '../node/layers/CentorTone';
import { SurroundingTones } from '../node/layers/SurroundingTones';
import { AudioConfig } from '../core/AudioConfig';

export class NodePlayer {
    private effector: Effector;
    private centorTone: CentorTone;
    private surroundingTones: SurroundingTones;

    private isAudible = false;
    private isDisposed = false;
    private stopTimeout: NodeJS.Timeout | null = null;

    constructor(deepReverb: Tone.Reverb) {
        // 1. Central Engine (Effects & Routing)
        this.effector = new Effector(deepReverb);

        // 2. Layers
        this.centorTone = new CentorTone();
        this.surroundingTones = new SurroundingTones();

        // 3. Connect Layers -> Engine
        this.centorTone.connect(this.effector);
        this.surroundingTones.connect(this.effector); // Bypasses lowpass filter
    }

    /**
     * Update loop to handle musical changes based on detection
     */
    public update(detection: any, structureChanged: boolean, _padVol: number) {
        if (this.isDisposed || !this.isAudible) return;

        // 1. Central Pad Logic
        if (detection.mode === 'node' && detection.activeNodes.length > 0) {
            const currentNode = detection.activeNodes[0].note.name;

            // Robust Triggering: Trigger if structure changed OR if it should be playing but isn't
            if (structureChanged || !this.centorTone.active) {
                this.centorTone.start(currentNode);
            }
        } else {
            // Stop if not in node mode or no active nodes
            if (this.centorTone.active) {
                this.centorTone.stop();
            }
        }

        // 2. Surrounding Bell Logic
        if (detection.mode === 'node' && detection.nearestNeighbors.length > 0) {
            const surroundingNotes = detection.nearestNeighbors.map((n: any) => n.note.name);
            const surroundingPos = detection.nearestNeighbors.map((n: any) => n.pos);

            // Update candidates pool for random sparkles
            this.surroundingTones.updateCandidates(surroundingNotes, surroundingPos);
            this.surroundingTones.start();
        } else {
            this.surroundingTones.stop();
        }
    }

    public setVolume(volume: number, rampTime: number = 0.1) {
        if (this.isDisposed) return;
        const profile = AudioConfig.transitions.node;

        // Apply specific NODE master transition time (focus) if fading out
        const effectiveRamp = volume < 0.01 ? profile.master : rampTime;
        this.effector.setOutputVolume(volume, effectiveRamp);

        if (volume > 0.001) {
            this.isAudible = true;
            if (this.stopTimeout) {
                clearTimeout(this.stopTimeout);
                this.stopTimeout = null;
            }
            // Ensure Transport is running for bells
            if (Tone.getTransport().state !== 'started') {
                Tone.getTransport().start();
            }
        } else {
            this.isAudible = false;
            // Auto-Stop logic
            if (this.stopTimeout) clearTimeout(this.stopTimeout);
            this.stopTimeout = setTimeout(() => {
                if (!this.isAudible && !this.isDisposed) {
                    this.stop();
                }
            }, effectiveRamp * 1000 + 200);
        }
    }

    public stop() {
        if (this.isDisposed) return;
        this.centorTone.stop();
        this.surroundingTones.stop();
        this.isAudible = false;
    }

    public triggerExit() {
        if (this.isDisposed) return;
        this.centorTone.triggerExitEffect();
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;

        this.centorTone.dispose();
        this.surroundingTones.dispose();
        this.effector.dispose();
    }
}
