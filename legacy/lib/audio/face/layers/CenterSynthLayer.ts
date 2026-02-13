import * as Tone from 'tone';
import { ensureOctave } from '../../../../../app/lib/audio/utils/NoteUtils';
import { Fader } from '../../../../../app/lib/audio/engine/Fader';

export class CenterSynthLayer {
    private synth: Tone.PolySynth;
    private filter: Tone.Filter;
    private outputFader: Fader;

    constructor(destination: Tone.ToneAudioNode) {
        this.outputFader = new Fader(0.3);
        this.filter = new Tone.Filter({ type: 'lowpass', frequency: 1500, rolloff: -12 });
        this.synth = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: 'fatsawtooth', count: 3, spread: 30 } as any,
            envelope: { attack: 1.5, decay: 1.0, sustain: 0.7, release: 1.5 },
            volume: -20
        });
        this.synth.maxPolyphony = 8;

        this.synth.connect(this.filter);
        this.filter.connect(this.outputFader.gain);
        this.outputFader.connect(destination);
    }

    public trigger(notes: string[], time: number) {
        const validNotes = notes.filter(n => n && typeof n === 'string');
        if (validNotes.length === 0) return;
        this.synth.releaseAll(time);
        const centerNotes = validNotes.map(n => ensureOctave(n, 4));
        centerNotes.forEach(note => {
            this.synth.triggerAttack(note, time, 0.5);
        });
    }

    public setVolume(scale: number, rampTime: number, time: number) {
        this.outputFader.rampTo(0.3 * scale, rampTime, time);
    }

    public stop() {
        this.synth.releaseAll();
    }

    public dispose() {
        this.synth.dispose();
        this.filter.dispose();
        this.outputFader.dispose();
    }
}
