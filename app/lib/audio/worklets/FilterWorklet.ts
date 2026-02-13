import * as Tone from 'tone';

/**
 * FilterWorklet - Tone-compatible wrapper for HP/LP filter AudioWorklet.
 * type 0 = lowpass, 1 = highpass.
 */
export class FilterWorklet extends Tone.ToneAudioNode {
    public readonly name = 'FilterWorklet';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    private worklet: AudioWorkletNode | null = null;
    private _frequency = 600;
    private _type: 'lowpass' | 'highpass' = 'lowpass';

    constructor(options?: { frequency?: number; type?: 'lowpass' | 'highpass'; Q?: number }) {
        super();
        this.input = new Tone.Gain();
        this.output = new Tone.Gain();
        if (options?.frequency != null) this._frequency = options.frequency;
        if (options?.type != null) this._type = options.type;
        this.input.connect(this.output);
        this.initWorklet();
    }

    private async initWorklet() {
        try {
            const context = Tone.getContext() as any;
            const rawContext = context?.rawContext as BaseAudioContext | undefined;
            if (!rawContext?.audioWorklet) {
                console.warn('[FilterWorklet] AudioWorklet not supported.');
                return;
            }

            await rawContext.audioWorklet.addModule('/worklets/effects/filter-processor.js');
            if ((this as any).disposed) return;

            if (typeof context.createAudioWorkletNode === 'function') {
                this.worklet = context.createAudioWorkletNode('filter-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                });
            } else {
                this.worklet = new AudioWorkletNode(rawContext, 'filter-processor', {
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
            this.frequency = this._frequency;
            this.type = this._type;
        } catch (e) {
            console.error('[FilterWorklet] Failed to load AudioWorklet:', e);
        }
    }

    get frequency(): number {
        return this._frequency;
    }
    set frequency(v: number) {
        this._frequency = v;
        const p = this.worklet?.parameters.get('frequency');
        if (p) (p as AudioParam).value = v;
    }

    get type(): 'lowpass' | 'highpass' {
        return this._type;
    }
    set type(v: 'lowpass' | 'highpass') {
        this._type = v;
        const val = v === 'highpass' ? 1 : 0;
        const p = this.worklet?.parameters.get('type');
        if (p) (p as AudioParam).value = val;
    }

    dispose(): this {
        super.dispose();
        this.input.dispose();
        this.output.dispose();
        this.worklet?.disconnect();
        return this;
    }
}
