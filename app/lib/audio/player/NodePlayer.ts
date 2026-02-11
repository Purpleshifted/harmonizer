import * as Tone from 'tone';
import * as THREE from 'three';
import { Effector } from '../node/engine/Effector';
import { CentorTone } from '../node/layers/CentorTone';
import { SurroundingTones } from '../node/layers/SurroundingTones';

export class NodePlayer {
    private effector: Effector;
    private centorTone: CentorTone;
    private surroundingTones: SurroundingTones;
    private isAudible = false;
    private isDisposed = false;

    constructor(reverbs: any, mixer: any) {
        // Main effector handles the wobbling filter and routing
        this.effector = new Effector(reverbs.deep);

        // Layers
        this.centorTone = new CentorTone();
        this.surroundingTones = new SurroundingTones();

        // Connect layers to the central effector
        this.centorTone.connect(this.effector.filter);
        this.surroundingTones.connect(this.effector.filter);

        // Connect to mixer
        this.effector.connect(mixer.masterBus);
    }

    // For throttled heartbeat
    private lastHeartbeat = 0;

    /**
     * Update the player state based on detection
     */
    public update(detection: any, structureChanged: boolean, _padVol: number) {
        if (this.isDisposed) return;

        const isNodeMode = detection.mode === 'node';
        const now = performance.now();

        // Heartbeat log (every 2 seconds)
        if (isNodeMode && now - this.lastHeartbeat > 2000) {
            this.lastHeartbeat = now;
            console.log(`[NodePlayer Heartbeat] Audible: ${this.isAudible}, Vol: ${_padVol}, Notes: ${detection.activeNodes?.length}`);
        }

        // 1. Update CentorTone (Main Pad)
        if (isNodeMode && detection.activeNodes.length > 0) {
            // Re-trigger if the node changed or if it was requested
            if (structureChanged) {
                console.log(`[NodePlayer] Mode: ${detection.mode}, StructureChanged: ${structureChanged}, Audibility: ${this.isAudible}`);
                console.log(`[NodePlayer] Triggering CentorTone for node: ${detection.activeNodes[0].note.name}`);
                this.centorTone.start(detection.activeNodes[0].note.name);
            }
        }

        // 2. Update SurroundingTones (Hexagonal Bells)
        if (isNodeMode && detection.nearestNeighbors.length > 0) {
            const surroundingNotes = detection.nearestNeighbors.map((n: any) => n.note.name);
            const surroundingPos = detection.nearestNeighbors.map((n: any) => n.pos);

            this.surroundingTones.start(surroundingNotes, surroundingPos);
        }
    }

    /**
     * Set global volume coming from LogicCore
     */
    public setVolume(volume: number, rampTime: number = 0.1) {
        if (this.isDisposed) return;

        // Effector handles the linear-to-db conversion and ramping
        this.effector.setOutputVolume(volume, rampTime);

        if (volume > 0.001) {
            if (!this.isAudible) console.log(`[NodePlayer] Becoming AUDIBLE (vol: ${volume})`);
            this.isAudible = true;
        } else {
            if (this.isAudible) console.log(`[NodePlayer] Becoming SILENT`);
            this.isAudible = false;
            // Auto-Stop after fade to free up Tone transport resources if needed
            setTimeout(() => {
                if (!this.isAudible && !this.isDisposed) {
                    this.stop();
                }
            }, rampTime * 1000 + 100);
        }
    }

    /**
     * Stop all layers
     */
    public stop() {
        if (this.isDisposed) return;
        this.centorTone.stop();
        this.surroundingTones.stop();
        this.isAudible = false;
    }

    /**
     * Trigger the exit wash effect
     */
    public triggerExit() {
        if (this.isDisposed) return;
        this.centorTone.triggerExitEffect();
    }

    /**
     * Clean up all resources
     */
    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.centorTone.dispose();
        this.surroundingTones.dispose();
        this.effector.dispose();
    }
}
