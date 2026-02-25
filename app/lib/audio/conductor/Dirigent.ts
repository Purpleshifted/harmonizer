/**
 * Dirigent - Performer conductor only: receives precomputed mode/drone/arp/global data and mix levels,
 * runs conduct* and performers. Does not decide mix policy (Orchestrator + engine/Levels.ts).
 */
import * as Tone from 'tone';
import * as THREE from 'three';

// Import Performers
import { FaceEnsemble } from '../performer/FaceEnsemble';
import { BaseDrone } from '../performer/BaseDrone';
import { ArpeggiatorEngine } from '../performer/ArpeggiatorEngine';
import { NodeSynth } from '../performer/NodeSynth';
import { FaceSynth } from '../performer/FaceSynth';
import { WaveRevolver } from '../performer/WaveRevolver';

// Import specialized logic
import { HarmonyLogic } from '../composer/HarmonyLogic';
import { EnvironmentLogic } from '../composer/EnvironmentLogic';
import { PatternScore } from '../composer/PatternScore';
import { NODE_MODE_LOGIC_PRESET } from '../presets/ArpModeLogicPresets';
import { sortNotesByPitch } from '../utils/NoteUtils';
import { forwardToYaw } from '../engine/RotationSpatializer';

// Import Effectors & Sources
import { BusSystem } from '../engine/Buses';
import { AudioMetrics } from '../AudioMetrics';
import { WAVE_SAMPLER_CONFIG, ORCHESTRA_CONFIG } from '../sources/Sampler';
import type { MixLevels } from '../engine/Levels';

export class Dirigent {
    private buses: BusSystem;
    private faceEnsemble: any;
    private baseDrone: any;
    private arpeggiatorEngine: ArpeggiatorEngine;
    private nodeSynth: any;
    private faceSynth: any;
    private waveRevolver: any;

    private harmony: HarmonyLogic;
    private env: EnvironmentLogic;
    private pattern: PatternScore;

    private activeFaceVoices: Map<string, any>;
    private currentEdgeKey: string;
    private lastFaceArpKey: string = '';
    private faceArpCycleIndex = 0;
    private lastFaceSynthKey: string = '';
    private lastMode: string = '';
    private lastFaceOrchestraScale: number = -1;
    private lastFaceArpScale: number = -1;
    /** When we left face mode (Tone time); null while in face or after fade started */
    private timeLeftFace: number | null = null;
    /** Throttle wave/drone updates to reduce automation buildup when moving */
    private lastWaveUpdateTime = 0;
    private lastDroneUpdateTime = 0;
    private static readonly WAVE_UPDATE_INTERVAL = 0.1;
    private static readonly DRONE_UPDATE_INTERVAL = 0.1;

    constructor() {
        // 1. Initialize Global Effect Buses (Reverbs/Limiter)
        this.buses = new BusSystem();
        const ports = {
            main: this.buses.masterBus,
            ambient: this.buses.ambientBus,
            spatial: this.buses.spatialBus,
            deep: this.buses.deepBus,
            wave: this.buses.waveBus,
            waveSpatializer: this.buses.waveSpatializer,
        };

        // 2. Performers (Unified ArpeggiatorEngine replaces NodeArpeggiator, EdgeArpeggiator, FaceArpeggiator)
        this.faceEnsemble = new FaceEnsemble(ports as any);
        this.baseDrone = new BaseDrone(ports as any);
        this.arpeggiatorEngine = new ArpeggiatorEngine(ports as any);
        this.nodeSynth = new NodeSynth(ports as any);
        this.faceSynth = new FaceSynth(ports as any);
        this.waveRevolver = new WaveRevolver(ports as any);

        // 3. Specialized Logic
        this.harmony = new HarmonyLogic();
        this.env = new EnvironmentLogic();
        this.pattern = new PatternScore();
        // State
        this.activeFaceVoices = new Map<string, any>();
        this.currentEdgeKey = '';
    }

