/**
 * FaceEnsemble - The Orchestral Performer (JS Edition)
 * No per-voice panner (avoids buffering when moving); long attack/release for swell.
 */
import * as Tone from 'tone';
import { createOrchestraEnsemble, loadInstrument } from '../sources/InstrumentFactory';
import { Fader } from '../engine/Fader';
import { ensureOctave } from '../utils/NoteUtils';
import { ORCHESTRA_CONFIG } from '../sources/Sampler';

class OrchestralVoice {
    constructor(destination, sendBus, deepBus) {
        this.fader = new Fader(0);

        const config = ORCHESTRA_CONFIG;
        const str = config.strings;
        const attack = str.attack ?? 6;
        const release = str.release ?? 10;
        this.strings = createOrchestraEnsemble(str.types, str.volumes, {
            attack,
            release,
            staggerSeconds: str.staggerSeconds ?? 0,
        });
        this.horns = loadInstrument(config.horns.type, { attack: config.horns.attack ?? 4, release: config.horns.release ?? 10 });
        this.horns.volume.value = config.horns.volume;

        this.strings.connect(this.fader.gain);
        this.horns.connect(this.fader.gain);
        this.fader.connect(destination);
        if (sendBus) this.fader.connect(sendBus);
        if (deepBus) this.fader.connect(deepBus);

        this.currentNote = null;
        this.isAllocated = false;
        this.isDisposed = false;
    }

    play(cmd, swellTime) {
        this.currentNote = cmd.note;
        this.isAllocated = true;

        this.fader.rampTo(0.28, swellTime, cmd.time);
        this.strings.triggerAttack(cmd.note, cmd.time, cmd.velocity);

        const hornStagger = ORCHESTRA_CONFIG.horns.staggerAfterStrings ?? 0;
        const hornTime = typeof cmd.time === 'number' ? cmd.time + hornStagger : cmd.time;
        if (this.horns.loaded) {
            this.horns.triggerAttack(ensureOctave(cmd.note, 3), hornTime, cmd.velocity * ORCHESTRA_CONFIG.horns.biteVelocity);
        }
    }

    stop(time, fadeTime) {
        this.isAllocated = false;
        const noteToStop = this.currentNote;
        this.currentNote = null;
        this.fader.rampTo(0, fadeTime, time);

        const transport = Tone.getTransport();
        if (transport.state !== 'started') transport.start();
        transport.scheduleOnce((t) => {
            if (!this.isAllocated && noteToStop && !this.isDisposed) {
                this.strings.releaseAll(t);
                this.horns.releaseAll(t);
            }
        }, `+${fadeTime + 0.5}`);
    }

    updatePosition(_position, _rampTime) {
        // No panner: position updates skipped to avoid buffering when moving
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.strings.dispose();
        this.horns.dispose();
        this.fader.dispose();
    }
}

export class FaceEnsemble {
    constructor(ports) {
        this.masterFader = new Fader(1.0);
        const dest = (ports && ports.main) ? ports.main : ports;
        const send = (ports && ports.spatial) ? ports.spatial : null;
        const deep = (ports && ports.deep) ? ports.deep : null;

        this.masterFader.connect(dest);
        this.voices = [];
        for (let i = 0; i < 8; i++) {
            this.voices.push(new OrchestralVoice(this.masterFader.gain, send, deep));
        }
        this.isDisposed = false;
    }

    noteOn(cmd, swellTime) {
        if (this.isDisposed) return null;
        const freeVoice = this.voices.find(v => !v.isAllocated);
        if (freeVoice) {
            const t = swellTime ?? ORCHESTRA_CONFIG.strings.swellTime ?? 4.0;
            freeVoice.play(cmd, t);
            return freeVoice;
        }
        return null;
    }

    noteOff(voice, time, fadeTime) {
        if (this.isDisposed) return;
        const t = fadeTime ?? ORCHESTRA_CONFIG.strings.fadeTime ?? 10.0;
        voice.stop(time, t);
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
