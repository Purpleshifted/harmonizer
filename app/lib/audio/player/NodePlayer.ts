import * as Tone from 'tone';
import { NodeFocusPad } from '../node/NodeFocusPad';

export class NodePlayer {
    private focusPad: NodeFocusPad;
    private isAudible = false;
    private isDisposed = false;

    constructor(deepReverb: Tone.Reverb) {
        this.focusPad = new NodeFocusPad(deepReverb);
    }

    public update(detection: any, structureChanged: boolean, padVol: number) {
        if (this.isDisposed || !this.isAudible) return;

        if (detection.mode === 'node' && detection.activeNodes.length > 0 && structureChanged) {
            this.focusPad.start(detection.activeNodes[0].note.name);
        }
    }

    public setVolume(volume: number, rampTime: number = 0.1) {
        if (this.isDisposed) return;

        this.focusPad.setGlobalVolume(volume, rampTime);

        if (volume > 0.001) {
            this.isAudible = true;
        } else {
            this.isAudible = false;
            // Auto-Stop engine after fade
            setTimeout(() => {
                if (!this.isAudible && !this.isDisposed) {
                    this.focusPad.stop();
                }
            }, rampTime * 1000 + 100);
        }
    }

    public triggerExit() {
        if (this.isDisposed) return;
        this.focusPad.triggerExitEffect();
    }

    public dispose() {
        this.isDisposed = true;
        this.focusPad.dispose();
    }
}
