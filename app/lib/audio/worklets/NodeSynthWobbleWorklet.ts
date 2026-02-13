import * as Tone from 'tone';

/**
 * NodeSynthWobbleWorklet - LFO-modulated lowpass for NodeSynth pad wobble.
 * Replaces Tone.Filter + Tone.LFO in NodeSynth.
 */
export class NodeSynthWobbleWorklet extends Tone.ToneAudioNode {
    public readonly name = 'NodeSynthWobbleWorklet';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    private worklet: AudioWorkletNode | null = null;
    private _lfoRate = 0.02;
    private _lfoMin = 300;
    private _lfoMax = 800;

    constructor(options?: { lfoRate?: number; lfoMin?: number; lfoMax?: number }) {
        super();
        this.input = new Tone.Gain();
        this.output = new Tone.Gain();
        if (options?.lfoRate != null) this._lfoRate = options.lfoRate;
        if (options?.lfoMin != null) this._lfoMin = options.lfoMin;
        if (options?.lfoMax != null) this._lfoMax = options.lfoMax;
        this.input.connect(this.output);
        this.initWorklet();
    }

    private async initWorklet() {
        try {
            const context = Tone.getContext() as any;
            const rawContext = context?.rawContext as BaseAudioContext | undefined;
            if (!rawContext?.audioWorklet) {
                console.warn('[NodeSynthWobbleWorklet] AudioWorklet not supported.');
                return;
            }

            await rawContext.audioWorklet.addModule('/worklets/performer/node-synth-processor.js');
            if ((this as any).disposed) return;

            if (typeof context.createAudioWorkletNode === 'function') {
                this.worklet = context.createAudioWorkletNode('node-synth-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2],
                });
            } else {
                this.worklet = new AudioWorkletNode(rawContext, 'node-synth-processor', {
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
            this.lfoRate = this._lfoRate;
            this.lfoMin = this._lfoMin;
            this.lfoMax = this._lfoMax;
        } catch (e) {
            console.error('[NodeSynthWobbleWorklet] Failed to load AudioWorklet:', e);
        }
    }

    get lfoRate(): number {
        return this._lfoRate;
    }
    set lfoRate(v: number) {
        this._lfoRate = v;
        const p = this.worklet?.parameters.get('lfoRate');
        if (p) (p as AudioParam).value = v;
    }

    get lfoMin(): number {
        return this._lfoMin;
    }
    set lfoMin(v: number) {
        this._lfoMin = v;
        const p = this.worklet?.parameters.get('lfoMin');
        if (p) (p as AudioParam).value = v;
    }

    get lfoMax(): number {
        return this._lfoMax;
    }
    set lfoMax(v: number) {
        this._lfoMax = v;
        const p = this.worklet?.parameters.get('lfoMax');
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
