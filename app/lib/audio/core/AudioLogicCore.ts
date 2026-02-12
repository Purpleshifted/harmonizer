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

    // Mode Latching (Debouncing)
    private pendingMode: 'face' | 'edge' | 'node' | null = null;
    private modeTimestamp: number = 0;
    private readonly DEBOUNCE_MS = 250; // Wait 250ms to confirm mode

    /**
     * Process game state into audio state
     * Now stateful: tracks previous calls to detect changes
     */
    processDetection(detection: DetectionState): AudioState {
        const { distanceToCenter, activeNotes, centerPos } = detection;
        const now = performance.now();

        let targetMode = detection.mode;

        // 1. MODE DEBOUNCING (Hysteresis)
        if (targetMode !== this.lastMode) {
            if (targetMode !== this.pendingMode) {
                // Potential new mode detected, start timer
                this.pendingMode = targetMode;
                this.modeTimestamp = now;
            }

            // Check if we've been in the pending mode long enough
            if (now - this.modeTimestamp >= this.DEBOUNCE_MS) {
                // Confirmed! (Commit change later)
            } else {
                // Too soon, stick with the stable lastMode
                targetMode = this.lastMode || targetMode;
            }
        } else {
            // Stable - clear pending
            this.pendingMode = null;
        }

        const modeChanged = this.lastMode !== targetMode;

        // 2. STRUCTURE TRACKING (Chord Changes)
        const structureKey = activeNotes.sort().join('-');
        const structureChanged = this.lastStructureKey !== structureKey || modeChanged;

        const previousMode = this.lastMode;

        // 3. Generate Events
        const events: AudioEvent[] = [];
        if (modeChanged) {
            if (previousMode === 'node') {
                events.push({ type: 'EXIT_NODE', payload: { nextMode: targetMode } });
            } else if (previousMode === 'edge') {
                events.push({ type: 'EXIT_EDGE', payload: { nextMode: targetMode } });
            } else if (previousMode === 'face') {
                events.push({ type: 'EXIT_FACE', payload: { nextMode: targetMode } });
            }
            events.push({ type: 'ENTER_MODE', payload: { mode: targetMode, previousMode } });
        }

        if (structureChanged && !modeChanged) {
            events.push({ type: 'STRUCTURE_CHANGE', payload: { notes: activeNotes } });
        }

        // 4. Update internal state
        this.lastMode = targetMode;
        this.lastStructureKey = structureKey;

        // 5. Calculate Volumes (Delegated to Config)
        const calculatedMix = AudioConfig.calculateVolumes(targetMode, distanceToCenter);
        const mix = {
            droneVolume: calculatedMix.drone,
            chordVolume: calculatedMix.chord,
            arpVolume: calculatedMix.arp,
            focusVolume: calculatedMix.focus,
            waveVolume: calculatedMix.wave
        };

        // 6. Arp Pattern Logic
        let arpPattern;
        if (targetMode === 'edge' && activeNotes.length >= 2) {
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
