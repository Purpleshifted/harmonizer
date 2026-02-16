/**
 * ArpeggiatorEngine - Unified arpeggiator performer (Node Switch + Pattern Generator + Arp Engine)
 * Replaces NodeArpeggiator, EdgeArpeggiator, FaceArpeggiator with a single engine.
 * Edge mode: TWO ArpEngineWorklets (one per edge endpoint).
 */
import * as Tone from 'tone';
import * as THREE from 'three';
import { createSpatialPanner, updatePannerPosition } from '../utils/SpatialAudio';
import { createDelay } from '../engine/ReverbFactory';
import { noteToFreq } from '../utils/NoteUtils';
import { ArpEngineWorklet } from '../worklets/ArpEngineWorklet';
import {
    EDGE_MODE_LOGIC_PRESET,
    FACE_MODE_LOGIC_PRESET,
    NODE_MODE_LOGIC_PRESET,
} from '../presets/ArpModeLogicPresets';

export type ArpEngineMode = 'node' | 'edge' | 'face';

type PatternEvent = { note: string; velocity: number } | null;

interface EdgeVoiceCmd {
    note: string;
    velocity: number;
    position: THREE.Vector3;
    isEdge: boolean;
    events: PatternEvent[];
}

/**
 * Edge mode: two arpeggiators. Arp 1 = note1 (voice 0), Arp 2 = note2 + 5 neighbors (voices 1-6).
 */
export class ArpeggiatorEngine {
    private ports: { main: Tone.ToneAudioNode; spatial?: Tone.ToneAudioNode; deep?: Tone.ToneAudioNode };
    private mode: ArpEngineMode = 'node';

    // Node mode: 1 worklet + gain + panner
    private nodeArp: ArpEngineWorklet | null = null;
    private nodeArpGain: Tone.Gain | null = null;
    private nodePanner: Tone.Panner3D | null = null;

    // Edge mode: 2 worklets + 2 panners (one per edge note)
    private edgeArp1: ArpEngineWorklet | null = null;
    private edgeArp2: ArpEngineWorklet | null = null;
    private edgePanner1: Tone.Panner3D | null = null;
    private edgePanner2: Tone.Panner3D | null = null;
    private edgeSeq1: Tone.Sequence | null = null;
    private edgeSeq2: Tone.Sequence[] = []; // 6 sequences for Arp 2 (note2 + 5 neighbors)
    private edgeGain1: Tone.Gain | null = null;
    private edgeGain2: Tone.Gain | null = null;

    // Face mode: 1 worklet
    private faceArp: ArpEngineWorklet | null = null;
    private faceSeq: Tone.Sequence | null = null;
    private faceSeqCallbackCount = 0;
    public faceCycleComplete = false;

    // Edge effect chain
    private edgeFilter: Tone.Filter | null = null;
    private edgeDelay: Tone.FeedbackDelay | null = null;
    private edgeLimiter: Tone.Limiter | null = null;
    private masterGain: Tone.Gain | null = null;

    // Face effect chain
    private faceFilter: Tone.Filter | null = null;
    private faceDelay: Tone.FeedbackDelay | null = null;
    private faceGain: Tone.Gain | null = null;

    private isDisposed = false;

    constructor(ports: { main: Tone.ToneAudioNode; spatial?: Tone.ToneAudioNode; deep?: Tone.ToneAudioNode }) {
        this.ports = ports;
        this.setupNodeMode();
        this.setupEdgeMode();
        this.setupFaceMode();
    }

    private setupNodeMode() {
        this.nodeArp = new ArpEngineWorklet({ mode: 'node' });
        this.nodeArpGain = new Tone.Gain(0.5);
        this.nodePanner = createSpatialPanner({ useHRTF: true, refDistance: 4, maxDistance: 40 });
        this.nodeArp.output.connect(this.nodeArpGain);
        this.nodeArpGain.connect(this.nodePanner);
        this.nodePanner.connect(this.ports.main as unknown as Tone.ToneAudioNode);
        if (this.ports.spatial) {
            this.nodePanner.connect(this.ports.spatial as unknown as Tone.ToneAudioNode);
        }
    }

