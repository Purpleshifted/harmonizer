/**
 * WaveEffectProcessor - Loop player + lowpass filter + gain on audio thread.
 * Replaces Tone.Player + Tone.Filter + Tone.Gain for WaveRevolver.
 * Message protocol: buffer, start, stop
 * AudioParams: intensity (gain), filterFreq
 */
class WaveEffectProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'intensity', defaultValue: 0.1, minValue: 0, maxValue: 2, automationRate: 'a-rate' },
            { name: 'filterFreq', defaultValue: 800, minValue: 20, maxValue: 20000, automationRate: 'a-rate' },
        ];
    }

    constructor() {
        super();
        this.channel0 = null;
        this.channel1 = null;
        this.bufferLength = 0;
        this.sampleRate = 48000;
        this.readIndex = 0;
        this.playing = false;
        this.lpStateL = 0;
        this.lpStateR = 0;
        this.port.onmessage = (e) => this.handleMessage(e.data);
    }

    handleMessage(msg) {
        switch (msg.type) {
            case 'buffer':
                this.channel0 = msg.channel0 ?? null;
                this.channel1 = msg.channel1 ?? msg.channel0 ?? null;
                this.bufferLength = msg.length ?? (this.channel0?.length ?? 0);
                this.sampleRate = msg.sampleRate ?? sampleRate;
                this.readIndex = 0;
                break;
            case 'start':
                this.playing = true;
                this.readIndex = 0;
                break;
            case 'stop':
                this.playing = false;
                break;
        }
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0];
        if (!output?.[0] || !this.playing || !this.channel0 || this.bufferLength === 0) {
            return true;
        }

        const left = output[0];
        const right = output[1] ?? output[0];
        const intensityParam = parameters.intensity;
        const filterParam = parameters.filterFreq;
        const sr = sampleRate;

        for (let i = 0; i < 128; i++) {
            const intensity = intensityParam.length > 1 ? intensityParam[i] : intensityParam[0];
            const fc = filterParam.length > 1 ? filterParam[i] : filterParam[0];
            const alpha = Math.min(1, 1 - Math.exp(-2 * Math.PI * fc / sr));

            const idx = Math.floor(this.readIndex);
            const frac = this.readIndex - idx;
            const idx1 = (idx + 1) % this.bufferLength;
            const idx2 = idx % this.bufferLength;

            let sL = this.channel0[idx2] * (1 - frac) + this.channel0[idx1] * frac;
            let sR = this.channel1 ? (this.channel1[idx2] * (1 - frac) + this.channel1[idx1] * frac) : sL;

            this.lpStateL += alpha * (sL - this.lpStateL);
            this.lpStateR += alpha * (sR - this.lpStateR);

            const out = intensity;
            left[i] = this.lpStateL * out;
            right[i] = this.lpStateR * out;

            this.readIndex += this.sampleRate / sr;
            if (this.readIndex >= this.bufferLength) this.readIndex -= this.bufferLength;
            if (this.readIndex < 0) this.readIndex += this.bufferLength;
        }

        return true;
    }
}

registerProcessor('wave-effect-processor', WaveEffectProcessor);