    public update(
        modeData: { targetMode: string, notes: string[], positions: THREE.Vector3[], isLoop: boolean, isMajor?: boolean, adjacentNodeNotes?: Array<{ note: { name: string }; pos: THREE.Vector3 }> },
        droneData: { notes: Array<{ name: string, position: THREE.Vector3, distance: number }> },
        arpData: { note1: string, note2: string, pos1: THREE.Vector3, pos2: THREE.Vector3, dist1: number, dist2: number, neighbors: any[] },
        globalData: { centerPos: THREE.Vector3, cameraY?: number, delta: number, listenerForward?: THREE.Vector3 },
        mixLevels: MixLevels,
        time: number
    ) {
        const mode = modeData.targetMode;
        const exitingNode = this.lastMode === 'node' && mode !== 'node';

        if (mode !== 'face') {
            this.lastFaceOrchestraScale = -1;
            this.lastFaceArpScale = -1;
            if (this.lastMode === 'face') this.timeLeftFace = time;
        } else {
            this.timeLeftFace = null;
        }

        // Time is tracked globally via AudioMetrics.globalTime

        if (time - this.lastWaveUpdateTime >= Dirigent.WAVE_UPDATE_INTERVAL) {
            this.lastWaveUpdateTime = time;
            this.conductWave(globalData.centerPos, globalData.cameraY, globalData.listenerForward, time);
        }
        if (time - this.lastDroneUpdateTime >= Dirigent.DRONE_UPDATE_INTERVAL) {
            this.lastDroneUpdateTime = time;
            this.conductDrone(droneData.notes, mixLevels.droneMultiplier, time);
        }

        if (mode === 'face') {
            if (exitingNode) {
                this.nodeSynth.triggerExit(time);
                this.nodeSynth.stop(time);
                this.arpeggiatorEngine.stopNodeMode(time);
            }
            this.arpeggiatorEngine.stopEdgeMode(time);
            this.conductFace(modeData.notes, modeData.positions, modeData.isLoop, modeData.isMajor || false, mixLevels, time);
        } else if (mode === 'edge') {
            if (exitingNode) {
                this.nodeSynth.triggerExit(time);
                this.nodeSynth.stop(time);
                this.arpeggiatorEngine.stopNodeMode(time);
            }
            this.arpeggiatorEngine.faceStop(time);
            this.conductArp(arpData.note1, arpData.note2, arpData.pos1, arpData.pos2, arpData.dist1, arpData.dist2, arpData.neighbors, mixLevels, time);
        } else if (mode === 'node') {
            this.arpeggiatorEngine.stopEdgeMode(time);
            this.arpeggiatorEngine.faceStop(time);
            this.conductNode(modeData.notes, modeData.positions, modeData.adjacentNodeNotes ?? [], time);
        }

        const leaveDelay = ORCHESTRA_CONFIG.leaveFaceDelaySec ?? 5;
        const fadeOutSec = ORCHESTRA_CONFIG.leaveFaceFadeOutSec ?? 18;
        if (mode !== 'face' && this.timeLeftFace != null && this.activeFaceVoices.size > 0) {
            if (time - this.timeLeftFace >= leaveDelay) {
                for (const [, voice] of this.activeFaceVoices) {
                    this.faceEnsemble.noteOff(voice, time, fadeOutSec);
                }
                this.activeFaceVoices.clear();
                this.timeLeftFace = null;
            }
        }

        this.lastMode = mode;
    }

