/**
 * WaveEffect - Worklet-based wave loop + reverb.
 * 큰 파도 / 작은 파도 두 버전을 확률적으로 선택해 연산 (main thread에서 intensity/filterFreq 전달).
 * Chain: WaveEffectWorklet → gain → reverb → destination.
 */
import * as Tone from 'tone';
import * as THREE from 'three';
import { createReverb } from './core/ReverbFactory';
import { WaveEffectWorklet } from './worklets/WaveEffectWorklet';

type WaveMode = 'major' | 'minor' | 'edge' | 'idle';

/** 큰 파도: 긴 주기, 긴 구간, 높은 강도/필터 */
const BIG_WAVE = { period: 6.0, duration: 2.2, intensityScale: 0.85, filterBase: 600, filterPeak: 2400 };
/** 작은 파도: 짧은 주기, 짧은 구간, 낮은 강도/필터 */
const SMALL_WAVE = { period: 3.0, duration: 0.9, intensityScale: 0.45, filterBase: 400, filterPeak: 1200 };

const BIG_WAVE_PROBABILITY = 0.3;

export class WaveEffect {
    private worklet: WaveEffectWorklet;
    private reverb: Tone.Reverb;
    private masterGain: Tone.Gain;

    private isDisposed = false;
    private mode: WaveMode = 'idle';
    private time = 0;
    private waveCycle = 0;
    private currentWave: typeof BIG_WAVE | typeof SMALL_WAVE = SMALL_WAVE;
    private waveDuration = SMALL_WAVE.duration;
    private wavePeriod = SMALL_WAVE.period;

    constructor() {
        this.worklet = new WaveEffectWorklet();
        this.reverb = createReverb('wave');
        this.masterGain = new Tone.Gain(1);

        this.worklet.output.connect(this.masterGain);
        this.masterGain.connect(this.reverb);
        this.reverb.toDestination();
    }

    start() {
        if (this.isDisposed) return;
        this.worklet.start();
        this.mode = 'idle';
    }

    setOutputGain(volume: number, rampTime: number = 0.1) {
        if (this.isDisposed) return;
        const now = Tone.now();
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
        this.masterGain.gain.rampTo(volume, rampTime, now);
    }

    update(delta: number, _centerPos: THREE.Vector3) {
        if (this.isDisposed || !this.worklet.isPlaying) return;

        this.time += delta;

        if (this.mode === 'idle') {
            this.waveCycle += delta;
            const cyclePos = this.waveCycle % this.wavePeriod;

            if (cyclePos < this.waveDuration) {
                const progress = cyclePos / this.waveDuration;
                let volCurve: number;
                if (progress < 0.3) {
                    volCurve = Math.pow(progress / 0.3, 1.5);
                } else {
                    volCurve = Math.pow(1 - (progress - 0.3) / 0.7, 1.5);
                }
                const intensity = volCurve * this.currentWave.intensityScale;
                const filterFreq = this.currentWave.filterBase + volCurve * (this.currentWave.filterPeak - this.currentWave.filterBase);
                this.worklet.update(intensity, filterFreq, Tone.now());
            } else {
                if (cyclePos - delta < this.waveDuration && cyclePos >= this.waveDuration) {
                    this.currentWave = Math.random() < BIG_WAVE_PROBABILITY ? BIG_WAVE : SMALL_WAVE;
                    this.waveDuration = this.currentWave.duration;
                    this.wavePeriod = this.currentWave.period;
                }
                this.worklet.update(0, this.currentWave.filterBase, Tone.now());
            }
        }
    }

    triggerTransition(toMode: 'face' | 'edge', isMajor?: boolean) {
        if (this.isDisposed) return;

        const now = Tone.now();
        this.mode = toMode === 'face' ? (isMajor ? 'major' : 'minor') : 'edge';

        this.reverb.wet.value = 0.9;
        this.worklet.update(0.6, isMajor ? 8000 : 400, now);

        const attackTime = 0.4;
        const releaseTime = 2.5;
        setTimeout(() => {
            if (this.isDisposed) return;
            this.mode = 'idle';
            this.reverb.wet.value = 0.7;
            this.worklet.update(0, 800, Tone.now());
        }, (attackTime + releaseTime) * 1000 + 100);
    }

    stop() {
        this.worklet.stop();
        this.masterGain.gain.value = 0;
    }

    dispose() {
        this.isDisposed = true;
        this.stop();
        this.worklet.dispose();
        this.reverb.dispose();
        this.masterGain.dispose();
    }
}
