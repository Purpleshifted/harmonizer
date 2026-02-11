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
import { AudioMixer } from '../../../../lib/audio/core/AudioMixer';

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
    const audioMixerRef = useRef<AudioMixer | null>(null);

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
            ambientVol: { value: 1.0, min: 0, max: 1, label: 'Ambient Drone' },
            orchestraVol: { value: 1.0, min: 0, max: 1, label: 'Orchestra' },
            arpVol: { value: 1.0, min: 0, max: 1, label: 'Arpeggiator' },
            padVol: { value: 1.0, min: 0, max: 1, label: 'Focus Pad' },
            waveVol: { value: 1.0, min: 0, max: 1, label: 'Wave Effect' },
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

        // === 1. Initialize Mixer & Global Effects ===
        const mixer = AudioMixer.getInstance();
        audioMixerRef.current = mixer;

        const reverbs = {
            ambient: mixer.ambientReverb,
            spatial: mixer.spatialReverb,
            deep: mixer.deepReverb
        };

        ambientReverbRef.current = mixer.ambientReverb;
        spatialReverbRef.current = mixer.spatialReverb;
        deepReverbRef.current = mixer.deepReverb;

        console.log('[AudioController] Initializing audio players...');
        globalPlayerRef.current = new GlobalPlayer(mixer.ambientReverb);
        facePlayerRef.current = new FacePlayer(reverbs, mixer);
        edgePlayerRef.current = new EdgePlayer(reverbs, mixer);
        nodePlayerRef.current = new NodePlayer(reverbs, mixer);

        globalPlayerRef.current.start();

        // Immediate volume apply for fresh instances
        globalPlayerRef.current.setVolumes(ambientVol, waveVol);

        return () => {
            console.log('[AudioController] Disposing audio players...');
            globalPlayerRef.current?.dispose();
            facePlayerRef.current?.dispose();
            edgePlayerRef.current?.dispose();
            nodePlayerRef.current?.dispose();
            mixer.dispose(); // Cleanup global mixer
        };
    }, [isAudioReady]);
    // ambientVol and waveVol are needed for the immediate volume apply.

    // For throttled controller logs
    const lastControllerLog = useRef(0);

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

        const nowTs = performance.now();
        if (nowTs - lastControllerLog.current > 3000) {
            lastControllerLog.current = nowTs;
            console.log(`[AudioController] Loop: Mode=${currentMode}, Notes=${detectionState.activeNotes.length}, FocusVol=${mix.focusVolume.toFixed(3)}, structureChanged=${structureChanged}`);
        }

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
        const FADE_TIME = 1.0;
        const volFace = currentMode === 'face' ? 1.0 : 0.25;
        const volEdge = currentMode === 'edge' ? 1.0 : 0.0;
        const volNode = currentMode === 'node' ? 1.0 : 0.0;

        // 3. Update Players Data & Volume

        // === 0.3 Update Mode-Specific Players ===
        // Note: setVolume is called BEFORE update to ensure isAudible state is correct for the first trigger
        if (facePlayerRef.current) {
            facePlayerRef.current.setVolume(mix.chordVolume * orchestraVol, (currentMode === 'face' ? 1.0 : 0.25) * orchestraVol, modeChanged ? FADE_TIME : 0.2);
            facePlayerRef.current.update(detection, structureChanged, orchestraVol);
        }

        if (edgePlayerRef.current) {
            edgePlayerRef.current.setVolume(mix.arpVolume * arpVol, modeChanged ? FADE_TIME : 0.2);
            edgePlayerRef.current.update(detection, structureChanged, arpVol);
        }

        if (nodePlayerRef.current) {
            nodePlayerRef.current.setVolume(mix.focusVolume * padVol, modeChanged ? FADE_TIME : 0.2);
            nodePlayerRef.current.update(detection, structureChanged, padVol);
        }

        // === 0.4 Process Transition Events ===
        events.forEach(event => {
            if (event.type === 'EXIT_NODE' && nodePlayerRef.current) {
                console.log('[AudioController] EXIT_NODE event received');
                nodePlayerRef.current.triggerExit();
            }
            if (event.type.startsWith('ENTER_')) {
                console.log(`[AudioController] Transition: ${event.type}`);
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

