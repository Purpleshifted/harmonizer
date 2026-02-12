import * as Tone from 'tone';
import { ArpeggiatorPlayer } from '../edge/ArpeggiatorPlayer';
import { AudioConfig } from '../core/AudioConfig';
import { AudioPorts, MatrixPlayer } from '../core/Buses';

export class EdgePlayer implements MatrixPlayer {
    public readonly ports: AudioPorts;
    private arpeggiator: ArpeggiatorPlayer;
    private isAudible = false;
    private isDisposed = false;

    constructor() {
        this.arpeggiator = new ArpeggiatorPlayer();
        this.ports = this.arpeggiator.ports;
    }

    private stopTimeoutId: number | null = null;

    public update(detection: any, structureChanged: boolean, _arpVol: number, time: number) {
        if (this.isDisposed || !this.isAudible) return;

        // Robust Enforcement: Always attempt to start/update if active edge exists
        if (detection.activeEdge) {
            const { note1, note2, pos1, pos2, distance1, distance2, midpoint } = detection.activeEdge;
            this.arpeggiator.startArpeggio(
                note1.name,
                note2.name,
                pos1,
                pos2,
                distance1,
                distance2,
                midpoint,
                detection.nearestNeighbors,
                time
            );
        }
    }

    public setVolume(volume: number, rampTime: number = 0.1, time: number) {
        if (this.isDisposed) return;
        const profile = AudioConfig.transitions.edge;

        // Apply specific EDGE master transition time if fading out
        const effectiveRamp = volume < 0.01 ? profile.master : rampTime;
        this.arpeggiator.setGlobalVolume(volume, effectiveRamp, time);

        if (volume > 0.001) {
            this.isAudible = true;
            if (this.stopTimeoutId !== null) {
                Tone.getContext().clearTimeout(this.stopTimeoutId);
                this.stopTimeoutId = null;
            }
        } else {
            this.isAudible = false;
            // Auto-Stop engine after fade
            if (this.stopTimeoutId !== null) Tone.getContext().clearTimeout(this.stopTimeoutId);
            this.stopTimeoutId = Tone.getContext().setTimeout(() => {
                if (!this.isAudible && !this.isDisposed) {
                    this.arpeggiator.stop();
                }
            }, effectiveRamp + 0.2); // Context timeout uses seconds
        }
    }

    public triggerExit(time: number) {
        if (this.isDisposed) return;
        // Optional: Add specific exit sound for Edge mode
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.arpeggiator.dispose();
    }
}
