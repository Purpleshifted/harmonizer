/**
 * BaseDrone - The Ambient Performer (JS Edition)
 */
import * as Tone from 'tone';
import { createSpatialPanner, updatePannerPosition } from '../utils/SpatialAudio';
import { HarmonicSaturator } from '../engine/HarmonicSaturator';
import { DRONE_OSC_CONFIG } from '../sources/Oscillator';

class DroneVoice {
    constructor(destination) {
        this.gain = new Tone.Gain(0);
        this.panner = createSpatialPanner({
            refDistance: 3,
            maxDistance: 40,
            rolloffFactor: 0.8,
            useHRTF: false
        });

        this.oscillator = new Tone.Oscillator({
            type: DRONE_OSC_CONFIG.type,
            frequency: 440,
        });

        this.oscillator.connect(this.panner);
        this.panner.connect(this.gain);
        this.gain.connect(destination);
        this.isPlaying = false;
    }

    update(cmd) {
        updatePannerPosition(this.panner, cmd.position, 0.1);
        const now = cmd.time ?? Tone.now();
        const gainDiff = Math.abs(this.gain.gain.value - cmd.gain);
        const freqDiff = Math.abs(this.oscillator.frequency.value - cmd.frequency);
        if (gainDiff > 0.02) this.gain.gain.rampTo(cmd.gain, 0.2, now);
        if (freqDiff > 0.5) this.oscillator.frequency.rampTo(cmd.frequency, 0.15, now);

        if (!this.isPlaying) {
            this.oscillator.start();
            this.isPlaying = true;
        }
    }

    stop() {
        this.oscillator.stop();
        this.isPlaying = false;
    }

    dispose() {
        this.oscillator.dispose();
        this.panner.dispose();
        this.gain.dispose();
    }
}

export class BaseDrone {
    constructor(ports) {
        const config = DRONE_OSC_CONFIG;
        this.masterGain = new Tone.Gain(0.2);
        this.saturator = new HarmonicSaturator();
        this.saturator.drive = config.baseDrive;
        this.saturator.mix = config.baseMix;
        this.limiter = new Tone.Limiter(config.limiterThreshold);

        this.masterGain.connect(this.saturator);
        this.saturator.connect(this.limiter);

        // Connect to Master and Ambient (Reverb) Send
        const dest = (ports && ports.main) ? ports.main : ports;
        this.limiter.connect(dest);
        if (ports && ports.ambient) {
            this.limiter.connect(ports.ambient);
        }

        this.voices = [];
        for (let i = 0; i < 4; i++) {
            this.voices.push(new DroneVoice(this.masterGain));
        }
    }

    updateVoice(index, cmd) {
        if (this.voices[index]) {
            this.voices[index].update(cmd);
        }
    }

    setVolume(volume, rampTime, time) {
        this.masterGain.gain.rampTo(volume, rampTime, time);
    }

    stop() {
        this.voices.forEach(v => v.stop());
    }

    dispose() {
        this.voices.forEach(v => v.dispose());
        this.saturator.dispose();
        this.limiter.dispose();
        this.masterGain.dispose();
    }
}