/**
 * Dirigent - The Musical Conductor (Worklet Bridge)
 */
import * as Tone from 'tone';
import * as THREE from 'three';

// Import Performers
import { FaceEnsemble } from '../performer/FaceEnsemble';
import { BaseDrone } from '../performer/BaseDrone';
import { EdgeArpeggiator } from '../performer/EdgeArpeggiator';
import { NodeArpeggiator } from '../performer/NodeArpeggiator';
import { NodeSynth } from '../performer/NodeSynth';
import { FaceArpeggiator } from '../performer/FaceArpeggiator';
import { FaceSynth } from '../performer/FaceSynth';
import { WaveRevolver } from '../performer/WaveRevolver';

// Import specialized logic
import { HarmonyLogic } from '../composer/HarmonyLogic';
import { EnvironmentLogic } from '../composer/EnvironmentLogic';
import { PatternScore } from '../composer/PatternScore';
import { ModeLogic } from '../composer/ModeLogic';

// Import Effectors & Sources
import { BusSystem } from '../engine/Buses';
import { WAVE_SAMPLER_CONFIG } from '../sources/Sampler';

export class Dirigent {
    private buses: BusSystem;
    private faceEnsemble: any;
    private baseDrone: any;
    private edgeArpeggiator: any;
    private nodeArpeggiator: any;
    private nodeSynth: any;
    private faceArpeggiator: any;
    private faceSynth: any;
    private waveRevolver: any;

    private harmony: HarmonyLogic;
    private env: EnvironmentLogic;
    private pattern: PatternScore;
    private modeLogic: ModeLogic;

    private activeFaceVoices: Map<string, any>;
    private currentEdgeKey: string;
    private waveCycle: number = 0;

    constructor() {
        // 1. Initialize Global Effect Buses (Reverbs/Limiter)
        this.buses = new BusSystem();
        const ports = {
            main: this.buses.masterBus,
            ambient: this.buses.ambientBus,
            spatial: this.buses.spatialBus,
            deep: this.buses.deepBus,
            wave: this.buses.waveBus
        };

        // 2. Performers (Now receiving an object of destination ports for complex routing)
        this.faceEnsemble = new FaceEnsemble(ports as any);
        this.baseDrone = new BaseDrone(ports as any);
        this.edgeArpeggiator = new EdgeArpeggiator(ports as any);
        this.nodeArpeggiator = new NodeArpeggiator(ports as any);
        this.nodeSynth = new NodeSynth(ports as any);
        this.faceArpeggiator = new FaceArpeggiator(ports as any);
        this.faceSynth = new FaceSynth(ports as any);
        this.waveRevolver = new WaveRevolver(ports as any);

        // 3. Specialized Logic
        this.harmony = new HarmonyLogic();
        this.env = new EnvironmentLogic();
        this.pattern = new PatternScore();
        this.modeLogic = new ModeLogic();

        // State
        this.activeFaceVoices = new Map<string, any>();
        this.currentEdgeKey = '';
    }

    public update(
        modeData: { targetMode: string, notes: string[], positions: THREE.Vector3[], isLoop: boolean, isMajor?: boolean },
        droneData: { notes: Array<{ name: string, position: THREE.Vector3, distance: number }> },
        arpData: { note1: string, note2: string, pos1: THREE.Vector3, pos2: THREE.Vector3, dist1: number, dist2: number, neighbors: any[] },
        globalData: { centerPos: THREE.Vector3, delta: number },
        time: number
    ) {
        const { mode } = this.modeLogic.filterMode(modeData.targetMode);

        if (Math.random() < 0.01) {
            console.log('[Dirigent] Conducting. Mode:', mode, 'DroneVoices:', droneData.notes.length);
        }

        this.waveCycle += globalData.delta;
        this.conductWave(globalData.centerPos, time);
        this.conductDrone(droneData.notes, time);

        if (mode === 'face') {
            this.conductFace(modeData.notes, modeData.positions, modeData.isLoop, modeData.isMajor || false, time);
        } else if (mode === 'edge') {
            this.conductArp(arpData.note1, arpData.note2, arpData.pos1, arpData.pos2, arpData.dist1, arpData.dist2, arpData.neighbors, time);
        } else if (mode === 'node') {
            this.conductNode(modeData.notes, modeData.positions, time);
        }
    }

