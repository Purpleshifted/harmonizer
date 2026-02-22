/**
 * Arp Engine (ArpLogicSketch): Mode Switch + Note Catcher + Mode Logic Presets → Pattern Generator → 기존 사운드로 재생.
 * 패턴 생성만 통합하고, edge/node/face 사운드는 기존 플레이어 그대로 사용.
 * 껐다/켰다 하지 않고 조건(mode)에 따라 다른 패턴만 넣어줌.
 */

import type { DetectionResult } from '../../hooks/useSpatialDetection';
import * as Tone from 'tone';
import { type EdgeArpPlayer, EdgeArp } from './EdgeArp';
import { type NodeArpPlayer, NodeArp } from './NodeArp';
import { FaceArp } from './FaceArp';

export type ArpMode = 'node' | 'edge' | 'face';

export interface ArpEnginePlayers {
    edge: EdgeArpPlayer;
    node: NodeArpPlayer;
}

export class ArpEngine {
    private readonly edgeArp: EdgeArp;
    private readonly nodeArp: NodeArp;
    private readonly faceArp: FaceArp;
    private activeMode: ArpMode | null = null;
    private activeKey = '';
    private pendingMode: ArpMode | null = null;
    private pendingDetection: DetectionResult | null = null;
    private pendingKey = '';
    private scheduledTransitionId: number | null = null;
    private readonly transitionQuantize: string = '@8n';

    constructor(players: ArpEnginePlayers) {
        this.edgeArp = new EdgeArp(players.edge);
        this.nodeArp = new NodeArp(players.node);
        this.faceArp = new FaceArp();
    }

    /**
     * Note Catcher 결과(stable detection) + mode에 따라 패턴 생성 후 해당 플레이어에만 패턴 주입.
     * 볼륨은 AudioController에서 모드별로 그대로 제어.
     */
    update(mode: ArpMode, detection: DetectionResult): void {
        const nextKey = this.getModeKey(mode, detection);

        // Keep edge spatial movement smooth while staying in same synced pattern.
        if (mode === 'edge' && this.activeMode === 'edge' && nextKey === this.activeKey) {
            this.edgeArp.update(detection);
            return;
        }

        // No mode/pattern change to apply.
        if (mode === this.activeMode && nextKey === this.activeKey) {
            return;
        }

        this.queueTransition(mode, detection, nextKey);
    }

    private queueTransition(mode: ArpMode, detection: DetectionResult, key: string): void {
        this.pendingMode = mode;
        this.pendingDetection = detection;
        this.pendingKey = key;

        // First entry: apply immediately so node/face arp sound from the first frame (edge is already driven by ArpeggiatorPlayer).
        if (this.activeMode === null) {
            const time = Tone.now();
            this.applyPendingTransition(time);
            return;
        }

        const transport = Tone.getTransport();
        if (transport.state !== 'started') {
            transport.start();
        }
        if (this.scheduledTransitionId !== null) {
            transport.clear(this.scheduledTransitionId);
            this.scheduledTransitionId = null;
        }

        this.scheduledTransitionId = transport.scheduleOnce((time) => {
            this.scheduledTransitionId = null;
            this.applyPendingTransition(time);
        }, this.transitionQuantize);
    }

    private applyPendingTransition(scheduledTime: number): void {
        if (!this.pendingMode || !this.pendingDetection) return;

        const mode = this.pendingMode;
        const detection = this.pendingDetection;
        const key = this.pendingKey;

        if (mode !== 'node') {
            this.nodeArp.reset();
        }

        switch (mode) {
            case 'edge':
                this.edgeArp.update(detection);
                break;
            case 'node':
                this.nodeArp.update(detection, scheduledTime);
                break;
            case 'face':
                this.faceArp.update(detection, scheduledTime);
                break;
        }

        this.activeMode = mode;
        this.activeKey = key;
        this.pendingMode = null;
        this.pendingDetection = null;
        this.pendingKey = '';
    }

    /** Mute/unmute independent node and face arp layers (used when pointer lock is released). */
    setMuted(muted: boolean, rampTime = 0.15): void {
        this.nodeArp.setOutputGain(muted ? 0 : 1, rampTime);
        this.faceArp.setOutputGain(muted ? 0 : 1, rampTime);
    }

    private getModeKey(mode: ArpMode, detection: DetectionResult): string {
        if (mode === 'edge') {
            if (!detection.activeEdge) return 'edge:none';
            return `edge:${detection.activeEdge.note1.name}-${detection.activeEdge.note2.name}`;
        }
        if (mode === 'node') {
            if (detection.activeNodes.length === 0) return 'node:none';
            const n = detection.activeNodes[0].note.name;
            const hex = detection.nearestNeighbors?.slice(0, 6).map((x) => x.note.name).join('-') ?? '';
            return `node:${n}:${hex}`;
        }
        if (!detection.activeTriangle) return 'face:none';
        const notes = detection.activeTriangle.notes.slice().sort().join('-');
        return `face:${notes}:${detection.activeTriangle.isMajor ? 'M' : 'm'}`;
    }

    dispose(): void {
        this.nodeArp.dispose();
        this.faceArp.dispose();
    }
}
