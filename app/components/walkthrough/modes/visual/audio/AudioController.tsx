'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { AmbientDrone } from './AmbientDrone';
import { ChordPlayer } from './ChordPlayer';
import { ArpeggiatorPlayer } from './ArpeggiatorPlayer'; // Re-import
import { NodeFocusPad } from './NodeFocusPad';
import { WaveEffect } from './WaveEffect';
import { DetectionResult, NodeCandidate } from '../hooks/useSpatialDetection';
import { updateListener } from './core/SpatialAudio';

interface AudioControllerProps {
    isAudioReady: boolean;
    detectionRef: React.MutableRefObject<DetectionResult | null>;
}

/**
 * Audio controller - manages all audio systems
 * 
 * Uses parallel mixing structure:
 * - All players are active but their volumes are crossfaded based on current mode
 * - This prevents clicks/pops and ensures smooth texture blending
 * 
 * PERFORMANCE OPTIMIZATIONS:
 * - Listener update: Centralized & throttled (100ms)
 * - Horn update: Only on structure change
 * - Volume ramps: Only on mode change
 */
export function AudioController({ isAudioReady, detectionRef }: AudioControllerProps) {
    const { camera } = useThree();

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

    // Initialize audio players
    useEffect(() => {
        if (!isAudioReady) return;

        ambientDroneRef.current = new AmbientDrone();
        chordPlayerRef.current = new ChordPlayer();
        arpeggiatorRef.current = new ArpeggiatorPlayer();
        focusPadRef.current = new NodeFocusPad();
        waveEffectRef.current = new WaveEffect();

        ambientDroneRef.current.start();
        waveEffectRef.current.start(); // Wave effect runs in background/idle

        return () => {
            ambientDroneRef.current?.dispose();
            chordPlayerRef.current?.dispose();
            arpeggiatorRef.current?.dispose();
            focusPadRef.current?.dispose();
            waveEffectRef.current?.dispose();
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
                chordPlayerRef.current.setGlobalVolume(1.0, 0.1); // Restore missing global volume
                chordPlayerRef.current.setBackgroundVolume(volFace, 1.0);
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
                arpeggiatorRef.current.setGlobalVolume(volEdge, FADE_TIME);
            }
        }

        // === Node Player (NodeFocusPad) ===
        if (focusPadRef.current) {
            if (detection.mode === 'node' && detection.activeNodes.length > 0 && structureChanged) {
                focusPadRef.current.start(detection.activeNodes[0].note.name);
            }
            if (modeChanged) {
                focusPadRef.current.setGlobalVolume(volNode, FADE_TIME);

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

