import * as Tone from 'tone';
import { ArpeggiatorPlayer } from '../edge/ArpeggiatorPlayer';

export class EdgePlayer {
    private arpeggiator: ArpeggiatorPlayer;
    private isAudible = false;
    private isDisposed = false;

    constructor(spatialReverb: Tone.Reverb, deepReverb: Tone.Reverb) {
        this.arpeggiator = new ArpeggiatorPlayer(spatialReverb, deepReverb);
    }

    private stopTimeout: NodeJS.Timeout | null = null;

    public update(detection: any, structureChanged: boolean, _arpVol: number) {
        if (this.isDisposed || !this.isAudible) return;

        // Robust Enforcement: Always attempt to start/update if active edge exists
        // ArpeggiatorPlayer handles idempotency internally
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
                detection.nearestNeighbors.map((n: any) => n.note.name),
                detection.nearestNeighbors.map((n: any) => n.pos)
            );

            // Redundant positional update for safety (Arpeggiator updatePositions is called inside startArpeggio too if key matches)
            // But we can rely on startArpeggio now.
        }
    }

    public setVolume(volume: number, rampTime: number = 0.1) {
        if (this.isDisposed) return;

        this.arpeggiator.setGlobalVolume(volume, rampTime);

        if (volume > 0.001) {
            this.isAudible = true;
            if (this.stopTimeout) {
                clearTimeout(this.stopTimeout);
                this.stopTimeout = null;
            }
        } else {
            this.isAudible = false;
            // Auto-Stop engine after fade
            if (this.stopTimeout) clearTimeout(this.stopTimeout);
            this.stopTimeout = setTimeout(() => {
                if (!this.isAudible && !this.isDisposed) {
                    this.arpeggiator.stop();
                }
            }, rampTime * 1000 + 200);
        }
    }

    public triggerExit() {
        if (this.isDisposed) return;
        // Optional: Add specific exit sound for Edge mode
    }

    public dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        this.arpeggiator.dispose();
    }
}
