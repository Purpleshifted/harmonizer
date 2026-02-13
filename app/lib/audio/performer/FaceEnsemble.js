/**
 * FaceEnsemble - The Orchestral Performer (JS Edition)
 */
import * as Tone from 'tone';
import { createOrchestraEnsemble, loadInstrument } from '../sources/InstrumentFactory';
import { Fader } from '../engine/Fader';
import { createSpatialPanner, updatePannerPosition } from '../utils/SpatialAudio';
import { ensureOctave } from '../utils/NoteUtils';
import { ORCHESTRA_CONFIG } from '../sources/Sampler';

class OrchestralVoice {
    constructor(destination, sendBus) {
        this.panner = createSpatialPanner({ useHRTF: false, refDistance: 5, maxDistance: 50 });
        this.fader = new Fader(0);

        const config = ORCHESTRA_CONFIG;
        this.strings = createOrchestraEnsemble(config.strings.types, config.strings.volumes);
        this.horns = loadInstrument(config.horns.type);
        this.horns.volume.value = config.horns.volume;

        this.strings.connect(this.fader.gain);
        this.horns.connect(this.fader.gain);
        this.fader.connect(this.panner);
        this.panner.connect(destination);

        if (sendBus) {
            this.panner.connect(sendBus);
        }

        this.currentNote = null;
        this.isAllocated = false;
        this.isDisposed = false;
    }

    play(cmd, swellTime) {
        this.currentNote = cmd.note;
        this.isAllocated = true;
        updatePannerPosition(this.panner, cmd.position, 0);

        this.fader.rampTo(1.0, swellTime, cmd.time);
        this.strings.triggerAttack(cmd.note, cmd.time, cmd.velocity);

        if (this.horns.loaded) {
            this.horns.triggerAttack(ensureOctave(cmd.note, 3), cmd.time, cmd.velocity * ORCHESTRA_CONFIG.horns.biteVelocity);
        }
    }

    stop(time, fadeTime) {
        this.isAllocated = false;
        const noteToStop = this.currentNote;
        this.currentNote = null;
        this.fader.rampTo(0, fadeTime, time);

        setTimeout(() => {
            if (!this.isAllocated && noteToStop && !this.isDisposed) {
                this.strings.releaseAll();
                this.horns.releaseAll();
            }
        }, (fadeTime + 0.5) * 1000);
    }

    updatePosition(position, rampTime) {
        updatePannerPosition(this.panner, position, rampTime);
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.strings.dispose();
        this.horns.dispose();
        this.fader.dispose();
        this.panner.dispose();
    }
}

export class FaceEnsemble {
    constructor(ports) {
        this.masterFader = new Fader(1.0);
        const dest = (ports && ports.main) ? ports.main : ports;
        const send = (ports && ports.spatial) ? ports.spatial : null;

        this.masterFader.connect(dest);
        this.voices = [];
        for (let i = 0; i < 8; i++) {
            this.voices.push(new OrchestralVoice(this.masterFader.gain, send));
        }
        this.isDisposed = false;
    }

    noteOn(cmd, swellTime = 4.0) {
        if (this.isDisposed) return null;
        const freeVoice = this.voices.find(v => !v.isAllocated);
        if (freeVoice) {
            freeVoice.play(cmd, swellTime);
            return freeVoice;
        }
        return null;
    }

    noteOff(voice, time, fadeTime = 6.0) {
        if (this.isDisposed) return;
        voice.stop(time, fadeTime);
    }

    updateVolume(scale, time) {
        if (this.isDisposed) return;
        this.masterFader.rampTo(scale, 0.1, time);
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.voices.forEach(v => v.dispose());
        this.masterFader.dispose();
    }
}
