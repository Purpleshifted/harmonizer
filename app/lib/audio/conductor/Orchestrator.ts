/**
 * Orchestrator - Top-level audio: boot, spatial listener, data prep, mix policy.
 * Delegates performance to Dirigent.
 */
import * as Tone from 'tone';
import * as THREE from 'three';
import { Dirigent } from './Dirigent';
import { updateListener } from '../utils/SpatialAudio';
import { getMixForMode } from '../engine/Levels';
import { ThresholdLogic } from '../../detection';

export class Orchestrator {
    private dirigent: Dirigent | null = null;
    private initialized = false;

    // Spatial State
    private lastUpdatePos = new THREE.Vector3();
    /** Larger threshold = fewer listener updates when moving (reduces automation buildup) */
    private readonly MOVEMENT_THRESHOLD = 0.25;

    private readonly thresholdLogic = new ThresholdLogic();

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

    public update(detection: any, camera: THREE.Camera, delta: number, keyHoldSec = 0, isMoving = false) {
        if (!this.initialized || !this.dirigent || !detection) return;

        const time = Tone.now();

        // 1. Update Spatial Listener
        const distMoved = camera.position.distanceTo(this.lastUpdatePos);
        const currentForward = camera.getWorldDirection(new THREE.Vector3());

        if (distMoved > this.MOVEMENT_THRESHOLD) {
            this.lastUpdatePos.copy(camera.position);
            const listenerPos = new THREE.Vector3(camera.position.x, 1.2, camera.position.z);
            updateListener(listenerPos, currentForward);
        }

        // 2. Threshold filter (debounce, cruising)
        const { mode: filteredMode, cruising } = this.thresholdLogic.filter({
            mode: detection.mode,
            isEdge: detection.isEdge ?? false,
            keyHoldSec,
            distMoved,
            isMoving,
        });

        // 3. Prepare Mode Data (use filtered mode)
        const modeData = {
            targetMode: filteredMode,
            notes: detection.activeNodes.map((n: any) => n.note.name),
            positions: detection.activeNodes.map((n: any) => n.pos),
            isLoop: detection.isLoop || false,
            isMajor: detection.isMajor || false,
            // Node mode: 6 adjacent notes (인접음 6개) for arpeggiator
            adjacentNodeNotes: detection.adjacentNodeNotes,
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

        // 4. Prepare Arp Data (prefer notePicker when available)
        const notePicker = detection.notePicker;
        const pickNote1 = notePicker?.lineNotes?.[0] ?? detection.activeEdge?.note1?.name ?? detection.activeNodes[0]?.note?.name ?? '';
        const pickNote2 = notePicker?.lineNotes?.[1] ?? detection.activeEdge?.note2?.name ?? detection.activeNodes[1]?.note?.name ?? '';
        const allNeighborCandidates = [
            ...(detection.adjacentNodeNotes ?? []),
            ...(detection.nearestNeighbors ?? []),
        ];
        const buildNeighbor = (name: string) => {
            const found = allNeighborCandidates.find((n: any) => n.note?.name === name);
            return found ? { note: found.note, pos: found.pos, distance: found.distance ?? 15 } : { note: { name }, pos: detection.centerPos, distance: 15 };
        };
        const arpNoteNames = notePicker
            ? [...(notePicker.dotNote ? [notePicker.dotNote] : []), ...(notePicker.hexNotes ?? []).slice(0, 5)]
            : [];
        const arpNeighbors = arpNoteNames.length > 0
            ? arpNoteNames.map((name: string) => buildNeighbor(name))
            : (detection.nearestNeighbors ?? []).map((n: any) => ({ note: n.note, pos: n.pos, distance: n.distance }));

        const arpData = {
            note1: pickNote1,
            note2: pickNote2,
            pos1: detection.activeEdge?.pos1 || detection.activeNodes[0]?.pos || detection.centerPos,
            pos2: detection.activeEdge?.pos2 || detection.activeNodes[1]?.pos || detection.centerPos,
            dist1: detection.activeEdge?.distance1 ?? detection.activeNodes[0]?.distance ?? 10,
            dist2: detection.activeEdge?.distance2 ?? detection.activeNodes[1]?.distance ?? 10,
            neighbors: arpNeighbors,
            notePicker,
        };

        // 5. Global parameters (listenerForward for wave rotation-based spatializer)
        const globalData = {
            centerPos: detection.centerPos || new THREE.Vector3(),
            cameraY: camera.position.y,
            delta: delta,
            listenerForward: currentForward,
        };

        // 6. Mix policy by mode (cruising: Face volume not reduced when IsEdge)
        const mixLevels = getMixForMode(filteredMode, { cruising });

        this.dirigent.update(modeData, droneData, arpData, globalData, mixLevels, time);
    }

    /**
     * Optional UI bridge: override mix levels (e.g. from a mixer).
     * Default policy is in engine/Levels.ts and applied via getMixForMode(detection.mode).
     */
    public setLayerVolumes(_vol: { ambientVol: number; orchestraVol: number; arpVol: number; padVol: number; waveVol: number }) {
        // Future: map UI sliders to Levels or pass custom MixLevels into update path
    }

    public dispose() {
        if (!this.initialized || !this.dirigent) return;
        this.dirigent.dispose();
        this.dirigent = null;
        this.initialized = false;
        console.log('[Orchestrator] Podium cleared.');
    }
}
