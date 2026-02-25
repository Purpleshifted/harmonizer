/**
 * ArpModeLogicPresets - Mode-specific appearance frequency and tempo for the Arp Engine.
 * Maps to diagram: Mode Logic Presets (모드 로직 프리셋).
 */

export type ArpMode = 'node' | 'edge' | 'face';

/** Node mode: random triggers, no sequence */
export interface NodeModeLogicPreset {
    /** Probability per tick to trigger (e.g. 0.05 = 5%) */
    triggerProbability: number;
    /** Note duration in seconds */
    noteDuration: number;
}

/** Edge mode: sequence-based, distance-weighted */
export interface EdgeModeLogicPreset {
    /** Pattern length for edge notes (note1, note2) */
    patternLengthEdge: number;
    /** Pattern length for neighbor notes */
    patternLengthNeighbor: number;
    /** Base probability for edge notes */
    baseProbabilityEdge: number;
    /** Base probability for neighbor notes */
    baseProbabilityNeighbor: number;
    /** How much distance affects probability (0–1, intensity multiplier) */
    distanceInfluence: number;
    /** Max distance for full intensity */
    distanceMax: number;
    /** Subdivision for edge notes (Tone.Time format) */
    subdivisionEdge: string;
    /** Subdivision for neighbors */
    subdivisionNeighbor: string;
    /** Note duration for edge (seconds) */
    durationEdge: number;
    /** Note duration for neighbors (seconds) */
    durationNeighbor: number;
    /**
     * Edge 두 음만: 거리가 가까운 음이 더 크게 (exponential)
     * intensity = 1 - distance/distanceMax → velocity = base + range * intensity^exponent
     * exponent > 1: 가까울수록 볼륨이 지수적으로 증가
     */
    /** Base velocity for edge notes (far) */
    velocityBaseEdge: number;
    /** Velocity range when close (adds to base) */
    velocityRangeEdge: number;
    /** Exponent for distance→velocity curve (2 = quadratic, closer = much louder) */
    velocityDistanceExponent: number;
    /** Base velocity for neighbor notes */
    velocityBaseNeighbor: number;
    /** Velocity range for neighbors */
    velocityRangeNeighbor: number;
    /** 비율: edge 음의 ±1옥타브 변형 (풍성함) */
    octaveVariationRatioEdge: number;
    /** 비율: neighbor 음의 ±1옥타브 변형 */
    octaveVariationRatioNeighbor: number;
}

/** Face mode: sweep pattern */
export interface FaceModeLogicPreset {
    patternLength: number;
    baseProbability: number;
    subdivision: string;
    /** Note duration in seconds */
    duration: number;
    /** minor=ascending, major=descending (notes order) */
    minorAscending: boolean;
    /** 비율: 해당음의 ±1옥타브로 변형 (풍성함) */
    octaveVariationRatio: number;
    /** 어두운 아스트랄 톤용 velocity (0~1) */
    velocityBase: number;
}

export type ArpModeLogicPreset = NodeModeLogicPreset | EdgeModeLogicPreset | FaceModeLogicPreset;

export const NODE_MODE_LOGIC_PRESET: NodeModeLogicPreset = {
    triggerProbability: 0.01,
    noteDuration: 1.0, // 2n at 120bpm
};

export const EDGE_MODE_LOGIC_PRESET: EdgeModeLogicPreset = {
    patternLengthEdge: 8,
    patternLengthNeighbor: 16,
    baseProbabilityEdge: 0.5,
    baseProbabilityNeighbor: 0.1,
    distanceInfluence: 0.7,
    distanceMax: 25,
    subdivisionEdge: '8n',
    subdivisionNeighbor: '32n',
    durationEdge: 0.125,
    durationNeighbor: 0.0625,
    // 거리 가까운 음이 exponential 하게 더 크게 (edge 두 음 트랙)
    velocityBaseEdge: 1.2,
    velocityRangeEdge: 0.5,
    velocityDistanceExponent: 1,
    velocityBaseNeighbor: 0.15,
    velocityRangeNeighbor: 0.1,
    octaveVariationRatioEdge: 0.2,
    octaveVariationRatioNeighbor: 0.2,
};

export const FACE_MODE_LOGIC_PRESET: FaceModeLogicPreset = {
    patternLength: 16,
    baseProbability: 0.5,
    subdivision: '4n',
    duration: 1.5,
    minorAscending: true,
    octaveVariationRatio: 0.5,
    velocityBase: 0.22,
};

export const ARP_MODE_LOGIC_PRESETS: Record<ArpMode, ArpModeLogicPreset> = {
    node: NODE_MODE_LOGIC_PRESET,
    edge: EDGE_MODE_LOGIC_PRESET,
    face: FACE_MODE_LOGIC_PRESET,
};
