import * as Tone from 'tone';
import * as THREE from 'three';
import { AudioConfig } from './AudioConfig';

// Input State
export interface DetectionState {
    mode: 'face' | 'edge' | 'node';
    activeNotes: string[];
    centerPos: THREE.Vector3;
    nearbyNotes?: string[];
    nearbyPositions?: THREE.Vector3[];
    distanceToCenter: number; // 0-1 normalized
    isMajor?: boolean;
}

// Output State (What the players should do)
export interface AudioState {
    mix: {
        droneVolume: number;
        chordVolume: number;
        arpVolume: number;
        focusVolume: number;
        waveVolume: number;
    };
    activeNotes: string[];
    centerPos: THREE.Vector3;
    arpPattern?: {
        notes: string[];
        positions: THREE.Vector3[];
    };
    // Transition Flags
    modeChanged: boolean;
    structureChanged: boolean;
    previousMode: 'face' | 'edge' | 'node' | null;
    events: AudioEvent[];
}

export type AudioEventType = 'EXIT_NODE' | 'EXIT_EDGE' | 'EXIT_FACE' | 'ENTER_MODE' | 'STRUCTURE_CHANGE';

export interface AudioEvent {
    type: AudioEventType;
    payload?: any;
}

export class AudioLogicCore {
    private lastMode: 'face' | 'edge' | 'node' | null = null;
    private lastStructureKey: string = '';

    /**
     * Process game state into audio state
     * Now stateful: tracks previous calls to detect changes
     */
    processDetection(detection: DetectionState): AudioState {
        const { mode, distanceToCenter, activeNotes, centerPos } = detection;

        // 1. Detect Changes
        const modeChanged = this.lastMode !== mode;
        const structureKey = activeNotes.sort().join('-');
        const structureChanged = this.lastStructureKey !== structureKey || modeChanged;

        const previousMode = this.lastMode;

        // 2. Generate Events
        const events: AudioEvent[] = [];
        if (modeChanged) {
            if (previousMode === 'node') {
                events.push({ type: 'EXIT_NODE', payload: { nextMode: mode } });
            } else if (previousMode === 'edge') {
                events.push({ type: 'EXIT_EDGE', payload: { nextMode: mode } });
            } else if (previousMode === 'face') {
                events.push({ type: 'EXIT_FACE', payload: { nextMode: mode } });
            }
            events.push({ type: 'ENTER_MODE', payload: { mode, previousMode } });
        }
        if (structureChanged && !modeChanged) {
            events.push({ type: 'STRUCTURE_CHANGE', payload: { notes: activeNotes } });
        }

        // 3. Update internal state
        this.lastMode = mode;
        this.lastStructureKey = structureKey;

        // 4. Calculate Volumes (Delegated to Config)
        const calculatedMix = AudioConfig.calculateVolumes(mode, distanceToCenter);
        const mix = {
            droneVolume: calculatedMix.drone,
            chordVolume: calculatedMix.chord,
            arpVolume: calculatedMix.arp,
            focusVolume: calculatedMix.focus,
            waveVolume: calculatedMix.wave
        };

        // 5. Arp Pattern Logic
        let arpPattern;
        if (mode === 'edge' && activeNotes.length >= 2) {
            arpPattern = {
                notes: activeNotes.slice(0, 2),
                positions: [centerPos, centerPos]
            };
        }

        return {
            mix,
            activeNotes,
            centerPos,
            arpPattern,
            modeChanged,
            structureChanged,
            previousMode,
            events
        };
    }
}
