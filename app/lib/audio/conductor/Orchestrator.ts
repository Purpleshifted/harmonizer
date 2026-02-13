/**
 * Orchestrator - The Top-Level Audio Command Center.
 */
import * as Tone from 'tone';
import * as THREE from 'three';
import { Dirigent } from './Dirigent';
import { updateListener } from '../utils/SpatialAudio';

export class Orchestrator {
    private dirigent: Dirigent | null = null;
    private initialized = false;

    // Spatial State
    private lastUpdatePos = new THREE.Vector3();
    private readonly MOVEMENT_THRESHOLD = 0.1;

    constructor() {
        // Delayed internal boot to ensure Tone.context is ready
        this.boot();
    }

    private async boot() {
        if (this.initialized) return;

        try {
            console.log('[Orchestrator] Booting engine...');

            // Ensure context is running
            if (Tone.context.state !== 'running') {
                console.log('[Orchestrator] Starting Tone Context...');
                await Tone.start();
            }

            console.log('[Orchestrator] Initializing Conductor...');
            this.dirigent = new Dirigent();

            this.initialized = true;
            console.log('[Orchestrator] Conductor is on the podium. Ready for updates.');
        } catch (error) {
            console.error('[Orchestrator] CRITICAL BOOT FAILURE:', error);
        }
    }

    public update(detection: any, camera: THREE.Camera, delta: number) {
        if (!this.initialized || !this.dirigent || !detection) return;

        // Logging every ~100 frames to avoid spamming
        if (Math.random() < 0.01) {
            console.log('[Orchestrator] Update pulse. Mode:', detection.mode, 'Notes:', detection.activeNodes?.length);
        }

        const time = Tone.now();

        // 1. Update Spatial Listener
        const distMoved = camera.position.distanceTo(this.lastUpdatePos);
        const currentForward = camera.getWorldDirection(new THREE.Vector3());

        if (distMoved > this.MOVEMENT_THRESHOLD) {
            this.lastUpdatePos.copy(camera.position);
            const listenerPos = new THREE.Vector3(camera.position.x, 1.2, camera.position.z);
            updateListener(listenerPos, currentForward);
        }

        // 2. Prepare Mode Data
        const modeData = {
            targetMode: detection.mode,
            notes: detection.activeNodes.map((n: any) => n.note.name),
            positions: detection.activeNodes.map((n: any) => n.pos),
            isLoop: detection.isLoop || false,
            isMajor: detection.isMajor || false
        };

        // 3. Prepare Drone Data
        const droneNotes = detection.nearestFourNotes ? detection.nearestFourNotes.map((n: any) => ({
            name: n.note.name,
            position: n.pos,
            distance: n.distance
        })) : modeData.notes.map((n: string, i: number) => ({
            name: n,
            position: modeData.positions[i] || detection.centerPos,
            distance: modeData.positions[i] ? modeData.positions[i].distanceTo(camera.position) : 10
        }));

        const droneData = { notes: droneNotes };

        // 4. Prepare Arp Data
        const arpData = {
            note1: detection.activeEdge?.note1.name || detection.activeNodes[0]?.note.name || '',
            note2: detection.activeEdge?.note2.name || detection.activeNodes[1]?.note.name || '',
            pos1: detection.activeEdge?.pos1 || detection.activeNodes[0]?.pos || detection.centerPos,
            pos2: detection.activeEdge?.pos2 || detection.activeNodes[1]?.pos || detection.centerPos,
            dist1: detection.activeEdge?.distance1 || detection.activeNodes[0]?.distance || 10,
            dist2: detection.activeEdge?.distance2 || detection.activeNodes[1]?.distance || 10,
            neighbors: detection.nearestNeighbors?.map((n: any) => ({
                note: n.note,
                pos: n.pos,
                distance: n.distance
            })) || []
        };

        // 5. Global parameters
        const globalData = {
            centerPos: detection.centerPos || new THREE.Vector3(),
            delta: delta
        };

        // Dispatch to Conductor
        this.dirigent.update(modeData, droneData, arpData, globalData, time);
    }

    /**
     * Bridge mixer volumes to the conductor
     */
    public setLayerVolumes(vol: { ambientVol: number; orchestraVol: number; arpVol: number; padVol: number; waveVol: number }) {
        // Implement volume scaling in Dirigent if needed, 
        // for now let's just make sure it's called
    }

    public dispose() {
        if (!this.initialized || !this.dirigent) return;
        this.dirigent.dispose();
        this.dirigent = null;
        this.initialized = false;
        console.log('[Orchestrator] Podium cleared.');
    }
}
