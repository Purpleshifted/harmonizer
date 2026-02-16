/**
 * WaveEffectWorklet - Loop player + lowpass filter + gain on audio thread.
 * No Panner3D: output goes to reverb, then RotationSpatializer handles placement.
 */
import * as Tone from 'tone';
import { WAVE_SAMPLER_CONFIG } from '../sources/Sampler';
import { getCachedWaveBuffer } from '../sources/WaveBufferCache';

export class WaveEffectWorklet extends Tone.ToneAudioNode {
    public readonly name = 'WaveEffectWorklet';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    private worklet: AudioWorkletNode | null = null;
    private _initialized = false;
    private _playing = false;
    private _bufferLoaded = false;

    constructor() {
        super();
        this.input = new Tone.Gain(0);
        this.output = new Tone.Gain();
        this.initWorklet();
    }

    private async initWorklet() {
        try {
            const context = Tone.getContext() as any;
            const rawContext = context?.rawContext ?? context;
            if (!rawContext?.audioWorklet) {
                console.warn('[WaveEffectWorklet] AudioWorklet not supported.');
                return;
            }

            await rawContext.audioWorklet.addModule('/worklets/instruments/wave-effect-processor.js');
            if ((this as any).disposed) return;

            const opts = { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] };
            if (typeof context.createAudioWorkletNode === 'function') {
                this.worklet = context.createAudioWorkletNode('wave-effect-processor', opts);
            } else {
                this.worklet = new AudioWorkletNode(rawContext as BaseAudioContext, 'wave-effect-processor', opts);
            }
            if (!this.worklet) throw new Error('Could not create AudioWorkletNode');

            this.worklet.connect(this.output.input as unknown as AudioNode);

            await this.loadBuffer();
            this._initialized = true;
        } catch (e) {
            console.error('[WaveEffectWorklet] Failed to init:', e);
        }
    }

    private async loadBuffer() {
        try {
            const preloaded = getCachedWaveBuffer();
            if (preloaded && this.worklet) {
                this.worklet.port.postMessage({
                    type: 'buffer',
                    channel0: preloaded.channel0,
                    channel1: preloaded.channel1,
                    length: preloaded.length,
                    sampleRate: preloaded.sampleRate,
                });
                this._bufferLoaded = true;
                return;
            }

            const res = await fetch(WAVE_SAMPLER_CONFIG.path);
            const arrayBuffer = await res.arrayBuffer();
            const ctx = Tone.getContext() as any;
            const rawCtx = ctx?.rawContext ?? ctx;
            const audioBuffer = await rawCtx.decodeAudioData(arrayBuffer);
            const ch0 = audioBuffer.getChannelData(0);
            const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
            this.worklet?.port.postMessage({
                type: 'buffer',
                channel0: ch0,
                channel1: ch1,
                length: audioBuffer.length,
                sampleRate: audioBuffer.sampleRate,
            });
            this._bufferLoaded = true;
        } catch (e) {
            console.error('[WaveEffectWorklet] Failed to load buffer:', e);
        }
    }

    /** Apply DSP updates from the Conductor (no position - spatialization is after reverb) */
    update(intensity: number, filterFreq: number, time: number) {
        if (!this.worklet) return;

        const intensityParam = this.worklet.parameters.get('intensity') as AudioParam;
        const filterParam = this.worklet.parameters.get('filterFreq') as AudioParam;
        const t = time ?? Tone.now();

        if (intensityParam) intensityParam.setTargetAtTime(intensity, t, 0.1);
        if (filterParam) filterParam.setTargetAtTime(filterFreq, t, 0.1);

        if (!this._playing && this._bufferLoaded) {
            this.start();
        }
    }

    start() {
        if (!this._playing && this.worklet?.port) {
            this.worklet.port.postMessage({ type: 'start' });
            this._playing = true;
        }
    }

    stop() {
        if (this._playing && this.worklet?.port) {
            this.worklet.port.postMessage({ type: 'stop' });
            this._playing = false;
        }
    }

    get isPlaying(): boolean {
        return this._playing;
    }

    dispose(): this {
        this.stop();
        this.worklet?.disconnect();
        super.dispose();
        this.input.dispose();
        this.output.dispose();
        return this;
    }
}
