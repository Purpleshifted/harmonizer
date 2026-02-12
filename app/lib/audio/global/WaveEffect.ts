/**
 * WaveEffect - Creates a rotating natural water wave effect
 * 
 * Logic:
 * - Uses a natural waterfall sample for realism.
 * - Pulse envelope with a "floor" bias to prevent silence.
 * - Intermittent HRTF rotation: moves during pulse, static during pause.
 * - Chain: Player -> Filter -> PulseGain (Envelope) -> Reverb -> Panner -> MasterGain
 */

import * as Tone from 'tone';
import * as THREE from 'three';
import { createSpatialPanner, updatePannerPosition } from '../core/SpatialAudio';
import { AudioConfig } from '../core/AudioConfig';
import { AudioPorts, MatrixPlayer } from '../core/Buses';

export class WaveEffect implements MatrixPlayer {
    public readonly ports: AudioPorts;
    private player: Tone.Player;
    private filter: Tone.Filter;
    private pulseGain: Tone.Gain;  // The actual envelope (internal pulse)
    private panner: Tone.Panner3D;
    private masterGain: Tone.Gain; // Global layer volume (external control)
    private waveGain: Tone.Gain; // Reverb send volume (lush WaveBus)

    // Pre-allocated objects for GC optimization
    private readonly targetPos = new THREE.Vector3();

    // State
    private isPlaying = false;
    private isDisposed = false;

    // Wave pulse variables
    private time = 0;
    private waveCycle = 0;
    private lastWaveIndex = -1;
    private currentWaveIsWeak = false;
    private lastUpdateTime = 0;
    private readonly UPDATE_THROTTLE_MS = 33; // ~30fps is enough for spatial movement

    private readonly WAVE_PERIOD = 10.48; // User preferred slower period
    private readonly WAVE_DURATION = 4.0;  // Longer push for slower period
    private readonly BASE_VOLUME = 0.25;

    // Sample path
    private readonly SAMPLE_PATH = '/samples/wave/843316__loredenii__stereo-waterfall-recording-natural-audio-for-audiovisual-productions.wav';

    constructor() {
        // Natural water sample
        this.player = new Tone.Player({
            url: this.SAMPLE_PATH,
            loop: true,
            autostart: false,
            fadeIn: 1,
            fadeOut: 1,
            volume: 8,
            onload: () => console.log('[WaveEffect] Waterfall sample loaded successfully.'),
            onerror: (e) => console.error('[WaveEffect] Failed to load waterfall sample:', e)
        });

        // Soft smoothing filter
        this.filter = new Tone.Filter({
            type: 'lowpass',
            frequency: 1000,
            Q: 0.5
        });

        // Pulse Gain (Envelope control)
        this.pulseGain = new Tone.Gain(this.BASE_VOLUME);

        // Equalpower spatial positioning (Lighter than HRTF for background)
        this.panner = createSpatialPanner({
            distanceModel: 'exponential',
            refDistance: 6,
            maxDistance: 80,
            rolloffFactor: 0.7,
            useHRTF: true, // Restored as per user request
        });

        // Destination gain (controlled via setVolume by GlobalPlayer/AudioController)
        this.masterGain = new Tone.Gain(0);
        this.waveGain = new Tone.Gain(AudioConfig.mix.wave.reverbSend);

        this.ports = {
            main: this.masterGain,
            wave: this.waveGain
        };

        // Chain: Player -> Filter -> PulseGain -> Panner -> MasterGains
        this.player.connect(this.filter);
        this.filter.connect(this.pulseGain);
        this.pulseGain.connect(this.panner);
        this.panner.connect(this.masterGain);
        this.panner.connect(this.waveGain);
    }

    public start() {
        if (this.isDisposed || this.isPlaying) return;

        console.log('[WaveEffect] Starting playback...');

        // Defensive check: only start if buffer is ready
        if (this.player.buffer && this.player.buffer.loaded) {
            this.player.start();
            this.isPlaying = true;
        } else {
            console.warn('[WaveEffect] Buffer not loaded yet, setting autostart=true');
            this.player.autostart = true;
            this.isPlaying = true;
        }
    }

