/**
 * WaveEffectWorklet - Loop player + lowpass filter + gain on audio thread.
 * No Panner3D: output goes to reverb, spatial placement is optional.
 * Init is deferred until we have a real AudioContext (after Tone.start()).
 */
import * as Tone from 'tone';
import { WAVE_SAMPLER_CONFIG } from '../sources/Sampler';
import { getCachedWaveBuffer } from '../sources/WaveBufferCache';

function getRawAudioContext(): AudioContext | null {
    const c = Tone.getContext() as unknown as { rawContext?: AudioContext; _context?: AudioContext };
    const raw = c?.rawContext ?? (c as { _context?: AudioContext })?._context ?? null;
    return raw instanceof AudioContext ? raw : null;
}

export class WaveEffectWorklet extends Tone.ToneAudioNode {
    public readonly name = 'WaveEffectWorklet';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    private worklet: AudioWorkletNode | null = null;
    private _initialized = false;
    private _playing = false;
    private _bufferLoaded = false;
    private _initPromise: Promise<void> | null = null;

    constructor() {
        super();
        this.input = new Tone.Gain(0);
        this.output = new Tone.Gain();
    }

    private async initWorklet(): Promise<void> {
        if (this._initPromise) return this._initPromise;
        this._initPromise = (async () => {
            try {
                const ctx = getRawAudioContext();
                if (!ctx) {
                    // Context is set after Tone.start(); init will retry on next update/start.
                    return;
                }
                if (!ctx.audioWorklet) {
                    console.warn('[WaveEffectWorklet] AudioWorklet not supported.');
                    return;
                }

                await ctx.audioWorklet.addModule('/worklets/instruments/wave-effect-processor.js');
                if ((this as unknown as { disposed?: boolean }).disposed) return;

                const opts = { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] as number[] };
                this.worklet = new AudioWorkletNode(ctx, 'wave-effect-processor', opts);
                if (!this.worklet) throw new Error('Could not create AudioWorkletNode');

                const outInput = (this.output as unknown as { input: AudioNode }).input;
                this.worklet.connect(outInput as AudioNode);

                await this.loadBuffer(ctx);
                this._initialized = true;
            } catch (e) {
                console.error('[WaveEffectWorklet] Failed to init:', e);
                this._initPromise = null;
            }
        })();
        return this._initPromise;
    }

    private async loadBuffer(ctx?: AudioContext | null): Promise<void> {
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

            const audioCtx = ctx ?? getRawAudioContext();
            if (audioCtx) {
                try {
                    const res = await fetch(WAVE_SAMPLER_CONFIG.path);
                    const arrayBuffer = await res.arrayBuffer();
                    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
                    const ch0 = audioBuffer.getChannelData(0);
                    const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
                    this.worklet?.port.postMessage({
                        type: 'buffer',
                        channel0: ch0,
                        channel1: ch1,
                        length: audioBuffer.length,
                        sampleRate: audioBuffer.sampleRate,
                    });
                } catch {
                    const fallback = getCachedWaveBuffer();
                    if (fallback && this.worklet) {
                        this.worklet.port.postMessage({
                            type: 'buffer',
                            channel0: fallback.channel0,
                            channel1: fallback.channel1,
                            length: fallback.length,
                            sampleRate: fallback.sampleRate,
                        });
                    }
                }
            } else {
                const fallback = getCachedWaveBuffer();
                if (fallback && this.worklet) {
                    this.worklet.port.postMessage({
                        type: 'buffer',
                        channel0: fallback.channel0,
                        channel1: fallback.channel1,
                        length: fallback.length,
                        sampleRate: fallback.sampleRate,
                    });
                }
            }
            this._bufferLoaded = true;
        } catch (e) {
            console.error('[WaveEffectWorklet] Failed to load buffer:', e);
        }
    }

    /** Apply DSP updates (intensity = gain, filterFreq = lowpass). Init is deferred until first use. */
    update(intensity: number, filterFreq: number, time?: number) {
        if (!this._initialized) {
            void this.initWorklet();
            return;
        }
        if (!this.worklet) return;

        const intensityParam = this.worklet.parameters.get('intensity') as AudioParam | undefined;
        const filterParam = this.worklet.parameters.get('filterFreq') as AudioParam | undefined;
        const t = time ?? Tone.now();

        if (intensityParam) intensityParam.setTargetAtTime(intensity, t, 0.1);
        if (filterParam) filterParam.setTargetAtTime(filterFreq, t, 0.1);

        if (!this._playing && this._bufferLoaded) {
            this.start();
        }
    }

    start() {
        if (!this._initialized) {
            void this.initWorklet();
            return;
        }
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
