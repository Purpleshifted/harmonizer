import type { DetectionResult } from '../../hooks/useSpatialDetection';
import * as Tone from 'tone';
import { ensureOctave, transposeOctave, sortNotesByPitch } from '../core/NoteUtils';
import { createReverb, createDelay } from '../core/ReverbFactory';

export class FaceArp {
    private astralSynth: Tone.PolySynth;
    private astralFilter: Tone.Filter;
    private astralReverb: Tone.Reverb;
    private astralDelay: Tone.FeedbackDelay;
    private astralGain: Tone.Gain;
    private astralSequence: Tone.Sequence | null = null;
    private lastKey = '';

    constructor() {
        // 기존 ChordPlayer astral 레이어 파라미터를 그대로 독립화
        this.astralGain = new Tone.Gain(1.0).toDestination();
        this.astralReverb = createReverb('deep');
        this.astralDelay = createDelay('4n.', 0.4, 0.5);
        this.astralFilter = new Tone.Filter({ type: 'highpass', frequency: 600 });
        this.astralSynth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, volume: 2 });

        this.astralSynth.connect(this.astralFilter);
        this.astralFilter.connect(this.astralDelay);
        this.astralDelay.connect(this.astralReverb);
        this.astralReverb.connect(this.astralGain);
    }

    update(detection: DetectionResult, scheduledTime?: number): void {
        if (!detection.activeTriangle) return;
        const { notes, isMajor } = detection.activeTriangle;
        const key = `${notes.slice().sort().join('-')}${isMajor ? 'M' : 'm'}`;
        if (key === this.lastKey) return;

        this.lastKey = key;
        const time = scheduledTime ?? Tone.now();
        this.updateAstralSequence(notes, isMajor, time);
    }

    setOutputGain(volume: number, rampTime = 0.15): void {
        this.astralGain.gain.rampTo(volume, rampTime);
    }

    reset(): void {
        this.lastKey = '';
        if (this.astralSequence) {
            this.astralSequence.stop();
            this.astralSequence.dispose();
            this.astralSequence = null;
        }
    }

    dispose(): void {
        this.reset();
        this.astralSynth.dispose();
        this.astralFilter.dispose();
        this.astralDelay.dispose();
        this.astralReverb.dispose();
        this.astralGain.dispose();
    }

    private updateAstralSequence(notes: string[], isMajor: boolean, startTime: number): void {
        if (this.astralSequence) {
            this.astralSequence.stop();
            this.astralSequence.dispose();
            this.astralSequence = null;
        }

        const validNotes = notes.filter((n): n is string => !!n && typeof n === 'string');
        if (validNotes.length === 0) return;

        const expandedNotes: string[] = [];
        validNotes.forEach((note) => {
            const n = ensureOctave(note, 4);
            expandedNotes.push(transposeOctave(n, -1));
            expandedNotes.push(n);
            expandedNotes.push(transposeOctave(n, 1));
        });
        const sortedNotes = sortNotesByPitch(expandedNotes);
        if (isMajor) sortedNotes.reverse();

        const patternEvents: (string | null)[] = [];
        const length = 16;
        for (let i = 0; i < length; i++) {
            if (Math.random() < 0.35) {
                const idx = Math.floor((i / length) * sortedNotes.length);
                patternEvents.push(sortedNotes[Math.min(idx, sortedNotes.length - 1)]);
            } else {
                patternEvents.push(null);
            }
        }

        this.astralSequence = new Tone.Sequence((time, note) => {
            if (note) {
                try {
                    this.astralSynth.triggerAttackRelease(note, '4n', time, 0.3);
                } catch {}
            }
        }, patternEvents, '4n');
        this.astralSequence.start(startTime);
    }
}