    private conductFace(notes: string[], positions: THREE.Vector3[], isLoop: boolean, isMajor: boolean, time: number) {
        const nextNotes = new Set(notes.map(n => this.harmony.conformOctave(n, 3)));
        for (const [note, voice] of this.activeFaceVoices) {
            if (!nextNotes.has(note)) {
                this.faceEnsemble.noteOff(voice, time);
                this.activeFaceVoices.delete(note);
            }
        }
        notes.forEach((rawNote, i) => {
            const note = this.harmony.conformOctave(rawNote, 3);
            const pos = positions[i] || positions[0] || new THREE.Vector3();
            if (!this.activeFaceVoices.has(note)) {
                const voice = this.faceEnsemble.noteOn({ note, position: pos, velocity: isLoop ? 0.4 : 0.8, time });
                if (voice) this.activeFaceVoices.set(note, voice);
            } else {
                const voice = this.activeFaceVoices.get(note);
                if (voice && voice.updatePosition) voice.updatePosition(pos, 0.5);
            }
        });

        this.faceSynth.trigger(notes, time);

        const sorted = this.harmony.prepareExpandedVoicing(notes);
        const events = this.pattern.genAstralPattern(sorted, isMajor);
        this.faceArpeggiator.update(events);
    }

    private conductDrone(notes: Array<{ name: string, position: THREE.Vector3, distance: number }>, time: number) {
        notes.forEach((note, i) => {
            if (i >= 4) return;
            const freq = this.harmony.getFreq(note.name, 4);
            const posMultiplier = i < 2 ? 1.0 : 0.35;
            const targetGain = this.env.calculateDistanceGain(note.distance, 25, 0.10) * posMultiplier;
            this.baseDrone.updateVoice(i, { frequency: freq, position: note.position, gain: targetGain, time });
        });
    }

    private conductArp(n1: string, n2: string, p1: THREE.Vector3, p2: THREE.Vector3, d1: number, d2: number, neighbors: any[], time: number) {
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
            else this.edgeArpeggiator.stopVoice(idx);
        }
        this.edgeArpeggiator.setVolume(0.5, 1.5, time);
    }

    private triggerArpVoice(index: number, note: string, pos: THREE.Vector3, isEdge: boolean, distance: number, time: number) {
        const fullNote = this.harmony.conformOctave(note, isEdge ? 5 : 6);
        const events = this.pattern.genArpPattern(fullNote, isEdge, distance);
        this.edgeArpeggiator.updateVoice(index, { note: fullNote, velocity: isEdge ? 0.7 : 0.4, position: pos, isEdge, events });
    }

    private conductNode(notes: string[], positions: THREE.Vector3[], time: number) {
        if (Math.random() > 0.95) {
            const idx = Math.floor(Math.random() * notes.length);
            const note = this.harmony.conformOctave(notes[idx], 5 + (Math.random() > 0.5 ? 1 : 0));
            const pos = positions[idx];
            if (pos) this.nodeArpeggiator.trigger(note, 0.4, pos, time);
        }
        if (notes[0]) this.nodeSynth.start(notes[0], time);
    }

    private conductWave(centerPos: THREE.Vector3, time: number) {
        const params = this.env.calculateWaveParams(this.waveCycle, centerPos, WAVE_SAMPLER_CONFIG);
        this.waveRevolver.update(params.intensity, params.filterFreq, params.targetPos, time);
    }

    public dispose() {
        this.faceEnsemble.dispose();
        this.baseDrone.dispose();
        this.edgeArpeggiator.dispose();
        this.nodeArpeggiator.dispose();
        this.nodeSynth.dispose();
        this.faceArpeggiator.dispose();
        this.faceSynth.dispose();
        this.waveRevolver.dispose();
        this.buses.dispose();
        this.activeFaceVoices.clear();
    }
}
