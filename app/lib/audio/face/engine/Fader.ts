import * as Tone from 'tone';

/**
 * Fader manages a gain node with standardized ramp logic
 */
export class Fader {
    public readonly gain: Tone.Gain;

    constructor(initialValue: number = 0) {
        this.gain = new Tone.Gain(initialValue);
    }

    public rampTo(value: number, rampTime: number, now: number = Tone.now()) {
        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(this.gain.gain.value, now);
        this.gain.gain.rampTo(value, rampTime, now);
    }

    public setValue(value: number) {
        this.gain.gain.value = value;
    }

    public connect(destination: Tone.ToneAudioNode) {
        this.gain.connect(destination);
        return this;
    }

    public dispose() {
        this.gain.dispose();
    }
}
