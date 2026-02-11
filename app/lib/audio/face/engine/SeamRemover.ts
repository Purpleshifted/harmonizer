import * as Tone from 'tone';

export interface SeamRemovaleTarget {
    triggerAttack: (note: string, time: number, velocity?: number) => void;
    triggerRelease: (note: string, time: number) => void;
    loaded: boolean;
}

/**
 * SeamRemover handles seamless transitions between overlapping samples (Double Buffering)
 */
export class SeamRemover {
    private activeBuff: 'A' | 'B' = 'A';

    constructor(
        private samplerA: SeamRemovaleTarget,
        private samplerB: SeamRemovaleTarget
    ) { }

    /**
     * Crossfade between A and B buffers to maintain a continuous sound
     */
    public sustainOverlap(note: string, now: number, velocity: number = 0.6) {
        const prev = this.activeBuff === 'A' ? this.samplerA : this.samplerB;
        const next = this.activeBuff === 'A' ? this.samplerB : this.samplerA;
        this.activeBuff = this.activeBuff === 'A' ? 'B' : 'A';

        if (next.loaded) next.triggerAttack(note, now, velocity);
        if (prev.loaded) prev.triggerRelease(note, now);
    }

    public releaseAll(note: string, now: number) {
        this.samplerA.triggerRelease(note, now);
        this.samplerB.triggerRelease(note, now);
    }
}
