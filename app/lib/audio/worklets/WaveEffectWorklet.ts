/**
 * WaveEffectWorklet - Loop player + lowpass filter + gain using Tone.js native nodes.
 * Replaced AudioWorklet with Tone.Player for reliable cross-browser support.
 * Same external interface — WaveRevolver needs no changes.
 */
import * as Tone from 'tone';
import { WAVE_SAMPLER_CONFIG } from '../sources/Sampler';

export class WaveEffectWorklet extends Tone.ToneAudioNode {
    public readonly name = 'WaveEffectWorklet';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    /** Resolves when the audio buffer is loaded and ready */
    public readonly ready: Promise<boolean>;

    private player: Tone.Player | null = null;
    private filter: Tone.Filter;
    private intensityGain: Tone.Gain;
    private _playing = false;
    private _initialized = false;

    constructor() {
        super();
        this.input = new Tone.Gain(0);
        this.output = new Tone.Gain();

        // Build signal chain: Player → intensityGain → filter → output
        this.intensityGain = new Tone.Gain(0);
        this.filter = new Tone.Filter({ type: 'lowpass', frequency: 800 });

        this.intensityGain.connect(this.filter);
        this.filter.connect(this.output);

        this.ready = this.initPlayer();
    }

    private async initPlayer(): Promise<boolean> {
        try {
            this.player = new Tone.Player({
                url: WAVE_SAMPLER_CONFIG.path,
                loop: true,
                autostart: false,
                volume: -6,
            });

            // Wait for the audio file to be loaded
            await Tone.loaded();
            if ((this as any).disposed) return false;

            this.player.connect(this.intensityGain);
            this._initialized = true;
            console.log('[WaveEffectWorklet] ✓ initialized (Tone.Player)');
            return true;
        } catch (e) {
            console.error('[WaveEffectWorklet] Failed to load audio:', e);
            return false;
        }
    }

    /** Apply DSP updates from the Conductor (no position - spatialization is after reverb) */
    update(intensity: number, filterFreq: number, time: number) {
        if (!this._initialized || !this.player) return;

        const t = time ?? Tone.now();

        this.intensityGain.gain.rampTo(intensity, 0.1, t);
        this.filter.frequency.rampTo(filterFreq, 0.1, t);

        if (!this._playing) {
            this.start();
        }
    }

    start() {
        if (!this._playing && this.player && this._initialized) {
            try {
                this.player.start();
                this._playing = true;
            } catch {
                // May fail if context not started yet — will retry on next update
            }
        }
    }

    stop() {
        if (this._playing && this.player) {
            try { this.player.stop(); } catch { /* noop */ }
            this._playing = false;
        }
    }

    get isPlaying(): boolean {
        return this._playing;
    }

    dispose(): this {
        this.stop();
        this.player?.dispose();
        this.filter.dispose();
        this.intensityGain.dispose();
        super.dispose();
        this.input.dispose();
        this.output.dispose();
        return this;
    }
}
