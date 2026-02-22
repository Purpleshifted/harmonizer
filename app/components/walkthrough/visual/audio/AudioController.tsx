'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import * as Tone from 'tone';
import { useControls } from 'leva';

import { AmbientDrone } from './AmbientDrone';
import { ChordPlayer } from './ChordPlayer';
import { ArpeggiatorPlayer } from './ArpeggiatorPlayer';
import { NodeFocusPad } from './NodeFocusPad';
import { WaveEffect } from '../../audio/WaveEffect';
import { ArpEngine } from '../../audio/arp/ArpEngine';
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
const LAYER_DEFAULTS = {
    ambientDrone: false,
    chordPlayer: false,
    arpeggiator: true,
    nodeFocusPad: false,
    waveEffect: false,
};

export function AudioController({ isAudioReady, detectionRef }: AudioControllerProps) {
    const { camera } = useThree();

    const layers = useControls('Audio Layers', {
        'Ambient Drone': { value: LAYER_DEFAULTS.ambientDrone, label: 'Ambient Drone' },
        'Chord (Face)': { value: LAYER_DEFAULTS.chordPlayer, label: 'Chord (Face)' },
        'Arpeggiator': { value: LAYER_DEFAULTS.arpeggiator, label: 'Arpeggiator' },
        'Node Focus Pad': { value: LAYER_DEFAULTS.nodeFocusPad, label: 'Node Focus Pad' },
        'Wave Effect': { value: LAYER_DEFAULTS.waveEffect, label: 'Wave Effect' },
    });

    const ambientDroneRef = useRef<AmbientDrone | null>(null);
    const chordPlayerRef = useRef<ChordPlayer | null>(null);
    const arpeggiatorRef = useRef<ArpeggiatorPlayer | null>(null);
    const focusPadRef = useRef<NodeFocusPad | null>(null);
    const waveEffectRef = useRef<WaveEffect | null>(null);
    const arpEngineRef = useRef<ArpEngine | null>(null);

    const lastModeRef = useRef<string | null>(null);
    const prevAudioStructureRef = useRef({ mode: '', nodeNames: '' });
    const playersInitializedRef = useRef(false);

    const MODE_DEBOUNCE_MS = 80;
    const stableDetectionRef = useRef<DetectionResult | null>(null);
    const pendingStableKeyRef = useRef<string>('');
    const pendingStableSinceRef = useRef(0);

    // === Throttling & Threshold Refs ===
    const lastListenerUpdateRef = useRef(0);
    const lastUpdatePosRef = useRef(new THREE.Vector3());
    const lastUpdateForwardRef = useRef(new THREE.Vector3());
    const LISTENER_UPDATE_INTERVAL = 60; // Slightly faster (approx 16fps)
    const MOVEMENT_THRESHOLD = 0.1; // 10cm movement
    const ROTATION_THRESHOLD = 0.999; // Dot product (approx 2.5 degrees)

    // Initialize audio players once when user first enables audio. Always ensure Tone.start() before creating any nodes.
    useEffect(() => {
        if (!isAudioReady || playersInitializedRef.current) return;

        let cancelled = false;
        (async () => {
            await Tone.start();
            if (cancelled || playersInitializedRef.current) return;
            playersInitializedRef.current = true;
            ambientDroneRef.current = new AmbientDrone();
            chordPlayerRef.current = new ChordPlayer();
            arpeggiatorRef.current = new ArpeggiatorPlayer();
            focusPadRef.current = new NodeFocusPad();
            waveEffectRef.current = new WaveEffect();
            arpEngineRef.current = new ArpEngine({
                edge: arpeggiatorRef.current,
                node: focusPadRef.current,
            });

            ambientDroneRef.current.start();
            waveEffectRef.current.start();
        })();
        return () => {
            cancelled = true;
        };
    }, [isAudioReady]);

    useEffect(() => {
        if (isAudioReady) return;
        if (!playersInitializedRef.current) return;
        const t = 0.15;
        ambientDroneRef.current?.setGlobalVolume(0, t);
        chordPlayerRef.current?.setGlobalVolume(0, t);
        arpeggiatorRef.current?.setGlobalVolume(0, t);
        focusPadRef.current?.setGlobalVolume(0, t);
        waveEffectRef.current?.setOutputGain(0, t);
    }, [isAudioReady]);

    useEffect(() => {
        return () => {
            arpEngineRef.current?.dispose();
            ambientDroneRef.current?.dispose();
            chordPlayerRef.current?.dispose();
            arpeggiatorRef.current?.dispose();
            focusPadRef.current?.dispose();
            waveEffectRef.current?.dispose();
            ambientDroneRef.current = null;
            chordPlayerRef.current = null;
            arpeggiatorRef.current = null;
            focusPadRef.current = null;
            waveEffectRef.current = null;
            playersInitializedRef.current = false;
        };
    }, []);

    useFrame((_, delta) => {
        const detection = detectionRef.current;
        if (!isAudioReady || !detection) return;

        const now = performance.now();
        const currentMode = detection.mode;
        const currentNodeNames = detection.activeNodes.map(n => n.note.name).sort().join('-');
        const currentKey = `${currentMode}-${currentNodeNames}`;

        if (currentKey !== pendingStableKeyRef.current) {
            pendingStableKeyRef.current = currentKey;
            pendingStableSinceRef.current = now;
        }
        if (now - pendingStableSinceRef.current >= MODE_DEBOUNCE_MS) {
            const prevStableKey = stableDetectionRef.current
                ? `${stableDetectionRef.current.mode}-${stableDetectionRef.current.activeNodes.map(n => n.note.name).sort().join('-')}`
                : '';
            if (currentKey !== prevStableKey) stableDetectionRef.current = detection;
        }
        const stable = stableDetectionRef.current ?? detection;

        const lastMode = lastModeRef.current;
        const modeChanged = lastMode !== currentMode;
        const stableNodeNames = stable.activeNodes.map(n => n.note.name).sort().join('-');
        const structureChanged = stable.mode !== prevAudioStructureRef.current.mode || stableNodeNames !== prevAudioStructureRef.current.nodeNames;
        if (structureChanged) {
            prevAudioStructureRef.current = { mode: stable.mode, nodeNames: stableNodeNames };
        }

        // === 0. Centralized Audio Update (Throttled + Movement Threshold) ===
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
            if (layers['Ambient Drone'] && ambientDroneRef.current) {
                const mapToAudioNode = (n: NodeCandidate) => ({
                    name: n.note.name,
                    value: n.note.value,
                    position: n.pos,
                    distance: n.distance
                });
                ambientDroneRef.current.updateNotes(stable.nearestFourNotes.map(mapToAudioNode));
                if (currentMode === 'node' && stable.activeNodes.length > 0) {
                    ambientDroneRef.current.focusOnNote(stable.activeNodes[0].note.name, 0.6);
                } else {
                    ambientDroneRef.current.clearFocus();
                }
            }
            if (layers['Chord (Face)'] && chordPlayerRef.current && stable.activeTriangle) {
                chordPlayerRef.current.updatePositions(stable.activeTriangle.positions);
            }
        }

        if (ambientDroneRef.current) {
            ambientDroneRef.current.setGlobalVolume(layers['Ambient Drone'] ? 1 : 0, 0.15);
        }

        const FADE_TIME = 1.0;
        const volFace = currentMode === 'face' ? 1.0 : 0.25;
        const volEdge = currentMode === 'edge' ? 1.0 : 0.0;
        const volNode = currentMode === 'node' ? 1.0 : 0.0;
        const arpMasterOn = layers['Arpeggiator'];
        const faceArpOn = layers['Chord (Face)'] || arpMasterOn;
        const nodeArpOn = layers['Node Focus Pad'] || arpMasterOn;

        if (chordPlayerRef.current) {
            if (!faceArpOn) {
                chordPlayerRef.current.setGlobalVolume(0, 0.15);
            } else {
                if (layers['Chord (Face)'] && stable.activeTriangle && structureChanged) {
                    chordPlayerRef.current.playChord(stable.activeTriangle.notes, stable.activeTriangle.positions, stable.activeTriangle.isMajor);
                }
                if (layers['Chord (Face)'] && structureChanged) {
                    let hornNotes: string[] = [];
                    let hornPositions: THREE.Vector3[] = [];
                    if (currentMode === 'node' && stable.activeNodes.length > 0) {
                        hornNotes = [stable.activeNodes[0].note.name];
                        hornPositions = [stable.activeNodes[0].pos];
                    } else if (currentMode === 'edge' && stable.activeEdge) {
                        const { note1, note2, pos1, pos2 } = stable.activeEdge;
                        hornNotes = [note1.name, note2.name];
                        hornPositions = [pos1, pos2];
                    } else if (currentMode === 'face' && stable.activeTriangle) {
                        hornNotes = stable.activeTriangle.notes;
                        hornPositions = stable.activeTriangle.positions;
                    }
                    chordPlayerRef.current.updateActiveHorns(hornNotes, hornPositions);
                }
                if (modeChanged || !layers['Chord (Face)']) {
                    chordPlayerRef.current.setGlobalVolume(currentMode === 'face' ? 1.0 : 0.0, 0.1);
                }
                if (layers['Chord (Face)'] && modeChanged) {
                    chordPlayerRef.current.setBackgroundVolume(volFace, 1.0);
                }
            }
        }

        if (arpEngineRef.current) {
            arpEngineRef.current.update(currentMode as 'node' | 'edge' | 'face', stable);
        }
        if (arpeggiatorRef.current) {
            arpeggiatorRef.current.setGlobalVolume(arpMasterOn ? volEdge : 0, modeChanged ? FADE_TIME : 0.15);
        }
        if (focusPadRef.current) {
            if (!nodeArpOn) {
                focusPadRef.current.setGlobalVolume(0, 0.15);
            } else {
                if (modeChanged || !layers['Node Focus Pad']) {
                    focusPadRef.current.setGlobalVolume(currentMode === 'node' ? volNode : 0, FADE_TIME);
                }
                if (layers['Node Focus Pad'] && modeChanged && lastMode === 'node' && currentMode !== 'node') {
                    focusPadRef.current.triggerExitEffect();
                }
            }
        }

        if (waveEffectRef.current) {
            if (!layers['Wave Effect']) {
                waveEffectRef.current.setOutputGain(0, 0.15);
            } else {
                waveEffectRef.current.update(delta, detection.centerPos || new THREE.Vector3());
                if (modeChanged && lastMode === 'node' && currentMode !== 'node') {
                    const isMajor = currentMode === 'face' ? detection.activeTriangle?.isMajor : undefined;
                    waveEffectRef.current.triggerTransition(currentMode as 'face' | 'edge', isMajor);
                }
            }
        }

        lastModeRef.current = currentMode;
    });

    return null;
}