    private conductFace(notes: string[], positions: THREE.Vector3[], isLoop: boolean, isMajor: boolean, mixLevels: MixLevels, time: number) {
        const conformed = notes.map((n) => this.harmony.conformOctave(n, 3));
        const targetNotes = conformed.slice(-3); // max 3, keep newest
        const startIdx = Math.max(0, conformed.length - 3);
        const nextNotes = new Set(targetNotes);

        for (const [note, voice] of this.activeFaceVoices) {
            if (!nextNotes.has(note)) {
                this.faceEnsemble.noteOff(voice, time);
                this.activeFaceVoices.delete(note);
            }
        }
        targetNotes.forEach((note, i) => {
            if (this.activeFaceVoices.has(note)) return; // same note: keep playing
            const pos = positions[startIdx + i] ?? positions[0] ?? new THREE.Vector3();
            const voice = this.faceEnsemble.noteOn({ note, position: pos, velocity: isLoop ? 0.4 : 0.8, time });
            if (voice) this.activeFaceVoices.set(note, voice);
        });

        const faceNotes = notes.map(n => this.harmony.conformOctave(n, 4));
        const faceKeyStable = `${sortNotesByPitch([...faceNotes]).join(',')}:${isMajor}`;

        // FaceSynth: notes 변경 시에만 trigger (정렬해 키 안정화 → 감지 지터로 매프레임 trigger 방지)
        if (faceKeyStable !== this.lastFaceSynthKey) {
            this.lastFaceSynthKey = faceKeyStable;
            this.faceSynth.trigger(notes, time);
        }

        if (this.lastFaceOrchestraScale !== mixLevels.faceOrchestraScale) {
            this.lastFaceOrchestraScale = mixLevels.faceOrchestraScale;
            this.faceEnsemble.updateVolume(mixLevels.faceOrchestraScale, time);
        }
        if (this.lastFaceArpScale !== mixLevels.faceArpScale) {
            this.lastFaceArpScale = mixLevels.faceArpScale;
            this.arpeggiatorEngine.faceSetVolume(mixLevels.faceArpScale, time);
        }

        // Face arp: 한 사이클 끝나면 규칙에 맞게 새 패턴 생성. MIDI 기준 ascend/descend.
        const cycleComplete = this.arpeggiatorEngine.faceCycleComplete;
        if (cycleComplete) {
            this.arpeggiatorEngine.faceCycleComplete = false;
            this.faceArpCycleIndex++;
        }
        const faceArpKeyChanged = faceKeyStable !== this.lastFaceArpKey;
        if (faceArpKeyChanged) {
            this.lastFaceArpKey = faceKeyStable;
            this.faceArpCycleIndex = 0;
        }
        if (faceArpKeyChanged || cycleComplete) {
            const events = this.pattern.genFaceArpPattern(faceNotes, isMajor, this.faceArpCycleIndex);
            this.arpeggiatorEngine.update(events);
        }
    }

    private conductDrone(notes: Array<{ name: string, position: THREE.Vector3, distance: number }>, droneMultiplier: number, time: number) {
        notes.forEach((note, i) => {
            if (i >= 4) return;
            const freq = this.harmony.getFreq(note.name, 4);
            const posMultiplier = i < 2 ? 1.0 : 0.35;
            const targetGain = this.env.calculateDistanceGain(note.distance, 25, 0.10) * posMultiplier * droneMultiplier;
            this.baseDrone.updateVoice(i, { frequency: freq, position: note.position, gain: targetGain, time });
        });
    }

    private conductArp(n1: string, n2: string, p1: THREE.Vector3, p2: THREE.Vector3, d1: number, d2: number, neighbors: any[], mixLevels: MixLevels, time: number) {
        const edgeKey = `${n1}-${n2}`;
        if (this.currentEdgeKey === edgeKey) return;
        this.currentEdgeKey = edgeKey;
        this.triggerArpVoice(0, n1, p1, true, d1, time);
        this.triggerArpVoice(1, n2, p2, true, d2, time);
        const ns = neighbors || [];
        for (let i = 0; i < 5; i++) {
            const neighbor = ns[i];
            const idx = i + 2;
            if (neighbor) this.triggerArpVoice(idx, neighbor.note.name, neighbor.pos, false, 15, time);
            else this.arpeggiatorEngine.stopVoice(idx);
        }
        this.arpeggiatorEngine.setVolume(mixLevels.edgeArpVolume, mixLevels.edgeArpRamp, time);
    }

