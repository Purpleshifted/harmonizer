import * as Tone from 'tone';

/**
 * StereoWidthWorklet - Tone.js compatible wrapper for stereo width AudioWorklet.
 * width 0 = mono, 1 = pass-through, >1 = wider image.
 */
export class StereoWidthWorklet extends Tone.ToneAudioNode {
    public readonly name = 'StereoWidthWorklet';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    private worklet: AudioWorkletNode | null = null;
    private _width: number = 1.0;

    constructor() {
        super();
        this.input = new Tone.Gain();
        this.output = new Tone.Gain();
        this.input.connect(this.output);
        this.initWorklet();
    }

    private async initWorklet() {
        try {
            const context = Tone.getContext() as any;
            const rawContext = context?.rawContext as BaseAudioContext | undefined;
            if (!rawContext?.audioWorklet) {
                console.warn('[StereoWidthWorklet] AudioWorklet not supported.');
                return;
            }

            await rawContext.audioWorklet.addModule('/worklets/performer/face-synth-processor.js');
            if (this.disposed) return;

            if (typeof context.createAudioWorkletNode === 'function') {
                this.worklet = context.createAudioWorkletNode('face-synth-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                });
            } else {
                this.worklet = new AudioWorkletNode(rawContext, 'face-synth-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                });
            }

            if (!this.worklet) throw new Error('Could not create AudioWorkletNode');
            this.input.disconnect(this.output);
            this.input.connect(this.worklet as unknown as Tone.InputNode);
            this.worklet.connect(this.output.input as unknown as AudioNode);

            if (this._width !== undefined) this.width = this._width;
        } catch (e) {
            console.error('[StereoWidthWorklet] Failed to load AudioWorklet:', e);
        }
    }

    public get width(): number {
        return this._width;
    }

    public set width(value: number) {
        this._width = value;
        if (this.worklet) {
            const param = this.worklet.parameters.get('width');
            if (param) param.value = value;
        }
    }

    public dispose(): this {
        super.dispose();
        this.input.dispose();
        this.output.dispose();
        this.worklet?.disconnect();
        return this;
    }
}
