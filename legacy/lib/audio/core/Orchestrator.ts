import * as Tone from 'tone';
import * as THREE from 'three';
import { AudioLogicCore, DetectionState } from './AudioLogicCore';
import { AudioConfig } from './AudioConfig';
import { GlobalPlayer } from '../player/GlobalPlayer';
import { FacePlayer } from '../player/FacePlayer';
import { EdgePlayer } from '../player/EdgePlayer';
import { NodePlayer } from '../player/NodePlayer';
import { updateListener } from '../../../../app/lib/audio/utils/SpatialAudio';
import { BusSystem } from './Buses';

/**
 * Orchestrator - The central mediator for the Tonnetz audio system.
 * 
 * It owns all audio resources (Reverbs, Players) and drives them
 * using results from AudioLogicCore. This decouples audio logic from React.
 */
export class Orchestrator {
    // Mode Players
    private globalPlayer: GlobalPlayer;
    private facePlayer: FacePlayer;
    private edgePlayer: EdgePlayer;
    private nodePlayer: NodePlayer;

    // Bus System
    private busSystem: BusSystem;

    // Core Logic
    private logicCore: AudioLogicCore;
    private lastMode: string | null = null;

    // Mix State (Bridged from UI sliders)
    private mixVolumes = {
        ambientVol: 0.5,
        orchestraVol: 0.8,
        arpVol: 1.0,
        padVol: 1.0,
        waveVol: 0.05
    };

    // Throttling for Spatial Updates
    private lastListenerUpdate = 0;
    private lastUpdatePos = new THREE.Vector3();
    private lastUpdateForward = new THREE.Vector3();
    private readonly MOVEMENT_THRESHOLD = 0.1; // 10cm movement
    private readonly ROTATION_THRESHOLD = 0.999; // Dot product (approx 2.5 degrees)

    private isDisposed = false;

    constructor() {
        console.log('[Orchestrator] Initializing Audio Engine...');

        // 1. Initialize Bus System
        this.busSystem = new BusSystem();

        // 2. Initialize Mode Players
        this.globalPlayer = new GlobalPlayer();
        this.facePlayer = new FacePlayer();
        this.edgePlayer = new EdgePlayer();
        this.nodePlayer = new NodePlayer();

        // 3. Connect Players to Matrix
        this.busSystem.connectPlayer(this.globalPlayer);
        this.busSystem.connectPlayer(this.facePlayer);
        this.busSystem.connectPlayer(this.edgePlayer);
        this.busSystem.connectPlayer(this.nodePlayer);

        // 3. Initialize Logic Engine
        this.logicCore = new AudioLogicCore();

        // 4. Global Tone.js Tuning
        Tone.getContext().lookAhead = AudioConfig.timing.lookAhead;
        Tone.getTransport().PPQ = AudioConfig.timing.ppq;

        // Start background atmospheres
        this.globalPlayer.start();

        // Ensure Transport is running for Arpeggiators/LFOs
        if (Tone.getTransport().state !== 'started') {
            Tone.getTransport().start();
        }
    }

