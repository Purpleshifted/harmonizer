import type { EdgeModeLogicPreset, FaceModeLogicPreset } from '../presets/ArpModeLogicPresets';
import { EDGE_MODE_LOGIC_PRESET, FACE_MODE_LOGIC_PRESET } from '../presets/ArpModeLogicPresets';
import { sortNotesByPitch, sortNotesByPitchDesc, transposeOctave } from '../utils/NoteUtils';

export type PatternEvent = { note: string; velocity: number } | null;

/**
 * PatternScore - Musical pattern generator for arpeggios.
 * Uses Mode Logic Presets (모드 로직 프리셋) for rhythm and note density.
 */
export class PatternScore {
    /**
     * Generates arpeggio patterns with distance-based dynamics.
     * Uses EdgeModeLogicPreset for patternLength, baseProbability, distanceInfluence.
     */
    public genArpPattern(
        note: string,
        isEdge: boolean,
        distance: number = 10,
        preset: EdgeModeLogicPreset = EDGE_MODE_LOGIC_PRESET
    ): PatternEvent[] {
        const length = isEdge ? preset.patternLengthEdge : preset.patternLengthNeighbor;

        const intensity = Math.max(0, 1 - distance / preset.distanceMax);
        const baseProb = isEdge ? preset.baseProbabilityEdge : preset.baseProbabilityNeighbor;
        const probability = baseProb * (1 - preset.distanceInfluence + preset.distanceInfluence * intensity);

        const p: PatternEvent[] = [];
        const velocityIntensity = Math.pow(intensity, preset.velocityDistanceExponent ?? 1);
        const baseVel = isEdge ? preset.velocityBaseEdge : preset.velocityBaseNeighbor;
        const velRange = isEdge ? preset.velocityRangeEdge : preset.velocityRangeNeighbor;

        for (let i = 0; i < length; i++) {
            if (Math.random() < probability) {
                const velocity = (baseVel + velRange * velocityIntensity) + Math.random() * 0.2;

                let finalNote = note;
                const octaveRatio = isEdge ? preset.octaveVariationRatioEdge : preset.octaveVariationRatioNeighbor;
                if (Math.random() < octaveRatio) {
                    const octaveVar = Math.random() > 0.5 ? 1 : -1;
                    finalNote = transposeOctave(note, octaveVar);
                }

                p.push({ note: finalNote, velocity });
            } else {
                p.push(null);
            }
        }
        return p;
    }

    /**
     * Face Arpeggio Pattern - 해당 face의 세 음을 ascend(minor) 또는 descend(major).
     * 기준: 옥타브 conform 후 MIDI 번호로 정렬. 한 줄 = 세 음 한 번씩만, 나머지 null.
     * cycleIndex로 사이클마다 slot 배치 변경 (규칙에 맞게 새 패턴).
     */
    public genFaceArpPattern(
        faceNotes: string[],
        isMajor: boolean,
        cycleIndex: number = 0,
        preset: FaceModeLogicPreset = FACE_MODE_LOGIC_PRESET
    ): (string | null)[] {
        if (faceNotes.length === 0) return [];
        const notes = isMajor ? sortNotesByPitchDesc(faceNotes) : sortNotesByPitch(faceNotes);
        const patternEvents: (string | null)[] = new Array(preset.patternLength).fill(null);
        const length = preset.patternLength;
        const step = Math.max(1, Math.floor(length / notes.length));
        for (let i = 0; i < notes.length; i++) {
            const baseSlot = (i * step + cycleIndex) % length;
            patternEvents[baseSlot] = notes[i];
        }
        return patternEvents;
    }
}
