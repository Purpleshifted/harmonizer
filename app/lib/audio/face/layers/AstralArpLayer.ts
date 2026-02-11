import * as Tone from 'tone';
import { ensureOctave, transposeOctave, sortNotesByPitch } from '../../core/NoteUtils';
import { createDelay } from '../../core/ReverbFactory';
import { Fader } from '../engine/Fader';

export class AstralArpLayer {
    private synth: Tone.PolySynth;
    private filter: Tone.Filter;
    private delay: Tone.FeedbackDelay;
    private outputFader: Fader;
    private sequence: Tone.Sequence | null = null;
    private isAudible = false;

    constructor(dryDest: Tone.ToneAudioNode, sendDest: Tone.ToneAudioNode) {
        this.outputFader = new Fader(1.0);
        this.delay = createDelay("4n.", 0.4, 0.5);
        this.filter = new Tone.Filter({ type: 'highpass', frequency: 600 });
        this.synth = new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, volume: 2 });

        this.synth.connect(this.filter);
        this.filter.connect(this.delay);
        this.delay.connect(this.outputFader.gain);

        // Astral splits manually to dry/send gain nodes passed in
        this.outputFader.connect(dryDest);
        this.outputFader.connect(sendDest);
    }

    public updateSequence(notes: string[], isMajor: boolean) {
        if (this.sequence) {
            this.sequence.stop();
            this.sequence.dispose();
            this.sequence = null;
        }

        const validNotes = notes.filter(n => n && typeof n === 'string');
        if (validNotes.length === 0) return;

        const expandedNotes: string[] = [];
        validNotes.forEach(note => {
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
            } else patternEvents.push(null);
        }

        this.sequence = new Tone.Sequence((time, note) => {
            if (note && this.isAudible) {
                try {
                    this.synth.triggerAttackRelease(note, "4n", time, 0.3);
                } catch { }
            }
        }, patternEvents, "4n");
        this.sequence.start(0);
    }

    public setVolume(scale: number, rampTime: number) {
        this.outputFader.rampTo(1.0 * scale, rampTime);
        this.isAudible = scale > 0.001;
    }

    public stop() {
        if (this.sequence) this.sequence.stop();
        this.synth.releaseAll();
    }

    public dispose() {
        if (this.sequence) this.sequence.dispose();
        this.synth.dispose();
        this.filter.dispose();
        this.delay.dispose();
        this.outputFader.dispose();
    }
}
