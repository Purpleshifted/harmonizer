import * as Tone from 'tone';

/**
 * HarmonicSaturator - Soft-clipping harmonic saturation using Tone.js native nodes.
 * Replaced AudioWorklet with Tone.WaveShaper for reliable cross-browser support.
 *
 * Algorithm: f(x) = (3x - x³) / 2  (cubic soft clipper, adds odd harmonics)
 * Drive multiplies input before saturation; mix blends dry/wet.
 */
export class HarmonicSaturator extends Tone.ToneAudioNode {
    public readonly name: string = 'HarmonicSaturator';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    private dryGain: Tone.Gain;
    private wetGain: Tone.Gain;
    private driveGain: Tone.Gain;
    private shaper: Tone.WaveShaper;
    private _drive: number = 1.0;
    private _mix: number = 0.5;

    constructor() {
        super();
        this.input = new Tone.Gain();
        this.output = new Tone.Gain();

        // Drive stage: multiply input amplitude before saturation
        this.driveGain = new Tone.Gain(this._drive);

        // Waveshaper: cubic soft clipper (3x - x³) / 2
        this.shaper = new Tone.WaveShaper((x: number) => {
            if (x > 1) return 1;
            if (x < -1) return -1;
            return (3 * x - x * x * x) / 2;
        }, 4096);

        // Dry/wet mix using two gain nodes
        this.dryGain = new Tone.Gain(1 - this._mix);
        this.wetGain = new Tone.Gain(this._mix);

        // Signal routing:
        //   input ──┬── dryGain ──────────┬── output
        //           └── driveGain → shaper → wetGain ──┘
        this.input.connect(this.dryGain);
        this.dryGain.connect(this.output);

        this.input.connect(this.driveGain);
        this.driveGain.connect(this.shaper);
        this.shaper.connect(this.wetGain);
        this.wetGain.connect(this.output);
    }

    public get drive(): number {
        return this._drive;
    }

    public set drive(value: number) {
        this._drive = value;
        this.driveGain.gain.rampTo(value, 0.05);
    }

    public get mix(): number {
        return this._mix;
    }

    public set mix(value: number) {
        this._mix = Math.max(0, Math.min(1, value));
        this.wetGain.gain.rampTo(this._mix, 0.05);
        this.dryGain.gain.rampTo(1 - this._mix, 0.05);
    }

    public dispose(): this {
        super.dispose();
        this.input.dispose();
        this.output.dispose();
        this.driveGain.dispose();
        this.shaper.dispose();
        this.dryGain.dispose();
        this.wetGain.dispose();
        return this;
    }
}
