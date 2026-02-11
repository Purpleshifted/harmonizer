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

        // 4. Calculate Volumes (Crossfading)
        const mix = {
            droneVolume: 0,
            chordVolume: 0,
            arpVolume: 0,
            focusVolume: 0,
            waveVolume: 0
        };

        switch (mode) {
            case 'face':
                mix.droneVolume = AudioConfig.mix.drone.volume * (0.4 + 0.6 * distanceToCenter);
                mix.chordVolume = Tone.dbToGain(AudioConfig.mix.chord.baseVolume) * (1 - distanceToCenter * 0.5);
                mix.waveVolume = 0;
                break;

            case 'edge':
                mix.droneVolume = AudioConfig.mix.drone.volume * 0.8; // Louder Ambient in Edge mode
                mix.arpVolume = Tone.dbToGain(AudioConfig.mix.arp.volume);
                mix.waveVolume = AudioConfig.mix.wave.maxVolume * 0.2;
                break;

            case 'node':
                mix.droneVolume = AudioConfig.mix.drone.volume * 0.2;
                mix.focusVolume = Tone.dbToGain(AudioConfig.mix.focus.volume);
                mix.waveVolume = AudioConfig.mix.wave.maxVolume * 0.5;
                break;
        }

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