    private setupEdgeMode() {
        this.masterGain = new Tone.Gain(0);
        this.edgeFilter = new Tone.Filter({ type: 'highpass', frequency: 600 });
        this.edgeDelay = createDelay('8n.', 0.25, 0.3);
        this.edgeLimiter = new Tone.Limiter(-6);

        this.masterGain!.connect(this.edgeFilter!);
        this.edgeFilter!.connect(this.edgeDelay!);
        this.edgeDelay!.connect(this.edgeLimiter!);
        this.edgeLimiter!.connect(this.ports.main as unknown as Tone.ToneAudioNode);
        if (this.ports.spatial) {
            this.edgeLimiter!.connect(this.ports.spatial as unknown as Tone.ToneAudioNode);
        }

        this.edgeArp1 = new ArpEngineWorklet({ mode: 'edge' });
        this.edgeArp2 = new ArpEngineWorklet({ mode: 'edge' });
        this.edgePanner1 = createSpatialPanner({ refDistance: 2, maxDistance: 30, rolloffFactor: 1 });
        this.edgePanner2 = createSpatialPanner({ refDistance: 2, maxDistance: 30, rolloffFactor: 1 });
        this.edgeGain1 = new Tone.Gain(0.6);
        this.edgeGain2 = new Tone.Gain(0.6);

        this.edgeArp1.output.connect(this.edgePanner1);
        this.edgePanner1.connect(this.edgeGain1!);
        this.edgeGain1!.connect(this.masterGain!);

        this.edgeArp2.output.connect(this.edgePanner2);
        this.edgePanner2.connect(this.edgeGain2!);
        this.edgeGain2!.connect(this.masterGain!);

        const edgePreset = EDGE_MODE_LOGIC_PRESET;
        this.edgeSeq1 = new Tone.Sequence(
            (time, val: PatternEvent) => {
                if (val?.note && this.edgeArp1) {
                    const freq = noteToFreq(val.note);
                    this.edgeArp1.trigger(freq, val.velocity, time, edgePreset.durationEdge, 0);
                }
            },
            [] as PatternEvent[],
            edgePreset.subdivisionEdge
        );

        for (let i = 0; i < 6; i++) {
            const subdivision = i === 0 ? edgePreset.subdivisionEdge : edgePreset.subdivisionNeighbor;
            const dur = i === 0 ? edgePreset.durationEdge : edgePreset.durationNeighbor;
            const seq = new Tone.Sequence(
                (time, val: PatternEvent) => {
                    if (val?.note && this.edgeArp2) {
                        const freq = noteToFreq(val.note);
                        this.edgeArp2.trigger(freq, val.velocity, time, dur, i);
                    }
                },
                [] as PatternEvent[],
                subdivision
            );
            this.edgeSeq2.push(seq);
        }
    }

    private setupFaceMode() {
        const facePreset = FACE_MODE_LOGIC_PRESET;
        this.faceArp = new ArpEngineWorklet({ mode: 'face' });
        this.faceGain = new Tone.Gain(1);
        this.faceFilter = new Tone.Filter({ type: 'lowpass', frequency: 1200 });
        this.faceDelay = createDelay('4n.', 0.2, 0.3);

        this.faceArp.output.connect(this.faceFilter!);
        this.faceFilter!.connect(this.faceDelay!);
        this.faceDelay!.connect(this.faceGain!);
        this.faceGain!.connect(this.ports.main as unknown as Tone.ToneAudioNode);
        if (this.ports.deep) {
            this.faceGain!.connect(this.ports.deep as unknown as Tone.ToneAudioNode);
        }

        this.faceSeqCallbackCount = 0;
        this.faceSeq = new Tone.Sequence(
            (time, val: string | null) => {
                if (val && typeof val === 'string' && this.faceArp) {
                    const freq = noteToFreq(val);
                    const vel = facePreset.velocityBase ?? 0.22;
                    this.faceArp!.trigger(freq, vel, time, facePreset.duration, undefined);
                }
                this.faceSeqCallbackCount++;
                const events = this.faceSeq?.events ?? [];
                if (events.length > 0 && this.faceSeqCallbackCount >= events.length) {
                    this.faceSeqCallbackCount = 0;
                    this.faceCycleComplete = true;
                }
            },
            [] as (string | null)[],
            facePreset.subdivision
        );
    }

    /** Node mode: random trigger (called from Dirigent.conductNode) */
    trigger(note: string, velocity: number, position: THREE.Vector3, time: number): void {
        if (this.isDisposed || !this.nodeArp || !this.nodePanner) return;
        updatePannerPosition(this.nodePanner, position, 0.1);
        const freq = noteToFreq(note);
        const duration = NODE_MODE_LOGIC_PRESET.noteDuration;
        this.nodeArp.trigger(freq, velocity, time, duration);
    }

