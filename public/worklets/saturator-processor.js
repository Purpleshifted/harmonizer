/**
 * SaturatorProcessor - A custom AudioWorklet for soft-clipping harmonic saturation.
 * 
 * Algorithm: f(x) = (3x - x^3) / 2
 * This is a classic cubic soft clipper that adds odd harmonics.
 */
class SaturatorProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            {
                name: 'drive',
                defaultValue: 1.0,
                minValue: 1.0,
                maxValue: 10.0,
                automationRate: 'k-rate'
            },
            {
                name: 'mix',
                defaultValue: 0.5,
                minValue: 0.0,
                maxValue: 1.0,
                automationRate: 'k-rate'
            }
        ];
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0];
        const output = outputs[0];
        const drive = parameters.drive[0];
        const mix = parameters.mix[0];

        for (let channel = 0; channel < input.length; channel++) {
            const inputChannel = input[channel];
            const outputChannel = output[channel];

            for (let i = 0; i < inputChannel.length; i++) {
                let x = inputChannel[i] * drive;

                // Safety check: Filter out NaN or Infinity that could crash the audio thread
                if (!isFinite(x)) x = 0;

                // Soft clipping function: (3x - x^3) / 2
                let saturated;
                if (x > 1) {
                    saturated = 1;
                } else if (x < -1) {
                    saturated = -1;
                } else {
                    saturated = (3 * x - x * x * x) / 2;
                }

                // Wet/Dry mix with master safety clamp
                const out = inputChannel[i] * (1 - mix) + saturated * mix;
                outputChannel[i] = Math.max(-1, Math.min(1, out));
            }
        }

        return true;
    }
}

registerProcessor('saturator-processor', SaturatorProcessor);
