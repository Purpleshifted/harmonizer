'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import * as Tone from 'tone';
import { createReverb } from '../../../../lib/audio/core/ReverbFactory';

import { AmbientDrone } from '../../../../lib/audio/AmbientDrone';
import { ChordPlayer } from '../../../../lib/audio/ChordPlayer';
import { ArpeggiatorPlayer } from '../../../../lib/audio/ArpeggiatorPlayer';
import { NodeFocusPad } from '../../../../lib/audio/NodeFocusPad';
import { WaveEffect } from '../../../../lib/audio/WaveEffect';
import { DetectionResult, NodeCandidate } from '../hooks/useSpatialDetection';
import { useControls, folder } from 'leva';
import { updateListener } from '../../../../lib/audio/core/SpatialAudio';

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

    const ambientDroneRef = useRef<AmbientDrone | null>(null);
    const chordPlayerRef = useRef<ChordPlayer | null>(null);
    const arpeggiatorRef = useRef<ArpeggiatorPlayer | null>(null);
    const focusPadRef = useRef<NodeFocusPad | null>(null);
    const waveEffectRef = useRef<WaveEffect | null>(null);

    const lastModeRef = useRef<string | null>(null);
    const prevAudioStructureRef = useRef({ mode: '', nodeNames: '' });

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
        if (ambientDroneRef.current) {
            // AmbientDrone needs a setVolume method or we access gain directly if public
            // Currently it has setFocus/ClearFocus but not global volume scaler exposed cleanly?
            // checking AmbientDrone... it has masterGain but private.
            // For now, let's assume we might need to add setVolume to AmbientDrone or just re-trigger focus.
            // Actually AmbientDrone has no setGlobalVolume. I should add it.
        }

        if (chordPlayerRef.current) {
            // ChordPlayer has setGlobalVolume.
            // We need to know current multiplier (based on mode). 
            // This is tricky without state.
            // Ideally modifying the players to accept a "Mixer Volume" separate from "Fade Volume".
            // For now, let's just re-apply the current mode's volume * Leva volume.
            const currentMode = lastModeRef.current;
            const volFace = currentMode === 'face' ? 1.0 : 0.25;
            chordPlayerRef.current.setGlobalVolume(1.0 * orchestraVol, 0.1);
            chordPlayerRef.current.setBackgroundVolume(volFace * orchestraVol, 0.1);
        }

        if (arpeggiatorRef.current) {
            const currentMode = lastModeRef.current;
            const volEdge = currentMode === 'edge' ? 1.0 : 0.0;
            arpeggiatorRef.current.setGlobalVolume(volEdge * arpVol, 0.1);
        }

        if (focusPadRef.current) {
            const currentMode = lastModeRef.current;
            const volNode = currentMode === 'node' ? 1.0 : 0.0;
            focusPadRef.current.setGlobalVolume(volNode * padVol, 0.1);
        }

        if (waveEffectRef.current) {
            // WaveEffect has internal gain logic. I might need to add setVolume.
        }

    }, [ambientVol, orchestraVol, arpVol, padVol, waveVol]);

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

        // Initialize Players with Shared Reverbs
        ambientDroneRef.current = new AmbientDrone(ambientRev);
        chordPlayerRef.current = new ChordPlayer(spatialRev, deepRev);
        arpeggiatorRef.current = new ArpeggiatorPlayer(spatialRev, deepRev);
        focusPadRef.current = new NodeFocusPad(deepRev);

        waveEffectRef.current = new WaveEffect(); // WaveEffect manages its own internal reverb (for now, or refactor later)

        ambientDroneRef.current.start();
        waveEffectRef.current.start(); // Wave effect runs in background/idle

        return () => {
            ambientDroneRef.current?.dispose();
            chordPlayerRef.current?.dispose();
            arpeggiatorRef.current?.dispose();
            focusPadRef.current?.dispose();
            waveEffectRef.current?.dispose();

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
        const lastMode = lastModeRef.current;
        const modeChanged = lastMode !== currentMode;

        // Internal structure change detection (More robust than relying on the hook's single-frame flag)
        const currentNodeNames = detection.activeNodes.map(n => n.note.name).sort().join('-');
        const structureChanged = currentMode !== prevAudioStructureRef.current.mode ||
            currentNodeNames !== prevAudioStructureRef.current.nodeNames;

        if (structureChanged) {
            prevAudioStructureRef.current = { mode: currentMode, nodeNames: currentNodeNames };
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

            // 0.2 Update Ambient Drone
            if (ambientDroneRef.current) {
                const mapToAudioNode = (n: NodeCandidate) => ({
                    name: n.note.name,
                    value: n.note.value,
                    position: n.pos,
                    distance: n.distance
                });

                ambientDroneRef.current.updateNotes(detection.nearestFourNotes.map(mapToAudioNode));

                if (currentMode === 'node' && detection.activeNodes.length > 0) {
                    ambientDroneRef.current.focusOnNote(detection.activeNodes[0].note.name, 0.6);
                } else {
                    ambientDroneRef.current.clearFocus();
                }
            }

            // 0.3 Update Active Player Positions (for panner smoothness)
            if (chordPlayerRef.current && detection.activeTriangle) {
                chordPlayerRef.current.updatePositions(detection.activeTriangle.positions);
            }
        }

        // 2. Target Volumes Calculation (Crossfading)
        const FADE_TIME = 1.0;
        const volFace = currentMode === 'face' ? 1.0 : 0.25;
        const volEdge = currentMode === 'edge' ? 1.0 : 0.0;
        const volNode = currentMode === 'node' ? 1.0 : 0.0;

        // 3. Update Players Data & Volume

        // === Face/Orchestra Player ===
        if (chordPlayerRef.current) {
            if (detection.activeTriangle && structureChanged) {
                chordPlayerRef.current.playChord(detection.activeTriangle.notes, detection.activeTriangle.positions, detection.activeTriangle.isMajor);
            }

            if (structureChanged) {
                let hornNotes: string[] = [];
                let hornPositions: THREE.Vector3[] = [];

                if (currentMode === 'node' && detection.activeNodes.length > 0) {
                    hornNotes = [detection.activeNodes[0].note.name];
                    hornPositions = [detection.activeNodes[0].pos];
                } else if (currentMode === 'edge' && detection.activeEdge) {
                    const { note1, note2, pos1, pos2 } = detection.activeEdge;
                    hornNotes = [note1.name, note2.name];
                    hornPositions = [pos1, pos2];
                } else if (currentMode === 'face' && detection.activeTriangle) {
                    hornNotes = detection.activeTriangle.notes;
                    hornPositions = detection.activeTriangle.positions;
                }
                chordPlayerRef.current.updateActiveHorns(hornNotes, hornPositions);
            }

            if (modeChanged) {
                const volFace = currentMode === 'face' ? 1.0 : 0.25;
                // Apply Leva volume modifier
                chordPlayerRef.current.setGlobalVolume(1.0 * orchestraVol, 0.1);
                chordPlayerRef.current.setBackgroundVolume(volFace * orchestraVol, 1.0);
            } else {
                // Determine if we need to update volume due to Leva change (Simpler: just update every frame? No, too heavy)
                // Better: React to Leva change in a separate useEffect? 
                // Creating a specific effect for volume updates helps.
            }
        }

        // === Edge Player (Arpeggiator) ===
        if (arpeggiatorRef.current) {
            if (detection.activeEdge && structureChanged) {
                const { note1, note2, pos1, pos2, distance1, distance2, midpoint } = detection.activeEdge;
                arpeggiatorRef.current.startArpeggio(
                    note1.name,
                    note2.name,
                    pos1,
                    pos2,
                    distance1,
                    distance2,
                    midpoint,
                    detection.nearestNeighbors.map(n => n.note.name),
                    detection.nearestNeighbors.map(n => n.pos)
                );
            }
            if (modeChanged) {
                arpeggiatorRef.current.setGlobalVolume(volEdge * arpVol, FADE_TIME);
            }
        }

        // === Node Player (NodeFocusPad) ===
        if (focusPadRef.current) {
            if (detection.mode === 'node' && detection.activeNodes.length > 0 && structureChanged) {
                focusPadRef.current.start(detection.activeNodes[0].note.name);
            }
            if (modeChanged) {
                focusPadRef.current.setGlobalVolume(volNode * padVol, FADE_TIME);

                // Trigger exit noise if leaving node mode
                if (lastMode === 'node' && currentMode !== 'node') {
                    focusPadRef.current.triggerExitEffect();
                }
            }
        }

        // === Wave Effect ===
        if (waveEffectRef.current) {
            waveEffectRef.current.update(delta, detection.centerPos || new THREE.Vector3());

            if (modeChanged && lastMode === 'node' && currentMode !== 'node') {
                const isMajor = currentMode === 'face' ? detection.activeTriangle?.isMajor : undefined;
                waveEffectRef.current.triggerTransition(currentMode as 'face' | 'edge', isMajor);
            }
        }

        lastModeRef.current = currentMode;
    });

    return null;
}