    /**
     * Update loop for rotating wave simulation
     */
    public update(delta: number, centerPos: THREE.Vector3) {
        if (!this.isPlaying || this.isDisposed) return;

        // PERFORMANCE THROTTLE: Limit updates to ~30fps for spatial/parameter changes
        const realTime = performance.now();
        if (realTime - this.lastUpdateTime < this.UPDATE_THROTTLE_MS) return;
        this.lastUpdateTime = realTime;

        this.time += delta;
        this.waveCycle += delta;

        const cyclePos = this.waveCycle % this.WAVE_PERIOD;
        const waveIndex = Math.floor(this.waveCycle / this.WAVE_PERIOD);
        const now = Tone.now();

        if (waveIndex !== this.lastWaveIndex) {
            this.lastWaveIndex = waveIndex;
            // 1:9 ratio for weak vs strong waves (Math.random() < 0.1)
            this.currentWaveIsWeak = Math.random() < 0.1;
        }

        // Target state variables
        let intensity = this.BASE_VOLUME;
        let radius = 36; // Back to user's receded value
        let filterFreq = 1000;

        // Progress within the ACTIVE pulse (0 to 1 over WAVE_DURATION)
        if (cyclePos < this.WAVE_DURATION) {
            const progress = cyclePos / this.WAVE_DURATION;
            // Smooth curve: sin^2 (sin squared) for a gentler start and end than raw sin
            const curve = Math.pow(Math.sin(progress * Math.PI), 1.5);

            // Strong Wave params
            let peakMultiplier = 3.5;
            let radiusApproach = 18; // Hits 18 units at peak (36 - 18)
            let brightnessPeak = 4000;

            // Weak Wave params (Smaller, gentler ripple)
            if (this.currentWaveIsWeak) {
                peakMultiplier = 1.2;
                radiusApproach = 8; // Only approaches slightly
                brightnessPeak = 800; // Less bright
            }

            // 2. Continuous Rotation (Full 360 over the entire period)
            const angle = (this.waveCycle / this.WAVE_PERIOD) * Math.PI * 2;

            // 3. Approach & Recede
            radius = 36 - (curve * radiusApproach);
            intensity = this.BASE_VOLUME + (curve * peakMultiplier);
            filterFreq = 1000 + (curve * brightnessPeak);

            // Apply Position
            this.targetPos.set(
                centerPos.x + Math.cos(angle) * radius,
                centerPos.y + 1.2,
                centerPos.z + Math.sin(angle) * radius
            );
            updatePannerPosition(this.panner, this.targetPos, 0.1);
        } else {
            // 4. Pause Logic (Continuous rotation still applies for consistent spatiality)
            const angle = (this.waveCycle / this.WAVE_PERIOD) * Math.PI * 2;

            this.targetPos.set(
                centerPos.x + Math.cos(angle) * 36,
                centerPos.y + 1.2,
                centerPos.z + Math.sin(angle) * 36
            );
            updatePannerPosition(this.panner, this.targetPos, 0.5);

            intensity = this.BASE_VOLUME * 0.8;
            filterFreq = 800;
        }

        // Apply Envelope and Tone Shaping
        // Using exponentialRampToValueAtTime or setTargetAtTime with a consistent constant
        this.pulseGain.gain.setTargetAtTime(intensity, now, 0.1);
        this.filter.frequency.setTargetAtTime(filterFreq, now, 0.1);
    }

    public setVolume(volume: number, rampTime: number = 0.5, time: number) {
        if (this.isDisposed) return;

        // Avoid redundant ramps if volume hasn't changed much
        if (Math.abs(this.masterGain.gain.value - volume) < 0.001) return;

        this.masterGain.gain.rampTo(volume, rampTime, time);

        if (volume > 0.001) {
            if (!this.isPlaying) this.start();
        } else if (volume === 0) {
            setTimeout(() => {
                if (this.masterGain.gain.value < 0.01) {
                    this.stop();
                }
            }, rampTime * 1000 + 100);
        }
    }

    public stop() {
        if (!this.isPlaying) return;
        console.log('[WaveEffect] Stopping playback.');
        this.player.stop();
        this.pulseGain.gain.value = this.BASE_VOLUME;
        this.isPlaying = false;
    }

    public dispose() {
        this.isDisposed = true;
        this.stop();
        this.player.dispose();
        this.filter.dispose();
        this.pulseGain.dispose();
        this.panner.dispose();
        this.masterGain.dispose();
        this.waveGain.dispose();
    }
}
