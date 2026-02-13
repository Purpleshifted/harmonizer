/**
 * Ambient drone audio - 4 nearest notes with spatial positioning
 * Optimized to prevent polyphony overflow by using continuous oscillators
 * instead of retriggering synths on every note change.
 */

import * as Tone from 'tone';
import * as THREE from 'three';
import { noteToFreq, ensureOctave } from '../../../../app/lib/audio/utils/NoteUtils';
import { createSpatialPanner, updatePannerPosition, updateListener } from '../../../../app/lib/audio/utils/SpatialAudio';
import { AudioConfig } from '../core/AudioConfig';
import { AudioPorts, MatrixPlayer } from '../core/Buses';
import { HarmonicSaturator } from '../../../../app/lib/audio/worklets/HarmonicSaturator';

interface NoteVoice {
    oscillator: Tone.Oscillator;
    panner: Tone.Panner3D;
    gain: Tone.Gain;
    currentNote: string | null;
    currentFreq: number;
    isPlaying: boolean;
}

export class AmbientDrone implements MatrixPlayer {
    public readonly ports: AudioPorts;
    private voices: NoteVoice[] = [];
    private dryGain: Tone.Gain;
    private sendGain: Tone.Gain;
    private masterGain: Tone.Gain;
    private saturator: HarmonicSaturator;
    private limiter: Tone.Limiter;
    private isDisposed = false;
    private isStarted = false;
    private lastUpdateTime = 0;
    private updateThrottleMs = 50;

    constructor() {
        this.masterGain = new Tone.Gain(0.2);
        this.saturator = new HarmonicSaturator();
        this.saturator.drive = 1.5;
        this.saturator.mix = 0.4;

        this.limiter = new Tone.Limiter(-3);

        // Setup outputs
        this.dryGain = new Tone.Gain(1.0);
        this.sendGain = new Tone.Gain(1.0);

        this.ports = {
            main: this.dryGain,
            ambient: this.sendGain
        };

        // Internal routing
        this.masterGain.connect(this.saturator);
        this.saturator.connect(this.limiter);
        this.limiter.connect(this.dryGain);
        this.limiter.connect(this.sendGain);

        // Mix ratios for ports (send levels)
        const reverbSend = AudioConfig.mix.drone.reverbSend;
        this.dryGain.gain.value = 1 - reverbSend;
        this.sendGain.gain.value = reverbSend;

        // Create 4 voices using continuous oscillators
        for (let i = 0; i < 4; i++) {
            const gain = new Tone.Gain(0);
            const panner = createSpatialPanner({
                refDistance: 3,
                maxDistance: 40,
                rolloffFactor: 0.8,
            });

            const oscillator = new Tone.Oscillator({
                type: 'sine',
                frequency: 440,
            });

            oscillator.connect(panner);
            panner.connect(gain);
            gain.connect(this.masterGain);

            this.voices.push({
                oscillator,
                panner,
                gain,
                currentNote: null,
                currentFreq: 440,
                isPlaying: false,
            });
        }
    }

    /**
     * Update listener position (player's position)
     */
    updateListenerPosition(position: THREE.Vector3, forward: THREE.Vector3) {
        if (this.isDisposed) return;
        updateListener(position, forward);
    }

    /**
     * Update the 4 nearest notes with their positions and distances
     * Throttled to prevent excessive updates
     */
    updateNotes(
        notes: Array<{
            name: string;
            value: number;
            position: THREE.Vector3;
            distance: number;
        }>,
        time: number
    ) {
        if (this.isDisposed || !this.isStarted) return;

        // Throttle updates
        const now = performance.now();
        if (now - this.lastUpdateTime < this.updateThrottleMs) return;
        this.lastUpdateTime = now;

        notes.forEach((note, i) => {
            if (i >= this.voices.length) return;

            const voice = this.voices[i];
            const noteName = ensureOctave(note.name, 4);
            const targetFreq = noteToFreq(noteName);

            // Update panner position smoothly
            updatePannerPosition(voice.panner, note.position, 0.1);

            // Calculate gain based on distance and position (1-2 louder, 3-4 quieter)
            const positionMultiplier = i < 2 ? 1.0 : 0.35;
            const distanceGain = Math.max(0, 1 - note.distance / 25);
            const targetGain = distanceGain * positionMultiplier * 0.10;

            // Smooth gain transition
            voice.gain.gain.rampTo(targetGain, 0.2, time);

            // Smoothly transition frequency instead of retriggering
            if (voice.currentNote !== noteName) {
                voice.currentNote = noteName;
                voice.oscillator.frequency.rampTo(targetFreq, 0.15, time);
                voice.currentFreq = targetFreq;
            }
        });
    }

    /**
     * Set global volume of the drone layer
     */
    setVolume(volume: number, rampTime: number = 0.5, time: number) {
        if (this.isDisposed) return;
        this.masterGain.gain.rampTo(volume, rampTime, time);
    }

    /**
     * Start all voices (call after audio context is ready)
     */
    start() {
        if (this.isDisposed || this.isStarted) return;
        this.isStarted = true;

        this.voices.forEach((voice) => {
            if (!voice.isPlaying) {
                voice.oscillator.start();
                voice.isPlaying = true;
            }
        });
    }

    /**
     * Stop all voices
     */
    stop() {
        if (this.isDisposed) return;

        this.voices.forEach((voice) => {
            voice.oscillator.stop();
            voice.isPlaying = false;
        });
        this.isStarted = false;
    }

    /**
     * Focus on a specific note - boosts that note's gain while slightly reducing others
     * @param noteName The note to focus on (e.g., 'C')
     * @param focusIntensity How much to boost (0-1), default 0.7
     */
    focusOnNote(noteName: string, focusIntensity: number = 0.7, time: number) {
        if (this.isDisposed || !this.isStarted) return;

        const now = Tone.now();
        let foundFocusNote = false;

        this.voices.forEach((voice, i) => {
            if (voice.currentNote?.startsWith(noteName)) {
                const boostGain = 0.25 + focusIntensity * 0.2;
                voice.gain.gain.rampTo(boostGain, 0.3, time);
                foundFocusNote = true;
            } else {
                const positionMultiplier = i < 2 ? 0.6 : 0.25;
                const reducedGain = positionMultiplier * 0.1 * (1 - focusIntensity * 0.3);
                voice.gain.gain.rampTo(reducedGain, 0.3, time);
            }
        });

        if (!foundFocusNote) {
            this.masterGain.gain.rampTo(0.25, 0.3, time);
        }
    }

    /**
     * Clear focus - return to normal gain distribution
     */
    clearFocus(time: number) {
        if (this.isDisposed || !this.isStarted) return;

        const now = Tone.now();
        this.masterGain.gain.rampTo(0.2, 0.3, time);
    }

    /**
     * Dispose of all resources
     */
    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;

        this.voices.forEach((voice) => {
            if (voice.isPlaying) {
                voice.oscillator.stop();
            }
            voice.oscillator.dispose();
            voice.panner.dispose();
            voice.gain.dispose();
        });

        // Shared reverb - do not dispose
        this.dryGain.dispose();
        this.sendGain.dispose();
        this.masterGain.dispose();
        this.saturator.dispose();
        this.limiter.dispose();
        this.voices = [];
    }
}