    private triggerArpVoice(index: number, note: string, pos: THREE.Vector3, isEdge: boolean, distance: number, time: number) {
        const fullNote = this.harmony.conformOctave(note, isEdge ? 5 : 6);
        const events = this.pattern.genArpPattern(fullNote, isEdge, distance);
        this.arpeggiatorEngine.updateVoice(index, { note: fullNote, velocity: isEdge ? 0.7 : 0.4, position: pos, isEdge, events });
    }

    private conductNode(notes: string[], positions: THREE.Vector3[], adjacentNodeNotes: Array<{ note: { name: string }; pos: THREE.Vector3 }>, time: number) {
        // Arpeggiator: 인접음 6개 중 하나 (해당 node 음 X)
        const triggerProb = NODE_MODE_LOGIC_PRESET.triggerProbability;
        if (adjacentNodeNotes.length > 0 && Math.random() < triggerProb) {
            const idx = Math.floor(Math.random() * adjacentNodeNotes.length);
            const adj = adjacentNodeNotes[idx];
            const note = this.harmony.conformOctave(adj.note.name, 5 + (Math.random() > 0.5 ? 1 : 0));
            if (adj.pos) this.arpeggiatorEngine.trigger(note, 0.20, adj.pos, time);
        }
        // NodeSynth: 해당음 continuous
        if (notes[0]) this.nodeSynth.start(notes[0], time);
    }

    private conductWave(centerPos: THREE.Vector3, cameraY: number | undefined, listenerForward: THREE.Vector3 | undefined, time: number) {
        // Sync wave audio directly to the visual wave height experienced by the player.
        // defaultEyeLevel is linked via AudioMetrics dynamically.
        // waveY fluctuates roughly between -1.5 and +1.5 based on R3F visual amplitude settings.
        const baseEyeLevel = AudioMetrics.defaultEyeLevel;
        const currentY = cameraY ?? baseEyeLevel;
        const waveY = currentY - baseEyeLevel;

        const amp = Math.max(0.1, AudioMetrics.waveParams.amplitude);
        const freq = AudioMetrics.waveParams.frequency;
        const speed = AudioMetrics.waveParams.speed;

        // Background gentle swell based on total Y height
        const swell = Math.max(0, Math.min(1, (waveY / amp + 1.0) / 2.0));

        const config = WAVE_SAMPLER_CONFIG;
        const ws = AudioMetrics.waveState;

        let audioCurve = 0.0;
        if (ws.active) {
            // Visual wave is [0..1] over 6 seconds.
            // Map the audio crash exclusively to the middle 3 seconds (progress 0.25 -> 0.75)
            const p = (ws.progress - 0.25) / 0.5;
            if (p >= 0.0 && p <= 1.0) {
                audioCurve = Math.pow(Math.sin(p * Math.PI), 1.5);
            }
        }

        // The crashing waterfall is the primary volume driver, while the general visual swell acts as a bed
        const intensity = config.baseVolume
            + (swell * 0.1)
            + (audioCurve * (ws.isStrong ? 0.35 : 0.20));

        const filterFreq = 600
            + (swell * 300)
            + (audioCurve * (ws.isStrong ? 1500 : 800));

        // Pass the waveAngle directly. RotationSpatializer perfectly handles the HRTF
        const listenerYaw = listenerForward ? forwardToYaw(listenerForward) : 0;

        this.waveRevolver.update(intensity, filterFreq, listenerYaw, ws.angle, time);
    }

    public dispose() {
        this.faceEnsemble.dispose();
        this.baseDrone.dispose();
        this.arpeggiatorEngine.dispose();
        this.nodeSynth.dispose();
        this.faceSynth.dispose();
        this.waveRevolver.dispose();
        this.buses.dispose();
        this.activeFaceVoices.clear();
    }
}
