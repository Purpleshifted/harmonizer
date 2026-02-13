/**
 * EdgeArpeggiator - The Isolated Multi-Voice Performer (JS Edition)
 */
import * as Tone from 'tone';
import { createSpatialPanner, updatePannerPosition } from '../utils/SpatialAudio';
import { createDelay } from '../engine/ReverbFactory';
import { ARP_SYNTH_CONFIG } from '../sources/Oscillator';

class IndependentVoice {
    constructor(index, destination) {
        this.panner = createSpatialPanner({
            refDistance: 2,
            maxDistance: 30,
            rolloffFactor: 1.0,
        });

        this.gain = new Tone.Gain(0);
        this.synth = new Tone.Synth(ARP_SYNTH_CONFIG);

        this.synth.connect(this.panner);
        this.panner.connect(this.gain);
        this.gain.connect(destination);

        const subdivision = index < 2 ? '8n' : '16n';
        this.sequence = new Tone.Sequence(
            (time, val) => {
                if (val && val.note) {
                    const dur = index < 2 ? '8n' : '32n';
                    this.synth.triggerAttackRelease(val.note, dur, time, val.velocity);
                }
            },
            [],
            subdivision
        ).start(0);
        this.isAllocated = false;
    }

    update(cmd) {
        this.isAllocated = true;
        updatePannerPosition(this.panner, cmd.position, 0.15);
        this.sequence.events = cmd.events;

        const targetGain = cmd.isEdge ? 0.6 : 0.15;
        this.gain.gain.rampTo(targetGain, 0.5);
    }

    stop() {
        this.isAllocated = false;
        this.gain.gain.rampTo(0, 0.5);
        this.sequence.events = [];
    }

    dispose() {
        this.synth.dispose();
        this.panner.dispose();
        this.gain.dispose();
        this.sequence.dispose();
    }
}

export class EdgeArpeggiator {
    constructor(ports) {
        this.limiter = new Tone.Limiter(-6);
        this.masterGain = new Tone.Gain(0);
        this.filter = new Tone.Filter({ type: 'highpass', frequency: 600 });
        this.delay = createDelay('8n.', 0.25, 0.3);

        this.masterGain.connect(this.filter);
        this.filter.connect(this.delay);
        this.delay.connect(this.limiter);

        // Connect to Master and Spatial Reverb Send
        const dest = (ports && ports.main) ? ports.main : ports;
        this.limiter.connect(dest);
        if (ports && ports.spatial) {
            this.limiter.connect(ports.spatial);
        }

        this.voices = [];
        for (let i = 0; i < 7; i++) {
            this.voices.push(new IndependentVoice(i, this.masterGain));
        }
    }

    updateVoice(index, cmd) {
        if (this.voices[index]) {
            this.voices[index].update(cmd);
        }
    }

    stopVoice(index) {
        if (this.voices[index]) {
            this.voices[index].stop();
        }
    }

    setVolume(volume, rampTime, time) {
        this.masterGain.gain.rampTo(volume, rampTime, time);
        if (volume > 0.01) {
            if (Tone.getTransport().state !== 'started') {
                Tone.getTransport().start();
            }
        }
    }

    stop() {
        this.voices.forEach(v => v.stop());
    }

    dispose() {
        this.voices.forEach(v => v.dispose());
        this.filter.dispose();
        this.delay.dispose();
        this.masterGain.dispose();
        this.limiter.dispose();
    }
}