/**
 * WaveRevolver - The Environmental Performer (JS Edition)
 */
import * as Tone from 'tone';
import { createSpatialPanner, updatePannerPosition } from '../utils/SpatialAudio';
import { WAVE_SAMPLER_CONFIG } from '../sources/Sampler';

export class WaveRevolver {
    constructor(ports) {
        this.panner = createSpatialPanner({
            distanceModel: 'exponential',
            refDistance: WAVE_SAMPLER_CONFIG.refDistance,
            maxDistance: WAVE_SAMPLER_CONFIG.maxDistance,
            rolloffFactor: WAVE_SAMPLER_CONFIG.rolloffFactor,
            useHRTF: WAVE_SAMPLER_CONFIG.useHRTF,
        });

        this.player = new Tone.Player({
            url: WAVE_SAMPLER_CONFIG.path,
            loop: true,
            autostart: false,
            fadeIn: 1,
            fadeOut: 1,
            volume: 8
        });

        this.filter = new Tone.Filter({
            type: 'lowpass',
            frequency: 800,
            Q: 0.5
        });

        this.pulseGain = new Tone.Gain(WAVE_SAMPLER_CONFIG.baseVolume);

        this.player.connect(this.filter);
        this.filter.connect(this.pulseGain);
        this.pulseGain.connect(this.panner);

        const dest = (ports && ports.main) ? ports.main : ports;
        this.panner.connect(dest);

        if (ports && ports.wave) {
            this.panner.connect(ports.wave);
        }

        this.isPlaying = false;
        this.isDisposed = false;
    }

    /**
     * Apply DSP updates from the Conductor
     */
    update(intensity, filterFreq, position, time) {
        if (this.isDisposed) return;

        if (!this.isPlaying && this.player.buffer.loaded) {
            this.player.start();
            this.isPlaying = true;
        }

        updatePannerPosition(this.panner, position, 0.2);
        this.pulseGain.gain.setTargetAtTime(intensity, time, 0.1);
        this.filter.frequency.setTargetAtTime(filterFreq, time, 0.1);
    }

    stop() {
        if (this.isDisposed || !this.isPlaying) return;
        this.player.stop();
        this.isPlaying = false;
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.stop();
        this.player.dispose();
        this.filter.dispose();
        this.pulseGain.dispose();
        this.panner.dispose();
    }
}
