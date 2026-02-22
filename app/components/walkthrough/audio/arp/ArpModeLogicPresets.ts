/**
 * Mode Logic Presets (ArpLogicSketch): 모드별 등장빈도, tempo.
 * Pattern Generator가 참조하는 preset만 정의. 사운드 프리셋은 기존 플레이어 유지.
 */

export type ArpMode = 'node' | 'edge' | 'face';

export interface ModeLogicPreset {
    /** Transport subdivision for this mode (e.g. '8n', '4n') */
    subdivision: string;
    /** Note-on probability per step (0–1) */
    density: number;
    /** Relative tempo hint (1 = normal) */
    tempoScale: number;
}

export const NODE_MODE_LOGIC_PRESET: ModeLogicPreset = {
    subdivision: '4n',
    density: 1.0, // node는 단일 노트 유지(패드)이므로 density는 사용처에서만 의미
    tempoScale: 1.0,
};

export const EDGE_MODE_LOGIC_PRESET: ModeLogicPreset = {
    subdivision: '8n',
    density: 0.5,  // main pattern 50%
    tempoScale: 1.0,
};

export const FACE_MODE_LOGIC_PRESET: ModeLogicPreset = {
    subdivision: '4n',
    density: 0.35, // astral sparkle
    tempoScale: 1.0,
};

const PRESETS: Record<ArpMode, ModeLogicPreset> = {
    node: NODE_MODE_LOGIC_PRESET,
    edge: EDGE_MODE_LOGIC_PRESET,
    face: FACE_MODE_LOGIC_PRESET,
};

export function getModeLogicPreset(mode: ArpMode): ModeLogicPreset {
    return PRESETS[mode];
}
