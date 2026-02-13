import * as Tone from 'tone';

/**
 * DelayWorklet - Tone-compatible wrapper for feedback delay AudioWorklet.
 * Replaces Tone.FeedbackDelay in performers.
 */
export class DelayWorklet extends Tone.ToneAudioNode {
    public readonly name = 'DelayWorklet';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    private worklet: AudioWorkletNode | null = null;
    private _delayTime = 0.5;
    private _feedback = 0.4;
    private _wet = 0.5;

    constructor(options?: { delayTime?: number; feedback?: number; wet?: number }) {
        super();
        this.input = new Tone.Gain();
        this.output = new Tone.Gain();
        if (options?.delayTime != null) this._delayTime = options.delayTime;
        if (options?.feedback != null) this._feedback = options.feedback;
        if (options?.wet != null) this._wet = options.wet;
        this.input.connect(this.output);
        this.initWorklet();
    }

    private async initWorklet() {
        try {
            const context = Tone.getContext() as any;
            const rawContext = context?.rawContext as BaseAudioContext | undefined;
            if (!rawContext?.audioWorklet) {
                console.warn('[DelayWorklet] AudioWorklet not supported.');
                return;
            }

            await rawContext.audioWorklet.addModule('/worklets/effects/delay-processor.js');
            if ((this as any).disposed) return;

            if (typeof context.createAudioWorkletNode === 'function') {
                this.worklet = context.createAudioWorkletNode('delay-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                });
            } else {
                this.worklet = new AudioWorkletNode(rawContext, 'delay-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                });
            }

            if (!this.worklet) throw new Error('Could not create AudioWorkletNode');
            this.input.disconnect(this.output);
            this.input.connect(this.worklet as unknown as Tone.InputNode);
            this.worklet.connect(this.output.input as unknown as AudioNode);

            (this.worklet.parameters.get('sampleRate') as AudioParam)!.value = rawContext.sampleRate;
            this.delayTime = this._delayTime;
            this.feedback = this._feedback;
            this.wet = this._wet;
        } catch (e) {
            console.error('[DelayWorklet] Failed to load AudioWorklet:', e);
        }
    }

    get delayTime(): number {
        return this._delayTime;
    }
    set delayTime(v: number) {
        this._delayTime = v;
        const p = this.worklet?.parameters.get('delayTime');
        if (p) (p as AudioParam).value = v;
    }

    get feedback(): number {
        return this._feedback;
    }
    set feedback(v: number) {
        this._feedback = v;
        const p = this.worklet?.parameters.get('feedback');
        if (p) (p as AudioParam).value = v;
    }

    get wet(): number {
        return this._wet;
    }
    set wet(v: number) {
        this._wet = v;
        const p = this.worklet?.parameters.get('wet');
        if (p) (p as AudioParam).value = v;
    }

    dispose(): this {
        super.dispose();
        this.input.dispose();
        this.output.dispose();
        this.worklet?.disconnect();
        return this;
    }
}
