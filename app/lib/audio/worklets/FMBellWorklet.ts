import * as Tone from 'tone';

/**
 * FMBellWorklet - FM bell synth on audio thread (NodeArpeggiator).
 * Source node: no input, output only. Message protocol: init, noteOn, releaseAll.
 */
export class FMBellWorklet extends Tone.ToneAudioNode {
    public readonly name = 'FMBellWorklet';
    public readonly output: Tone.Gain;

    private worklet: AudioWorkletNode | null = null;
    private _harmonicity = 3.01;
    private _modulationIndex = 12;

    constructor(options?: { harmonicity?: number; modulationIndex?: number }) {
        super();
        this.output = new Tone.Gain();
        if (options?.harmonicity != null) this._harmonicity = options.harmonicity;
        if (options?.modulationIndex != null) this._modulationIndex = options.modulationIndex;
        this.initWorklet();
    }

    private async initWorklet() {
        try {
            const context = Tone.getContext() as any;
            const rawContext = context?.rawContext as BaseAudioContext | undefined;
            if (!rawContext?.audioWorklet) {
                console.warn('[FMBellWorklet] AudioWorklet not supported.');
                return;
            }

            await rawContext.audioWorklet.addModule('/worklets/instruments/fm-bell-processor.js');
            if ((this as any).disposed) return;

            const opts = {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2],
            };

            if (typeof context.createAudioWorkletNode === 'function') {
                this.worklet = context.createAudioWorkletNode('fm-bell-processor', opts);
            } else {
                this.worklet = new AudioWorkletNode(rawContext, 'fm-bell-processor', opts);
            }

            if (!this.worklet) throw new Error('Could not create AudioWorkletNode');

            this.worklet.connect(this.output.input as unknown as AudioNode);

            (this.worklet.parameters.get('sampleRate') as AudioParam)!.value = rawContext.sampleRate;
            this.harmonicity = this._harmonicity;
            this.modulationIndex = this._modulationIndex;

            this.worklet.port.postMessage({
                type: 'init',
                baseTime: rawContext.currentTime,
            });
        } catch (e) {
            console.error('[FMBellWorklet] Failed to load AudioWorklet:', e);
        }
    }

    get harmonicity(): number {
        return this._harmonicity;
    }
    set harmonicity(v: number) {
        this._harmonicity = v;
        const p = this.worklet?.parameters.get('harmonicity');
        if (p) (p as AudioParam).value = v;
    }

    get modulationIndex(): number {
        return this._modulationIndex;
    }
    set modulationIndex(v: number) {
        this._modulationIndex = v;
        const p = this.worklet?.parameters.get('modulationIndex');
        if (p) (p as AudioParam).value = v;
    }

    /**
     * Schedule a note. time in seconds (context time); duration from "4n" at current BPM.
     */
    trigger(note: string, velocity: number, time: number): void {
        if (!this.worklet?.port) return;
        const frequency = new Tone.Frequency(note).toFrequency();
        const duration = new Tone.Time('4n').toSeconds();
        this.worklet.port.postMessage({
            type: 'noteOn',
            frequency,
            velocity,
            startTime: time,
            duration,
        });
    }

    releaseAll(_time?: number): void {
        this.worklet?.port?.postMessage({ type: 'releaseAll' });
    }

    dispose(): this {
        super.dispose();
        this.output.dispose();
        this.worklet?.disconnect();
        return this;
    }
}
