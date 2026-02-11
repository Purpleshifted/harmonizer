'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import * as Tone from 'tone';
import { createReverb } from '../../../../lib/audio/core/ReverbFactory';

import { GlobalPlayer } from '../../../../lib/audio/player/GlobalPlayer';
import { FacePlayer } from '../../../../lib/audio/player/FacePlayer';
import { EdgePlayer } from '../../../../lib/audio/player/EdgePlayer';
import { NodePlayer } from '../../../../lib/audio/player/NodePlayer';
import { DetectionResult, NodeCandidate } from '../hooks/useSpatialDetection';
import { useControls, folder } from 'leva';
import { updateListener } from '../../../../lib/audio/core/SpatialAudio';
import { AudioLogicCore, DetectionState } from '../../../../lib/audio/core/AudioLogicCore';

interface AudioControllerProps {
    isAudioReady: boolean;
    detectionRef: React.MutableRefObject<DetectionResult | null>;
}

export function AudioController({ isAudioReady, detectionRef }: AudioControllerProps) {
    const { camera } = useThree();

    // Shared Reverbs Refs
    const ambientReverbRef = useRef<Tone.Reverb | null>(null);
    const spatialReverbRef = useRef<Tone.Reverb | null>(null);
    const deepReverbRef = useRef<Tone.Reverb | null>(null);

    const globalPlayerRef = useRef<GlobalPlayer | null>(null);
    const facePlayerRef = useRef<FacePlayer | null>(null);
    const edgePlayerRef = useRef<EdgePlayer | null>(null);
    const nodePlayerRef = useRef<NodePlayer | null>(null);

    const lastModeRef = useRef<string | null>(null);
    const logicCoreRef = useRef<AudioLogicCore>(new AudioLogicCore());

    // === Throttling & Threshold Refs ===
    const lastListenerUpdateRef = useRef(0);
    const lastUpdatePosRef = useRef(new THREE.Vector3());
    const lastUpdateForwardRef = useRef(new THREE.Vector3());
    const LISTENER_UPDATE_INTERVAL = 60; // Slightly faster (approx 16fps)
    const MOVEMENT_THRESHOLD = 0.1; // 10cm movement
    const ROTATION_THRESHOLD = 0.999; // Dot product (approx 2.5 degrees)

    // === Debug Controls ===
    const {
        masterVol,
        ambientVol,
        orchestraVol,
        arpVol,
        padVol,
        waveVol
    } = useControls('Audio Mixer', {
        Master: folder({
            masterVol: { value: 1.0, min: 0, max: 1, label: 'Master Volume' },
        }),
        Layers: folder({
            ambientVol: { value: 0.5, min: 0, max: 1, label: 'Ambient Drone' },
            orchestraVol: { value: 0.8, min: 0, max: 1, label: 'Orchestra' },
            arpVol: { value: 1.0, min: 0, max: 1, label: 'Arpeggiator' },
            padVol: { value: 1.0, min: 0, max: 1, label: 'Focus Pad' },
            waveVol: { value: 0.2, min: 0, max: 1, label: 'Wave Effect' },
        })
    });

    // Apply Volume Controls (Throttled/Effect-based to avoid frame-perf issues)
    useEffect(() => {
        if (Tone.Destination) Tone.Destination.volume.rampTo(Tone.gainToDb(masterVol), 0.1);
    }, [masterVol]);

    // Reactive Layer Volume Updates
    useEffect(() => {
        console.log(`[AudioController] Applying volumes (isReady: ${isAudioReady}):`, { ambientVol, orchestraVol, arpVol, padVol, waveVol });

        if (globalPlayerRef.current) {
            globalPlayerRef.current.setVolumes(ambientVol, waveVol);
        }

        if (facePlayerRef.current) {
            const currentMode = lastModeRef.current || 'face';
            const volFace = currentMode === 'face' ? 1.0 : 0.25;
            facePlayerRef.current.setVolume(1.0 * orchestraVol, volFace * orchestraVol, 0.1);
        }

        if (edgePlayerRef.current) {
            const currentMode = lastModeRef.current;
            const volEdge = currentMode === 'edge' ? 1.0 : 0.0;
            edgePlayerRef.current.setVolume(volEdge * arpVol, 0.1);
        }

        if (nodePlayerRef.current) {
            const currentMode = lastModeRef.current;
            const volNode = currentMode === 'node' ? 1.0 : 0.0;
            nodePlayerRef.current.setVolume(volNode * padVol, 0.1);
        }
    }, [isAudioReady, ambientVol, orchestraVol, arpVol, padVol, waveVol]);

    // Initialize audio players
    useEffect(() => {
        if (!isAudioReady) return;

        // Initialize Global Reverb Buses
        // These are used as Send/Return buses (Wet = 1.0)

        const ambientRev = createReverb('ambient');
        ambientRev.wet.value = 1.0;
        ambientRev.toDestination();
        ambientReverbRef.current = ambientRev;

        const spatialRev = createReverb('spatial');
        spatialRev.wet.value = 1.0;
        spatialRev.toDestination();
        spatialReverbRef.current = spatialRev;

        const deepRev = createReverb('deep');
        deepRev.wet.value = 1.0;
        deepRev.toDestination();
        deepReverbRef.current = deepRev;

        console.log('[AudioController] Initializing audio players...');
        globalPlayerRef.current = new GlobalPlayer(ambientRev);
        facePlayerRef.current = new FacePlayer(spatialRev, deepRev);
        edgePlayerRef.current = new EdgePlayer(spatialRev, deepRev);
        nodePlayerRef.current = new NodePlayer(deepRev);

        globalPlayerRef.current.start();

        // Immediate volume apply for fresh instances
        globalPlayerRef.current.setVolumes(ambientVol, waveVol);

        // Ensure Transport is started for Arpeggiator and LFOs
        if (Tone.getTransport().state !== 'started') {
            Tone.getTransport().start();
        }

        return () => {
            console.log('[AudioController] Disposing audio players...');
            globalPlayerRef.current?.dispose();
            facePlayerRef.current?.dispose();
            edgePlayerRef.current?.dispose();
            nodePlayerRef.current?.dispose();

            // Dispose Reverbs
            ambientReverbRef.current?.dispose();
            spatialReverbRef.current?.dispose();
            deepReverbRef.current?.dispose();
        };
    }, [isAudioReady]);

    useFrame((_, delta) => {
        // Read directly from ref (High frequency, no re-render needed)
        const detection = detectionRef.current;

        if (!isAudioReady || !detection) return;

        const currentMode = detection.mode;
        // const lastMode = lastModeRef.current; // Removed duplicate
        // const modeChanged = lastMode !== currentMode; // Removed duplicate

        // === 1. Prepare Logic State ===
        const detectionState: DetectionState = {
            mode: detection.mode,
            activeNotes: detection.activeNodes.map(n => n.note.name),
            centerPos: detection.centerPos || new THREE.Vector3(),
            distanceToCenter: detection.activeNodes[0]?.distance || 0,
            isMajor: detection.activeTriangle?.isMajor,
            nearbyNotes: detection.nearestNeighbors.map(n => n.note.name),
            nearbyPositions: detection.nearestNeighbors.map(n => n.pos)
        };

        const audioState = logicCoreRef.current.processDetection(detectionState);
        const { modeChanged, structureChanged, mix, events } = audioState;

        // === 0. Centralized Audio Update (Throttled + Movement Threshold) ===
        const now = performance.now();
        const distMoved = camera.position.distanceTo(lastUpdatePosRef.current);
        const currentForward = camera.getWorldDirection(new THREE.Vector3());
        const rotationChange = currentForward.dot(lastUpdateForwardRef.current);
        const timeSinceLastUpdate = now - lastListenerUpdateRef.current;

        // Update if significantly moved, rotated OR if enough time passsed (0.5s safety)
        const shouldUpdateAudio = timeSinceLastUpdate >= LISTENER_UPDATE_INTERVAL &&
            (distMoved > MOVEMENT_THRESHOLD || rotationChange < ROTATION_THRESHOLD || timeSinceLastUpdate > 500);

        if (shouldUpdateAudio) {
            lastListenerUpdateRef.current = now;
            lastUpdatePosRef.current.copy(camera.position);
            lastUpdateForwardRef.current.copy(currentForward);

            // 0.1 Update Listener (Projected to ground as requested)
            const listenerPos = new THREE.Vector3(camera.position.x, 0, camera.position.z);
            const forward = currentForward; // Reuse the calculated direction
            updateListener(listenerPos, forward);

        }

        // 0.3 Mode-specific position updates are now handled inside ModePlayers

        // 2. Target Volumes Calculation (Crossfading)
        const FADE_TIME = 2.0; // Smoother transitions
        const volFace = currentMode === 'face' ? 1.0 : 0.0;
        const volEdge = currentMode === 'edge' ? 1.0 : 0.0;
        const volNode = currentMode === 'node' ? 1.0 : 0.2;

        // 3. Update Players Data & Volume

        // === 0.3 Update Mode-Specific Players ===
        if (facePlayerRef.current) {
            facePlayerRef.current.update(detection, structureChanged, orchestraVol);
            if (modeChanged) {
                facePlayerRef.current.setVolume(mix.chordVolume * orchestraVol, (currentMode === 'face' ? 1.0 : 0.25) * orchestraVol, FADE_TIME);
            }
        }

        if (edgePlayerRef.current) {
            edgePlayerRef.current.update(detection, structureChanged, arpVol);
            if (modeChanged) {
                edgePlayerRef.current.setVolume(mix.arpVolume * arpVol, FADE_TIME);
            }
        }

        if (nodePlayerRef.current) {
            nodePlayerRef.current.update(detection, structureChanged, padVol);
            if (modeChanged) {
                nodePlayerRef.current.setVolume(mix.focusVolume * padVol, FADE_TIME);
            }
        }

        // === 0.4 Process Transition Events ===
        // === 0.4 Process Transition Events (Clean Signalling) ===
        events.forEach(event => {
            switch (event.type) {
                case 'EXIT_NODE':
                    nodePlayerRef.current?.triggerExit();
                    break;
                case 'EXIT_EDGE':
                    edgePlayerRef.current?.triggerExit();
                    break;
                case 'EXIT_FACE':
                    facePlayerRef.current?.triggerExit();
                    break;
            }
        });

        // === Global Player Frame Update (Ambient + Wave) ===
        if (globalPlayerRef.current) {
            const mapToAudioNode = (n: NodeCandidate) => ({
                name: n.note.name,
                value: n.note.value,
                position: n.pos,
                distance: n.distance
            });

            // Apply dynamic volume from Logic Core (multiplied by Master Layer Sliders)
            globalPlayerRef.current.setVolumes(mix.droneVolume * ambientVol, mix.waveVolume * waveVol);

            // We pass delta (seconds) every frame for smooth rotation/timing
            globalPlayerRef.current.update(delta, detection.centerPos || new THREE.Vector3(), detection.nearestFourNotes.map(mapToAudioNode));

            // Note focus changes are logic-heavy, we can keep them here or throttle
            if (currentMode === 'node' && detection.activeNodes.length > 0) {
                globalPlayerRef.current.focusOnNode(detection.activeNodes[0].note.name, 0.6);
            } else {
                globalPlayerRef.current.clearFocus();
            }
        }

        lastModeRef.current = currentMode;
    });

    return null;
}

