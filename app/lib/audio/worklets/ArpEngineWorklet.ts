import * as Tone from 'tone';
import { ARP_SOUND_PRESETS, type ArpSoundPreset } from '../presets/ArpSoundPresets';

export type ArpMode = 'node' | 'edge' | 'face';

/**
 * ArpEngineWorklet - Unified arpeggiator synthesis on audio thread.
 * One instance per "arp" - for Edge mode, use TWO instances (one per edge endpoint).
 */
export class ArpEngineWorklet extends Tone.ToneAudioNode {
    public readonly name = 'ArpEngineWorklet';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    private worklet: AudioWorkletNode | null = null;
    private _mode: ArpMode = 'node';
    private _initialized = false;

    constructor(options?: { mode?: ArpMode }) {
        super();
        this.input = new Tone.Gain(0); // Source node - no input
        this.output = new Tone.Gain();
        if (options?.mode != null) this._mode = options.mode;
        this.initWorklet();
    }

    private async initWorklet() {
        try {
            const context = Tone.getContext() as any;
            const rawContext = context?.rawContext as BaseAudioContext | undefined;
            if (!rawContext?.audioWorklet) {
                console.warn('[ArpEngineWorklet] AudioWorklet not supported.');
                return;
            }

            await rawContext.audioWorklet.addModule('/worklets/performer/arp-engine-processor.js');
            if ((this as any).disposed) return;

            const opts = {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2],
            };

            if (typeof context.createAudioWorkletNode === 'function') {
                this.worklet = context.createAudioWorkletNode('arp-engine-processor', opts);
            } else {
                this.worklet = new AudioWorkletNode(rawContext, 'arp-engine-processor', opts);
            }

            if (!this.worklet) throw new Error('Could not create AudioWorkletNode');

            this.worklet.connect(this.output.input as unknown as AudioNode);

            const modeVal = { node: 0, edge: 1, face: 2 }[this._mode] ?? 0;
            (this.worklet.parameters.get('sampleRate') as AudioParam)!.value = rawContext.sampleRate;
            (this.worklet.parameters.get('mode') as AudioParam)!.value = modeVal;

            this.worklet.port.postMessage({
                type: 'init',
                baseTime: rawContext.currentTime,
            });
            this.worklet.port.postMessage({ type: 'setMode', mode: modeVal });
            this.worklet.port.postMessage({ type: 'setSoundPreset', preset: ARP_SOUND_PRESETS[this._mode] });
            this._initialized = true;
        } catch (e) {
            console.error('[ArpEngineWorklet] Failed to load AudioWorklet:', e);
        }
    }

    get mode(): ArpMode {
        return this._mode;
    }
    set mode(v: ArpMode) {
        this._mode = v;
        const modeVal = { node: 0, edge: 1, face: 2 }[v] ?? 0;
        (this.worklet?.parameters.get('mode') as AudioParam)?.setValueAtTime(modeVal, Tone.context.currentTime);
        this.worklet?.port?.postMessage({ type: 'setMode', mode: modeVal });
        this.worklet?.port?.postMessage({ type: 'setSoundPreset', preset: ARP_SOUND_PRESETS[v] });
    }

    /** Inject Sound Preset from main thread (e.g. custom preset) */
    setSoundPreset(preset: ArpSoundPreset): void {
        this.worklet?.port?.postMessage({ type: 'setSoundPreset', preset });
    }

    /**
     * Schedule a note. time = context time (seconds); duration in seconds.
     */
    trigger(frequency: number, velocity: number, time: number, duration?: number, slotIndex?: number): void {
        if (!this.worklet?.port) return;
        const ctxTime = Tone.getContext().currentTime;
        const startTime = time;
        const dur = duration ?? (this._mode === 'node' ? 0.5 : this._mode === 'edge' ? 0.125 : 0.5);
        this.worklet.port.postMessage({
            type: 'noteOn',
            frequency,
            velocity,
            startTime,
            duration: dur,
            slotIndex,
        });
    }

    releaseAll(): void {
        this.worklet?.port?.postMessage({ type: 'releaseAll' });
    }

    releaseVoice(slotIndex: number): void {
        this.worklet?.port?.postMessage({ type: 'releaseVoice', slotIndex });
    }

    dispose(): this {
        super.dispose();
        this.input.dispose();
        this.output.dispose();
        this.worklet?.disconnect();
        return this;
    }
}
