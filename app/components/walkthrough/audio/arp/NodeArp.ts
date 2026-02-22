import type { DetectionResult } from '../../hooks/useSpatialDetection';
import * as Tone from 'tone';
import { createReverb } from '../core/ReverbFactory';
import { ensureOctave } from '../core/NoteUtils';
import { genNodeHexArpNotes, genNodePattern } from './ArpPatternGenerator';

export interface NodeArpPlayer {
    start(note: string): void;
}

export class NodeArp {
    private readonly player: NodeArpPlayer;
    private lastKey = '';
    private readonly reverb: Tone.Reverb;
    private readonly outputGain: Tone.Gain;
    private readonly hexArpSynth: Tone.Synth;
    private hexArpSequence: Tone.Sequence | null = null;

    constructor(player: NodeArpPlayer) {
        this.player = player;
        this.reverb = createReverb('deep');
        this.outputGain = new Tone.Gain(1).toDestination();
        this.hexArpSynth = new Tone.Synth({
            oscillator: { type: 'sine' },
            envelope: { attack: 0.02, decay: 0.3, sustain: 0.2, release: 0.5 },
            volume: -8,
        });
        this.hexArpSynth.connect(this.reverb);
        this.reverb.connect(this.outputGain);
    }

    update(detection: DetectionResult, scheduledTime?: number): void {
        if (detection.mode !== 'node' || detection.activeNodes.length === 0) {
            this.reset();
            return;
        }

        const note = detection.activeNodes[0].note.name;
        const hexNames = detection.nearestNeighbors?.map((n) => n.note.name) ?? [];
        const key = `${note}-${hexNames.slice(0, 6).join('-')}`;
        if (key === this.lastKey) return;

        this.lastKey = key;
        const { note: nodeNote } = genNodePattern(note);
        this.player.start(nodeNote);

        const hexArpNotes = genNodeHexArpNotes(hexNames);
        const time = scheduledTime ?? Tone.now();
        if (hexArpNotes.length > 0) {
            this.startHexArp(hexArpNotes, time);
        } else {
            this.stopHexArp();
        }
    }

    setOutputGain(volume: number, rampTime = 0.15): void {
        this.outputGain.gain.rampTo(volume, rampTime);
    }

    reset(): void {
        this.lastKey = '';
        this.stopHexArp();
    }

    dispose(): void {
        this.stopHexArp();
        this.hexArpSynth.dispose();
        this.reverb.dispose();
        this.outputGain.dispose();
    }

    private startHexArp(notes: string[], startTime: number): void {
        if (notes.length === 0) return;
        this.stopHexArp();
        const events = notes.slice(0, 6).map((n) => ensureOctave(n, 5));
        this.hexArpSequence = new Tone.Sequence(
            (time, note) => {
                if (note) {
                    this.hexArpSynth.triggerAttackRelease(note, '2n', time, 0.5);
                }
            },
            events,
            '2n'
        );
        this.hexArpSequence.start(startTime);
    }

    private stopHexArp(): void {
        if (this.hexArpSequence) {
            this.hexArpSequence.stop(0);
            this.hexArpSequence.dispose();
            this.hexArpSequence = null;
        }
    }
}
