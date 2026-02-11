import * as Tone from 'tone';

/**
 * Effector - Shared effects and volume routing for Node mode
 */
export class Effector {
    public readonly filter: Tone.Filter;
    public readonly lfo: Tone.LFO;
    public readonly volume: Tone.Volume;
    public readonly dryGain: Tone.Gain;
    public readonly sendGain: Tone.Gain;

    constructor(sharedDeepReverb: Tone.Reverb) {
        // Filter with LFO modulation for "wobbling" effect
        this.filter = new Tone.Filter({
            type: 'lowpass',
            frequency: 450,
            Q: 1.2
        });

        // Slow LFO (breathing effect)
        this.lfo = new Tone.LFO({
            frequency: 0.15, // Slightly slower, more oceanic
            min: 350,
            max: 900,
            type: 'sine'
        }).start();
        this.lfo.connect(this.filter.frequency);

        // Volume control (-10dB base)
        this.volume = new Tone.Volume(-10);

        // Split Architecture
        this.dryGain = new Tone.Gain(0.6);
        this.sendGain = new Tone.Gain(0.4).connect(sharedDeepReverb);

        // Chain: Filter -> Volume -> Split
        this.filter.connect(this.volume);
        this.volume.connect(this.dryGain);
        this.volume.connect(this.sendGain);
    }

    /**
     * Set the global gain for Node mode
     */
    public setOutputVolume(volume: number, rampTime: number = 0.2) {
        const targetDb = volume < 0.01 ? -60 : Tone.gainToDb(volume);
        this.volume.volume.rampTo(targetDb, rampTime);
    }

    public connect(source: Tone.ToneAudioNode) {
        source.connect(this.filter);
        return this;
    }

    public dispose() {
        this.filter.dispose();
        this.lfo.dispose();
        this.volume.dispose();
        this.dryGain.dispose();
        this.sendGain.dispose();
    }
}
