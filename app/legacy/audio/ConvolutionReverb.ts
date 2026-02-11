/**
 * Convolution Reverb wrapper using Tone.Convolver
 * 
 * For realistic space simulation using Impulse Response (IR) files.
 * 
 * Usage:
 *   const convReverb = new ConvolutionReverb();
 *   await convReverb.load('/ir/cathedral.wav');
 *   synth.connect(convReverb.input);
 *   convReverb.output.toDestination();
 */

import * as Tone from 'tone';

export class ConvolutionReverb {
    private convolver: Tone.Convolver;
    private dryGain: Tone.Gain;
    private wetGain: Tone.Gain;
    private inputGain: Tone.Gain;
    private outputGain: Tone.Gain;
    private isLoaded = false;

    constructor(wetAmount = 0.5) {
        this.convolver = new Tone.Convolver();

        // Dry/Wet mix
        this.inputGain = new Tone.Gain(1);
        this.dryGain = new Tone.Gain(1 - wetAmount);
        this.wetGain = new Tone.Gain(wetAmount);
        this.outputGain = new Tone.Gain(1);

        // Routing: input -> dry -> output
        //          input -> convolver -> wet -> output
        this.inputGain.connect(this.dryGain);
        this.inputGain.connect(this.convolver);
        this.convolver.connect(this.wetGain);
        this.dryGain.connect(this.outputGain);
        this.wetGain.connect(this.outputGain);
    }

    /**
     * Load an Impulse Response file
     * @param url Path to the IR file (e.g., '/ir/cathedral.wav')
     */
    async load(url: string, cachedBuffer?: Tone.ToneAudioBuffer): Promise<void> {
        try {
            if (cachedBuffer) {
                // Instant load
                this.convolver.buffer = cachedBuffer;
                this.isLoaded = true;
                // console.log(`[ConvolutionReverb] Used cached IR: ${url}`);
                return;
            }

            // Fallback
            await this.convolver.load(url);
            this.isLoaded = true;
            console.log(`[ConvolutionReverb] Loaded IR: ${url}`);
        } catch (error) {
            console.error(`[ConvolutionReverb] Failed to load IR: ${url}`, error);
            throw error;
        }
    }

    /**
     * Set the wet/dry mix (0 = fully dry, 1 = fully wet)
     */
    setWet(amount: number): void {
        this.wetGain.gain.value = amount;
        this.dryGain.gain.value = 1 - amount;
    }

    /**
     * Get the input node to connect sources to
     */
    get input(): Tone.Gain {
        return this.inputGain;
    }

    /**
     * Get the output node to connect to destination
     */
    get output(): Tone.Gain {
        return this.outputGain;
    }

    /**
     * Check if IR is loaded
     */
    get loaded(): boolean {
        return this.isLoaded;
    }

    dispose(): void {
        this.convolver.dispose();
        this.dryGain.dispose();
        this.wetGain.dispose();
        this.inputGain.dispose();
        this.outputGain.dispose();
    }
}

/**
 * Available IR presets (place files in /public/ir/)
 * 
 * Recommended free IR sources:
 * - OpenAir: https://www.openair.hosted.york.ac.uk/
 * - EchoThief: http://www.echothief.com/
 * - Voxengo: https://www.voxengo.com/impulses/
 */
export const IR_PRESETS = {
    // Add your IR files here after downloading
    // cathedral: '/ir/cathedral.wav',
    // cave: '/ir/cave.wav',
    // hall: '/ir/hall.wav',
    // plate: '/ir/plate.wav',
} as const;