    /** Node mode: stop (call when leaving node mode) */
    stopNodeMode(time?: number): void {
        this.nodeArp?.releaseAll();
    }

    /** Edge mode: update voice. Index 0 → Arp 1, indices 1–6 → Arp 2. */
    updateVoice(index: number, cmd: EdgeVoiceCmd): void {
        if (this.isDisposed) return;

        const startTime = Tone.getTransport().seconds;
        if (index === 0) {
            if (this.edgePanner1) updatePannerPosition(this.edgePanner1, cmd.position, 0.15);
            if (this.edgeSeq1) this.edgeSeq1.events = cmd.events;
            if (this.edgeGain1) this.edgeGain1.gain.rampTo(cmd.isEdge ? 0.6 : 0.15, 0.5);
            if (this.edgeSeq1?.state !== 'started') this.edgeSeq1?.start(startTime);
        } else if (index >= 1 && index <= 6) {
            const idx = index - 1;
            if (index === 1 && this.edgePanner2) updatePannerPosition(this.edgePanner2, cmd.position, 0.15);
            if (this.edgeSeq2[idx]) this.edgeSeq2[idx].events = cmd.events;
            if (this.edgeGain2) this.edgeGain2.gain.rampTo(cmd.isEdge ? 0.6 : 0.15, 0.5);
            if (this.edgeSeq2[idx]?.state !== 'started') this.edgeSeq2[idx]?.start(startTime);
        }
    }

    stopVoice(index: number): void {
        if (index === 0) {
            this.edgeSeq1?.clear();
            this.edgeGain1?.gain.rampTo(0, 0.5);
            this.edgeArp1?.releaseVoice(0);
        } else if (index >= 1 && index <= 6) {
            const idx = index - 1;
            this.edgeSeq2[idx]?.clear();
            this.edgeArp2?.releaseVoice(idx);
        }
    }

    setVolume(volume: number, rampTime: number, time?: number): void {
        if (this.isDisposed || !this.masterGain) return;
        this.masterGain.gain.rampTo(volume, rampTime, time ?? Tone.now());
        if (volume > 0.01 && Tone.getTransport().state !== 'started') {
            Tone.getTransport().start();
        }
    }

    /** Face mode: update sequence events */
    update(events: (string | null)[]): void {
        if (this.isDisposed || !this.faceSeq) return;
        this.faceSeq.events = events;
        if (this.faceSeq.state !== 'started') {
            const startTime = Tone.getTransport().seconds;
            this.faceSeq.start(startTime);
        }
    }

    faceSetVolume(scale: number, time?: number): void {
        if (this.isDisposed || !this.faceGain) return;
        this.faceGain.gain.rampTo(1 * scale, 0.1, time ?? Tone.now());
    }

    faceStop(time?: number): void {
        this.faceArp?.releaseAll();
        this.faceSeq?.stop();
    }

    /** Stop edge mode when switching to face/node - clear sequences, release voices, ramp down */
    stopEdgeMode(time?: number): void {
        const t = time ?? Tone.now();
        this.edgeSeq1?.stop();
        this.edgeSeq1?.clear();
        this.edgeSeq2?.forEach((s) => {
            s.stop();
            s.clear();
        });
        this.edgeArp1?.releaseAll();
        this.edgeArp2?.releaseAll();
        this.edgeGain1?.gain.rampTo(0, 0.3, t);
        this.edgeGain2?.gain.rampTo(0, 0.3, t);
        this.masterGain?.gain.rampTo(0, 0.3, t);
    }

    dispose(): void {
        if (this.isDisposed) return;
        this.isDisposed = true;

        this.nodeArp?.dispose();
        this.nodeArpGain?.dispose();
        this.nodePanner?.dispose();

        this.edgeSeq1?.dispose();
        this.edgeSeq2.forEach((s) => s.dispose());
        this.edgeArp1?.dispose();
        this.edgeArp2?.dispose();
        this.edgePanner1?.dispose();
        this.edgePanner2?.dispose();
        this.edgeGain1?.dispose();
        this.edgeGain2?.dispose();

        this.faceSeq?.dispose();
        this.faceArp?.dispose();
        this.faceGain?.dispose();
        this.faceFilter?.dispose();
        this.faceDelay?.dispose();

        this.edgeFilter?.dispose();
        this.edgeDelay?.dispose();
        this.edgeLimiter?.dispose();
        this.masterGain?.dispose();
    }
}
