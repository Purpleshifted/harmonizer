import * as Tone from 'tone';
import * as THREE from 'three';
import { ArpeggiatorPlayer } from '../edge/ArpeggiatorPlayer';

export class EdgePlayer {
    private arpeggiator: ArpeggiatorPlayer;
    private isAudible = false;
    private isDisposed = false;

    constructor(spatialReverb: Tone.Reverb, deepReverb: Tone.Reverb) {
        this.arpeggiator = new ArpeggiatorPlayer(spatialReverb, deepReverb);
    }

    public update(detection: any, structureChanged: boolean, arpVol: number) {
        if (this.isDisposed || !this.isAudible) return;

        if (detection.activeEdge && structureChanged) {
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
        }

        if (detection.activeEdge) {
            this.arpeggiator.updatePositions(
                detection.activeEdge.pos1,
                detection.activeEdge.pos2,
                detection.nearestNeighbors.map((n: any) => n.pos)
            );
        }
    }

    public setVolume(volume: number, rampTime: number = 0.1) {
        if (this.isDisposed) return;

        this.arpeggiator.setGlobalVolume(volume, rampTime);

        if (volume > 0.001) {
            this.isAudible = true;
        } else {
            this.isAudible = false;
            // Auto-Stop engine after fade
            setTimeout(() => {
                if (!this.isAudible && !this.isDisposed) {
                    this.arpeggiator.stop();
                }
            }, rampTime * 1000 + 100);
        }
    }

    public dispose() {
        this.isDisposed = true;
        this.arpeggiator.dispose();
    }
}
