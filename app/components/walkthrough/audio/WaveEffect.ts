/**
 * WaveEffect - Creates a rotating pink noise wave and transition effects
 * 
 * Modes:
 * - Idle: Rotating wave every 4 seconds (sharp attack, slow decay)
 * - Major transition: High-pass sweep up (bright fade out)
 * - Minor transition: Low-pass sweep down (dark fade out)
 * - Edge transition: Band-pass converge
 * 
 * Uses Convolution Reverb (IR) for realistic space simulation.
 */

import * as Tone from 'tone';
import * as THREE from 'three';
import { createSpatialPanner } from './core/SpatialAudio';
import { ConvolutionReverb } from './core/ConvolutionReverb';

type WaveMode = 'major' | 'minor' | 'edge' | 'idle';

export class WaveEffect {
    private noise: Tone.Noise;
    private filter: Tone.Filter;
    private panner: Tone.Panner3D;
    private gain: Tone.Gain;
    private convReverb: ConvolutionReverb;
    private autoFilter: Tone.AutoFilter;

    // State
    private isPlaying = false;
    private isDisposed = false;
    private isReverbLoaded = false;
    private mode: WaveMode = 'idle';

    // Wave pulse variables
    private time = 0;
    private waveCycle = 0;
    private readonly WAVE_PERIOD = 6.0;   // Longer cycle for distant feel
    private readonly WAVE_DURATION = 2.0; // Extended duration

    // IR file path
    private readonly IR_PATH = '/ir/1st-baptist-nashville/stereo/1st_baptist_nashville_far_wide.wav';

    constructor() {
        // Pink noise source for "wave" sound
        this.noise = new Tone.Noise('pink');

        // Main shaping filter
        this.filter = new Tone.Filter({
            type: 'lowpass',
            frequency: 800,
            Q: 1
        });

        // Flanger-like movement
        this.autoFilter = new Tone.AutoFilter({
            frequency: 1,
            baseFrequency: 200,
            octaves: 2.6
        }).start();

        // Spatial positioning (lighter CPU with equalpower)
        this.panner = createSpatialPanner({
            distanceModel: 'linear',
            refDistance: 1,
            maxDistance: 20,
            useHRTF: false, // Reduce CPU load
        });

        // Convolution Reverb for realistic space (IR-based)
        this.convReverb = new ConvolutionReverb(0.7);

        this.gain = new Tone.Gain(0);

        // Chain: Noise -> Filter -> AutoFilter -> Panner -> Gain -> ConvReverb -> Destination
        this.noise.connect(this.filter);
        this.filter.connect(this.autoFilter);
        this.autoFilter.connect(this.panner);
        this.panner.connect(this.gain);
        this.gain.connect(this.convReverb.input);
        this.convReverb.output.toDestination();

        // Load IR asynchronously
        this.loadIR();
    }

    private async loadIR() {
        try {
            await this.convReverb.load(this.IR_PATH);
            this.isReverbLoaded = true;
            console.log('[WaveEffect] IR loaded successfully');
        } catch (error) {
            console.warn('[WaveEffect] IR load failed, using dry signal:', error);
            // Fallback: connect gain directly to destination
            this.gain.disconnect();
            this.gain.toDestination();
        }
    }

    start() {
        if (this.isDisposed || this.isPlaying) return;
        this.noise.start();
        this.isPlaying = true;
        this.mode = 'idle';
    }

    /**
     * Update loop for wave simulation
     */
    update(delta: number, centerPos: THREE.Vector3) {
        if (!this.isPlaying || this.isDisposed) return;

        this.time += delta;

        // Idle mode: Rotating wave effect
        if (this.mode === 'idle') {
            this.waveCycle += delta;

            const cyclePos = this.waveCycle % this.WAVE_PERIOD;

            if (cyclePos < this.WAVE_DURATION) {
                const progress = cyclePos / this.WAVE_DURATION;

                // Smoother asymmetric curve: Slower attack (30%), gradual decay (70%)
                let volCurve: number;
                if (progress < 0.3) {
                    // Slower attack (30% duration)
                    volCurve = Math.pow(progress / 0.3, 1.5); // Ease-in curve
                } else {
                    // Gradual decay (70% duration) - Softer exponential
                    volCurve = Math.pow(1 - (progress - 0.3) / 0.7, 1.5);
                }

                // Optimized: set panner once, use setTargetAtTime for smooth volume/filter
                const volume = volCurve * 0.8;
                const now = Tone.now();
                this.gain.gain.setTargetAtTime(volume, now, 0.1);

                const angle = progress * Math.PI * 2;
                const radius = 5;
                this.panner.positionX.value = centerPos.x + Math.cos(angle) * radius;
                this.panner.positionZ.value = centerPos.z + Math.sin(angle) * radius;
                this.panner.positionY.value = centerPos.y;

                const targetFreq = 400 + volCurve * 2000;
                this.filter.frequency.setTargetAtTime(targetFreq, now, 0.1);
            } else {
                this.gain.gain.setTargetAtTime(0, Tone.now(), 0.5);
            }
        }
    }

    /**
     * Trigger transition effect when leaving Node mode
     */
    triggerTransition(toMode: 'face' | 'edge', isMajor?: boolean) {
        if (!this.isPlaying) return;

        const now = Tone.now();
        this.mode = toMode === 'face' ? (isMajor ? 'major' : 'minor') : 'edge';

        // Swell envelope: Attack -> Release (Crash effect)
        const attackTime = 0.4;
        const releaseTime = 2.5;

        // 1. Swell up (Attack)
        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(this.gain.gain.value, now);
        this.gain.gain.linearRampTo(0.6, attackTime, now);

        // 2. Fade out (Release)
        this.gain.gain.exponentialRampTo(0.001, releaseTime, now + attackTime);

        // Boost reverb wetness for transition
        if (this.isReverbLoaded) {
            this.convReverb.setWet(0.9);
        }

        if (this.mode === 'major') {
            // Bright high-pass sweep
            this.filter.type = 'highpass';
            this.filter.frequency.setValueAtTime(400, now);
            this.filter.frequency.exponentialRampTo(8000, attackTime + releaseTime * 0.5, now);
            this.autoFilter.frequency.rampTo(8, attackTime);
        } else if (this.mode === 'minor') {
            // Dark low-pass sweep
            this.filter.type = 'lowpass';
            this.filter.frequency.setValueAtTime(2000, now);
            this.filter.frequency.exponentialRampTo(50, attackTime + releaseTime, now);
        } else { // Edge
            // Band-pass converge
            this.filter.type = 'bandpass';
            this.filter.Q.value = 5;
            this.filter.frequency.rampTo(440, attackTime + releaseTime * 0.5, now);
        }

        // Reset to idle after transition
        setTimeout(() => {
            if (this.isDisposed) return;
            this.mode = 'idle';
            this.filter.type = 'lowpass';
            this.filter.frequency.value = 800;
            this.filter.Q.value = 1;
            if (this.isReverbLoaded) {
                this.convReverb.setWet(0.7);
            }
            this.gain.gain.value = 0;
        }, (attackTime + releaseTime) * 1000 + 100);
    }

    stop() {
        if (!this.isPlaying) return;
        this.noise.stop();
        this.gain.gain.value = 0;
        this.isPlaying = false;
    }

    dispose() {
        this.isDisposed = true;
        this.stop();
        this.noise.dispose();
        this.filter.dispose();
        this.autoFilter.dispose();
        this.panner.dispose();
        this.convReverb.dispose();
        this.gain.dispose();
    }
}
