/**
 * ArpEngineProcessor - Unified arpeggiator synthesis for node, edge, face modes.
 * Accepts noteOn messages with startTime; synthesizes in process() based on Sound Preset.
 * Message protocol: init, setMode, setSoundPreset, noteOn, releaseAll, releaseVoice
 */
class ArpEngineProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'sampleRate', defaultValue: 48000, minValue: 8000, maxValue: 192000, automationRate: 'k-rate' },
            { name: 'mode', defaultValue: 0, minValue: 0, maxValue: 2, automationRate: 'k-rate' }, // 0=node, 1=edge, 2=face
        ];
    }

    constructor() {
        super();

        this.baseTime = 0;
        this.frameCount = 0;
        this.mode = 0; // 0=node, 1=edge, 2=face

        // Voice slots: node=6, edge=7, face=12
        this.maxVoices = 12;
        this.voices = [];
        for (let i = 0; i < this.maxVoices; i++) {
            this.voices.push(this.createVoice());
        }

        this.noteQueue = [];
        this.soundPreset = null; // Injected via setSoundPreset, fallback to built-in
        this.port.onmessage = (e) => this.handleMessage(e.data);
    }

    createVoice() {
        return {
            active: false,
            frequency: 440,
            velocity: 0.5,
            phaseCarrier: 0,
            phaseMod: 0,
            envPhase: 0,      // 0=attack, 1=decay, 2=sustain, 3=release
            envLevel: 0,
            startSample: 0,
            durationSamples: 0,
            attackSamples: 0,
            decaySamples: 0,
            releaseSamples: 0,
        };
    }

    handleMessage(msg) {
        switch (msg.type) {
            case 'init':
                this.baseTime = msg.baseTime ?? 0;
                this.frameCount = 0;
                break;
            case 'setMode':
                this.mode = msg.mode ?? 0; // 'node'|0, 'edge'|1, 'face'|2
                if (typeof this.mode === 'string') {
                    this.mode = { node: 0, edge: 1, face: 2 }[this.mode] ?? 0;
                }
                break;
            case 'setSoundPreset':
                this.soundPreset = msg.preset ?? null; // ArpSoundPreset from main
                break;
            case 'noteOn':
                this.noteQueue.push(msg);
                break;
            case 'releaseAll':
                this.voices.forEach(v => {
                    if (v.active && v.envPhase < 3) v.envPhase = 3;
                });
                break;
            case 'releaseVoice':
                const idx = msg.slotIndex ?? 0;
                if (this.voices[idx]?.active) this.voices[idx].envPhase = 3;
                break;
        }
    }

    // Resolve preset: use injected soundPreset or fallback built-in
    getPreset(sampleRate) {
        const sr = sampleRate || 48000;
        const ms = (t) => Math.max(1, Math.round((t / 1000) * sr));
        if (this.soundPreset) {
            return {
                type: this.soundPreset.type || 'sine',
                harmonicity: this.soundPreset.harmonicity ?? 3.01,
                modulationIndex: this.soundPreset.modulationIndex ?? 12,
                attack: ms(this.soundPreset.attack ?? 15),
                decay: ms(this.soundPreset.decay ?? 400),
                sustain: this.soundPreset.sustain ?? 0.1,
                release: ms(this.soundPreset.release ?? 800),
                duration: this.soundPreset.duration ?? 0.125,
            };
        }
        // Fallback built-in (when preset not yet sent)
        if (this.mode === 0) {
            return { type: 'fm', harmonicity: 3.01, modulationIndex: 12, attack: ms(10), decay: ms(2000), sustain: 0.1, release: ms(2000), duration: 0.5 };
        }
        if (this.mode === 1) {
            return { type: 'sine', attack: ms(15), decay: ms(400), sustain: 0.1, release: ms(800), duration: 0.125 };
        }
        return { type: 'sine', attack: ms(20), decay: ms(300), sustain: 0.2, release: ms(600), duration: 0.5 };
    }

    processNoteQueue(sampleRate, currentSample) {
        while (this.noteQueue.length > 0) {
            const msg = this.noteQueue.shift();
            const startSample = Math.round((msg.startTime - this.baseTime) * sampleRate);
            const duration = msg.duration ?? this.getPreset(sampleRate).duration;
            const durationSamples = Math.round(duration * sampleRate);

            // Find free slot
            const maxSlots = this.mode === 0 ? 6 : this.mode === 1 ? 7 : 12;
            let slot = msg.slotIndex;
            if (slot == null || slot < 0 || slot >= maxSlots) {
                slot = this.voices.findIndex(v => !v.active || v.envPhase === 3);
                if (slot < 0) slot = 0;
                slot = Math.min(slot, maxSlots - 1);
            }

            const preset = this.getPreset(sampleRate);
            const voice = this.voices[slot];
            voice.active = true;
            voice.frequency = msg.frequency ?? 440;
            voice.velocity = msg.velocity ?? 0.5;
            voice.phaseCarrier = 0;
            voice.phaseMod = 0;
            voice.envPhase = 0;
            voice.startSample = startSample;
            voice.durationSamples = durationSamples;
            voice.attackSamples = preset.attack;
            voice.decaySamples = preset.decay;
            voice.releaseSamples = preset.release;
        }
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        if (!output?.[0]) return true;

        const sr = parameters.sampleRate?.[0] || 48000;
        const modeVal = parameters.mode?.[0];
        if (modeVal != null) this.mode = Math.round(modeVal);

        const blockStartSample = this.frameCount;
        this.frameCount += 128;

        const currentSample = this.baseTime * sr + blockStartSample;
        this.processNoteQueue(sr, currentSample);

        const left = output[0];
        const right = output[1] || output[0];
        left.fill(0);
        if (right !== left) right.fill(0);

        const preset = this.getPreset(sr);
        const twoPi = 2 * Math.PI;

        for (let v = 0; v < this.voices.length; v++) {
            const voice = this.voices[v];
            if (!voice.active) continue;

            const maxSlots = this.mode === 0 ? 6 : this.mode === 1 ? 7 : 12;
            if (v >= maxSlots) continue;

            const fc = voice.frequency;
            const vel = voice.velocity * 0.3;

            for (let i = 0; i < 128; i++) {
                const s = blockStartSample + i;
                const relS = s - voice.startSample;
                if (relS < 0) continue;

                // Envelope
                let env = 0;
                if (voice.envPhase === 0) {
                    env = relS < voice.attackSamples ? relS / voice.attackSamples : 1;
                    if (relS >= voice.attackSamples) voice.envPhase = 1;
                }
                if (voice.envPhase === 1) {
                    const decayProgress = (relS - voice.attackSamples) / voice.decaySamples;
                    env = 1 - decayProgress * (1 - preset.sustain);
                    if (decayProgress >= 1) voice.envPhase = 2;
                }
                if (voice.envPhase === 2) {
                    env = preset.sustain;
                    if (relS >= voice.durationSamples) voice.envPhase = 3;
                }
                if (voice.envPhase === 3) {
                    const releaseProgress = (relS - voice.durationSamples) / voice.releaseSamples;
                    env = preset.sustain * Math.max(0, 1 - releaseProgress);
                    if (releaseProgress >= 1) { voice.active = false; break; }
                }

                let sample = 0;
                if (preset.type === 'fm') {
                    const fm = fc * preset.harmonicity;
                    voice.phaseMod += (twoPi * fm) / sr;
                    if (voice.phaseMod > twoPi) voice.phaseMod -= twoPi;
                    const mod = Math.sin(voice.phaseMod) * preset.modulationIndex;
                    voice.phaseCarrier += (twoPi * fc) / sr;
                    if (voice.phaseCarrier > twoPi) voice.phaseCarrier -= twoPi;
                    sample = Math.sin(voice.phaseCarrier + mod);
                } else {
                    voice.phaseCarrier += (twoPi * fc) / sr;
                    if (voice.phaseCarrier > twoPi) voice.phaseCarrier -= twoPi;
                    sample = Math.sin(voice.phaseCarrier);
                }

                const out = sample * env * vel;
                left[i] += out;
                if (right !== left) right[i] += out;
            }
        }

        return true;
    }
}

registerProcessor('arp-engine-processor', ArpEngineProcessor);
