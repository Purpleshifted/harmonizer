import * as Tone from 'tone';

/**
 * HarmonicSaturator - A Tone.js compatible wrapper for a custom AudioWorklet saturator.
 */
export class HarmonicSaturator extends Tone.ToneAudioNode {
    public readonly name: string = 'HarmonicSaturator';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    private worklet: AudioWorkletNode | null = null;
    private _drive: number = 1.0;
    private _mix: number = 0.5;

    constructor() {
        super();
        this.input = new Tone.Gain();
        this.output = new Tone.Gain();

        // Initialization is async, so we use a placeholder gain until loaded
        this.input.connect(this.output);
        this.initWorklet();
    }

    private async initWorklet() {
        try {
            const context = Tone.getContext();
            const rawContext = context.rawContext as any;

            if (!rawContext || !rawContext.audioWorklet) {
                console.warn('[HarmonicSaturator] AudioWorklet not supported.');
                return;
            }

            // 1. Load performer worklet (saturator logic merged into base-drone-processor)
            await rawContext.audioWorklet.addModule('/worklets/performer/base-drone-processor.js');

            if (this.disposed) return;

            // 2. Create node using Tone's helper if it exists, otherwise use native
            if (typeof (context as any).createAudioWorkletNode === 'function') {
                this.worklet = (context as any).createAudioWorkletNode('base-drone-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2]
                });
            } else {
                this.worklet = new AudioWorkletNode(rawContext, 'base-drone-processor', {
                    numberOfInputs: 1,
                    numberOfOutputs: 1,
                    outputChannelCount: [2]
                });
            }

            if (!this.worklet) throw new Error('Could not create AudioWorkletNode');

            // Re-route through worklet
            this.input.disconnect(this.output);
            this.input.connect(this.worklet as unknown as Tone.InputNode);
            this.worklet.connect(this.output.input as unknown as AudioNode);

            if (this._drive !== undefined) this.drive = this._drive;
            if (this._mix !== undefined) this.mix = this._mix;
        } catch (e) {
            console.error('[HarmonicSaturator] Failed to load AudioWorklet:', e);
        }
    }

    public get drive(): number {
        return this._drive;
    }

    public set drive(value: number) {
        this._drive = value;
        if (this.worklet) {
            const param = this.worklet.parameters.get('drive');
            if (param) param.value = value;
        }
    }

    public get mix(): number {
        return this._mix;
    }

    public set mix(value: number) {
        this._mix = value;
        if (this.worklet) {
            const param = this.worklet.parameters.get('mix');
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