    /**
     * Main update loop - called every frame from the React bridge (AudioController)
     */
    public update(detection: any, camera: THREE.Camera, delta: number) {
        if (this.isDisposed || !detection) return;

        // --- LOOKAHEAD SCHEDULING ---
        // Calculate a stable future time for all events in this frame
        const targetTime = Tone.now() + AudioConfig.timing.lookAhead;
        const currentMode = detection.mode;

        // 1. Prepare Logic State from raw detection data
        const detectionState: DetectionState = {
            mode: detection.mode,
            activeNotes: detection.activeNodes.map((n: any) => n.note.name),
            centerPos: detection.centerPos || new THREE.Vector3(),
            distanceToCenter: detection.activeNodes[0]?.distance || 0,
            isMajor: detection.activeTriangle?.isMajor,
            nearbyNotes: detection.nearestNeighbors.map((n: any) => n.note.name),
            nearbyPositions: detection.nearestNeighbors.map((n: any) => n.pos)
        };

        // 2. Run Logic Brain
        const audioState = this.logicCore.processDetection(detectionState);
        const { modeChanged, structureChanged, mix, events } = audioState;

        // 3. Update Listener Positioning (Throttled)
        const now = performance.now();
        const distMoved = camera.position.distanceTo(this.lastUpdatePos);
        const currentForward = camera.getWorldDirection(new THREE.Vector3());
        const rotationChange = currentForward.dot(this.lastUpdateForward);
        const timeSinceLastUpdate = now - this.lastListenerUpdate;

        // Update if significantly moved, rotated OR if enough time passsed (0.5s safety)
        const shouldUpdateSpatial = timeSinceLastUpdate >= AudioConfig.spatial.updateInterval &&
            (distMoved > this.MOVEMENT_THRESHOLD || rotationChange < this.ROTATION_THRESHOLD || timeSinceLastUpdate > 500);

        if (shouldUpdateSpatial) {
            this.lastListenerUpdate = now;
            this.lastUpdatePos.copy(camera.position);
            this.lastUpdateForward.copy(currentForward);

            // Projecting to ground (y=0) as per architectural requirement
            const listenerPos = new THREE.Vector3(camera.position.x, 0, camera.position.z);
            updateListener(listenerPos, currentForward);
        }

        // 4. Update Layer Volumes and internal musicians
        const { ambientVol, orchestraVol, arpVol, padVol, waveVol } = this.mixVolumes;

        // --- Mode: Face ---
        // --- Mode: Face ---
        this.facePlayer.update(detection, structureChanged, orchestraVol, targetTime);

        // Dynamic Volume Update (Every frame)
        const faceRamp = modeChanged ? AudioConfig.timing.fadeTime : 0.1;
        this.facePlayer.setVolume(
            mix.chordVolume * orchestraVol,
            (currentMode === 'face' ? 1.0 : 0.0) * orchestraVol,
            faceRamp,
            targetTime
        );

        // --- Mode: Edge ---
        // --- Mode: Edge ---
        this.edgePlayer.update(detection, structureChanged, arpVol, targetTime);

        const edgeRamp = modeChanged ? AudioConfig.timing.fadeTime : 0.1;
        this.edgePlayer.setVolume(mix.arpVolume * arpVol, edgeRamp, targetTime);

        // --- Mode: Node ---
        // --- Mode: Node ---
        this.nodePlayer.update(detection, structureChanged, padVol, targetTime);

        const nodeRamp = modeChanged ? AudioConfig.timing.fadeTime : 0.1;
        this.nodePlayer.setVolume(mix.focusVolume * padVol, nodeRamp, targetTime);

        // 5. Process Transition Events (Exit Triggers)
        events.forEach(event => {
            switch (event.type) {
                case 'EXIT_NODE': this.nodePlayer.triggerExit(targetTime); break;
                case 'EXIT_EDGE': this.edgePlayer.triggerExit(targetTime); break;
                case 'EXIT_FACE': this.facePlayer.triggerExit(targetTime); break;
            }
        });

        // 6. Global Layers (Ambient Drone + Wave Effect)
        const mapToAudioNode = (n: any) => ({
            name: n.note.name,
            value: n.note.value,
            position: n.pos,
            distance: n.distance
        });

        this.globalPlayer.setVolumes(mix.droneVolume * ambientVol, mix.waveVolume * waveVol, targetTime);
        this.globalPlayer.update(delta, detection.centerPos || new THREE.Vector3(), detection.nearestFourNotes.map(mapToAudioNode), targetTime);

        // Node Focus Handling
        if (currentMode === 'node' && detection.activeNodes.length > 0) {
            this.globalPlayer.focusOnNode(detection.activeNodes[0].note.name, 0.6, targetTime);
        } else {
            this.globalPlayer.clearFocus(targetTime);
        }

        this.lastMode = currentMode;
    }

    /**
     * Bridge UI slider volumes to the orchestrator
     */
    public setLayerVolumes(volumes: { ambientVol: number; orchestraVol: number; arpVol: number; padVol: number; waveVol: number }) {
        if (this.isDisposed) return;
        this.mixVolumes = { ...volumes };
        // Sync global players immediately
        this.globalPlayer.setVolumes(this.mixVolumes.ambientVol, this.mixVolumes.waveVol, Tone.now());
    }

    /**
     * Clean up all audio resources
     */
    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        console.log('[Orchestrator] Disposing Audio Engine...');

        this.globalPlayer.dispose();
        this.facePlayer.dispose();
        this.edgePlayer.dispose();
        this.nodePlayer.dispose();

        this.busSystem.dispose();
    }
}
