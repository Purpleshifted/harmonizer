/**
 * Levels - Single source of truth for all mix/volume settings.
 * Mode-specific gains and scales. Applied by Dirigent from mix policy returned here.
 */

export interface MixLevels {
    /** Drone: multiplier applied to distance-based gain (e.g. 1.0 = normal, 1.4 = edge boost) */
    droneMultiplier: number;
    /** Face: master scale for orchestra (FaceEnsemble). < 1 = quieter */
    faceOrchestraScale: number;
    /** Face: scale for face arpeggiator. > 1 = louder */
    faceArpScale: number;
    /** Edge: arp master volume (0–1) and ramp time (sec) */
    edgeArpVolume: number;
    edgeArpRamp: number;
}

const LEVELS: Record<string, MixLevels> = {
    node: {
        droneMultiplier: 1.0,
        faceOrchestraScale: 1.0,
        faceArpScale: 1.0,
        edgeArpVolume: 0,
        edgeArpRamp: 0.3,
    },
    edge: {
        droneMultiplier: 2.5,
        faceOrchestraScale: 1.0,
        faceArpScale: 1.0,
        edgeArpVolume: 0.5,
        edgeArpRamp: 1.5,
    },
    face: {
        droneMultiplier: 1.0,
        faceOrchestraScale: 0.5,
        faceArpScale: 1.5,
        edgeArpVolume: 0,
        edgeArpRamp: 0.3,
    },
};

const DEFAULT_LEVELS: MixLevels = LEVELS.node;

export interface GetMixForModeOptions {
    /** When true and mode is edge: don't reduce Face volume (cruising) */
    cruising?: boolean;
}

/**
 * Get mix levels for a given target mode (e.g. 'node' | 'edge' | 'face').
 * Used by Orchestrator to pass policy into Dirigent.
 * When cruising && mode is edge: Face volume not reduced (use face-level faceOrchestraScale/faceArpScale).
 */
export function getMixForMode(targetMode: string, options?: GetMixForModeOptions): MixLevels {
    const normalized = (targetMode || '').toLowerCase();
    const base = LEVELS[normalized] ?? DEFAULT_LEVELS;
    if (options?.cruising && normalized === 'edge') {
        const faceLevels = LEVELS.face;
        return {
            ...base,
            faceOrchestraScale: faceLevels.faceOrchestraScale,
            faceArpScale: faceLevels.faceArpScale,
        };
    }
    return base;
}
