/**
 * Pattern Generator (ArpLogicSketch): Note Catcher + Mode Logic Presets → 패턴.
 * 순수 패턴 생성만. 사운드/악기는 기존 플레이어 그대로 사용.
 */

import * as THREE from 'three';
import { ensureOctave, transposeOctave, sortNotesByPitch } from '../core/NoteUtils';
import { getModeLogicPreset } from './ArpModeLogicPresets';

// --- Edge: 2 main (8n) + 5 sparkle (16n), 기존 ArpeggiatorPlayer와 동일 형식
export interface EdgeVoicePattern {
    note: string;
    position: THREE.Vector3;
    isEdgeNode: boolean;
    events: Array<{ note: string; velocity: number } | null>;
}

export function genEdgePattern(
    note1: string,
    note2: string,
    pos1: THREE.Vector3,
    pos2: THREE.Vector3,
    nearbyNotes: string[],
    nearbyPositions: THREE.Vector3[]
): EdgeVoicePattern[] {
    const preset = getModeLogicPreset('edge');
    const mainLen = 8;
    const sparkleLen = 16;
    const voices: EdgeVoicePattern[] = [];

    const n1 = ensureOctave(note1, 5);
    const n2 = ensureOctave(note2, 5);
    voices.push({
        note: n1,
        position: pos1.clone(),
        isEdgeNode: true,
        events: genMainPattern(n1, mainLen, preset.density),
    });
    voices.push({
        note: n2,
        position: pos2.clone(),
        isEdgeNode: true,
        events: genMainPattern(n2, mainLen, preset.density),
    });

    const nearbyCount = Math.min(nearbyNotes.length, 5);
    for (let i = 0; i < nearbyCount; i++) {
        const note = ensureOctave(nearbyNotes[i], 6);
        const pos = nearbyPositions[i]?.clone() ?? new THREE.Vector3();
        voices.push({
            note,
            position: pos,
            isEdgeNode: false,
            events: genSparklePattern(note, sparkleLen, 0.25),
        });
    }
    return voices;
}

function genMainPattern(note: string, length: number, density: number): Array<{ note: string; velocity: number } | null> {
    const out: Array<{ note: string; velocity: number } | null> = [];
    for (let i = 0; i < length; i++) {
        if (Math.random() < density) {
            out.push({ note, velocity: 0.6 + Math.random() * 0.3 });
        } else {
            out.push(null);
        }
    }
    return out;
}

function genSparklePattern(note: string, length: number, density: number): Array<{ note: string; velocity: number } | null> {
    const out: Array<{ note: string; velocity: number } | null> = [];
    for (let i = 0; i < length; i++) {
        if (Math.random() < density) {
            out.push({ note, velocity: 0.3 + Math.random() * 0.3 });
        } else {
            out.push(null);
        }
    }
    return out;
}

// --- Node: 단일 노트(패드) + 주변 6음 헥스 아프 (천천히 한 번씩)
export function genNodePattern(activeNodeNote: string): { note: string } {
    return { note: activeNodeNote };
}

/** Node 모드: 주변 6음(Which Hex) 천천히 한 번씩 재생할 순서. 최대 6개. */
export function genNodeHexArpNotes(hexNotes: string[]): string[] {
    const max = 6;
    const withOctave = hexNotes.slice(0, max).map((n) => ensureOctave(n, 5));
    return withOctave;
}

// --- Face: Astral 시퀀스 – major 디센딩, minor 어센딩 (순서 고정)
export function genFaceArpPattern(notes: string[], isMajor: boolean): (string | null)[] {
    const preset = getModeLogicPreset('face');
    const validNotes = notes.filter((n): n is string => !!n && typeof n === 'string');
    if (validNotes.length === 0) return [];

    const expandedNotes: string[] = [];
    validNotes.forEach((note) => {
        const n = ensureOctave(note, 4);
        expandedNotes.push(transposeOctave(n, -1));
        expandedNotes.push(n);
        expandedNotes.push(transposeOctave(n, 1));
    });
    const sortedNotes = sortNotesByPitch(expandedNotes);
    if (isMajor) sortedNotes.reverse(); // major = 디센딩, minor = 어센딩

    // 방향성은 유지(major 하행 / minor 상행)하면서 일부 스텝은 쉬어
    // 예전 astral의 "성긴 반짝임" 질감을 복원.
    const length = 16;
    const patternEvents: (string | null)[] = [];
    for (let i = 0; i < length; i++) {
        const idx = i % sortedNotes.length;
        const isAnchorStep = i % 4 === 0; // 그리드 앵커는 유지
        const shouldPlay = isAnchorStep || Math.random() < preset.density;
        patternEvents.push(shouldPlay ? sortedNotes[idx] : null);
    }
    return patternEvents;
}
