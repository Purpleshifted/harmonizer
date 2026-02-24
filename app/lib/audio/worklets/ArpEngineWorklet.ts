/**
 * ArpEngineWorklet - Arpeggiator synthesis using Tone.js native synths.
 * Replaced AudioWorklet with Tone.Synth array for reliable cross-browser support.
 * Same external interface — ArpeggiatorEngine needs no changes.
 *
 * Voice count is minimised per mode to keep the Web Audio graph light:
 *   node → 2, edge → 7, face → 3  (total across 4 instances ≈ 19 vs 48 before)
 */
import * as Tone from 'tone';
import { ARP_SOUND_PRESETS, type ArpSoundPreset } from '../presets/ArpSoundPresets';

export type ArpMode = 'node' | 'edge' | 'face';

/** Voices actually needed per mode (keeps Web Audio node count low) */
const VOICES_PER_MODE: Record<ArpMode, number> = {
    node: 2,   // probability trigger, rarely >1 concurrent
    edge: 7,   // edgeArp1 uses 1, edgeArp2 uses up to 6
    face: 3,   // sequence plays 1 at a time, 3 for overlap
};

export class ArpEngineWorklet extends Tone.ToneAudioNode {
    public readonly name = 'ArpEngineWorklet';
    public readonly input: Tone.Gain;
    public readonly output: Tone.Gain;

    /** Resolves immediately — no async init needed with Tone.js */
    public readonly ready: Promise<boolean>;

    private synths: Tone.Synth[] = [];
    private _mode: ArpMode = 'node';
    private _initialized = false;

    constructor(options?: { mode?: ArpMode }) {
        super();
        this.input = new Tone.Gain(0);
        this.output = new Tone.Gain();
        if (options?.mode != null) this._mode = options.mode;

        this.buildSynths(ARP_SOUND_PRESETS[this._mode]);
        this._initialized = true;
        this.ready = Promise.resolve(true);
    }

    /** Create (or re-create) the synth array from a sound preset */
    private buildSynths(preset: ArpSoundPreset) {
        // Dispose old synths if rebuilding
        this.synths.forEach((s) => { try { s.dispose(); } catch { /* noop */ } });
        this.synths = [];

        const count = VOICES_PER_MODE[this._mode] ?? 3;

        for (let i = 0; i < count; i++) {
            const synth = new Tone.Synth({
                oscillator: { type: 'sine' as any },
                envelope: {
                    attack: (preset.attack ?? 15) / 1000,
                    decay: (preset.decay ?? 400) / 1000,
                    sustain: preset.sustain ?? 0.1,
                    release: (preset.release ?? 800) / 1000,
                },
                volume: 0,
            });
            synth.connect(this.output);
            this.synths.push(synth);
        }
    }

    get mode(): ArpMode {
        return this._mode;
    }
    set mode(v: ArpMode) {
        this._mode = v;
        this.buildSynths(ARP_SOUND_PRESETS[v]);
    }

    /** Inject Sound Preset from main thread */
    setSoundPreset(preset: ArpSoundPreset): void {
        this.buildSynths(preset);
    }

    /**
     * Schedule a note. time = context time (seconds); duration in seconds.
     * Velocity is scaled by 0.3 to match original worklet output levels.
     */
    trigger(frequency: number, velocity: number, time: number, duration?: number, slotIndex?: number): void {
        if (!this._initialized || this.synths.length === 0) return;

        let slot = slotIndex;
        if (slot == null || slot < 0 || slot >= this.synths.length) {
            slot = this.findFreeSlot();
        }
        // Wrap slot to available synth count
        slot = slot % this.synths.length;

        const synth = this.synths[slot];
        const dur = duration ?? (this._mode === 'node' ? 0.5 : this._mode === 'edge' ? 0.125 : 0.5);

        try {
            // Match original worklet: output = sample * env * vel * 0.3
            synth.triggerAttackRelease(frequency, dur, time, velocity * 0.3);
        } catch {
            // Tone.js may throw if context isn't started yet — safe to ignore
        }
    }

    private findFreeSlot(): number {
        for (let i = 0; i < this.synths.length; i++) {
            const env = this.synths[i].envelope;
            if (env.value < 0.01) return i;
        }
        return 0;
    }

    releaseAll(): void {
        this.synths.forEach((s) => {
            try { s.triggerRelease(); } catch { /* noop */ }
        });
    }

    releaseVoice(slotIndex: number): void {
        const slot = slotIndex % this.synths.length;
        if (slot >= 0 && slot < this.synths.length) {
            try { this.synths[slot].triggerRelease(); } catch { /* noop */ }
        }
    }

    dispose(): this {
        this.synths.forEach((s) => { try { s.dispose(); } catch { /* noop */ } });
        this.synths = [];
        this._initialized = false;
        super.dispose();
        this.input.dispose();
        this.output.dispose();
        return this;
    }
}
