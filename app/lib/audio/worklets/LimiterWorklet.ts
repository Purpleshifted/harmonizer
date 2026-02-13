import * as Tone from 'tone';

/**
 * LimiterWorklet - Tone-compatible wrapper for soft limiter AudioWorklet.
 * threshold in dB (e.g. -6).
 */
export class LimiterWorklet extends Tone.ToneAudioNode {
    public readonly name = 'LimiterWorklet';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    private worklet: AudioWorkletNode | null = null;
    private _threshold = -3;

    constructor(options?: { threshold?: number }) {
        super();
        this.input = new Tone.Gain();
        this.output = new Tone.Gain();
        if (options?.threshold != null) this._threshold = options.threshold;
        this.input.connect(this.output);
        this.initWorklet();
    }

    private async initWorklet() {
        try {
            const context = Tone.getContext() as any;
            const rawContext = context?.rawContext as BaseAudioContext | undefined;
            if (!rawContext?.audioWorklet) {
                console.warn('[LimiterWorklet] AudioWorklet not supported.');
                return;
            }

            await rawContext.audioWorklet.addModule('/worklets/effects/limiter-processor.js');
            if ((this as any).disposed) return;

            if (typeof context.createAudioWorkletNode === 'function') {
                this.worklet = context.createAudioWorkletNode('limiter-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                });
            } else {
                this.worklet = new AudioWorkletNode(rawContext, 'limiter-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                });
            }

            if (!this.worklet) throw new Error('Could not create AudioWorkletNode');
            this.input.disconnect(this.output);
            this.input.connect(this.worklet as unknown as Tone.InputNode);
            this.worklet.connect(this.output.input as unknown as AudioNode);

            this.threshold = this._threshold;
        } catch (e) {
            console.error('[LimiterWorklet] Failed to load AudioWorklet:', e);
        }
    }

    get threshold(): number {
        return this._threshold;
    }
    set threshold(v: number) {
        this._threshold = v;
        const param = this.worklet?.parameters.get('threshold');
        if (param) (param as AudioParam).value = v;
    }

    dispose(): this {
        super.dispose();
        this.input.dispose();
        this.output.dispose();
        this.worklet?.disconnect();
        return this;
    }
}
