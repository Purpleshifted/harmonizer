/**
 * HarmonyLogic - Harmony & Pitch Intelligence.
 * Pure math and theory logic for note selection and voicing.
 */
import { ensureOctave, noteToFreq, sortNotesByPitch, transposeOctave } from '../utils/NoteUtils';

export class HarmonyLogic {
    /**
     * Converts a note name to frequency for DSP performers.
     */
    public getFreq(noteName: string, octave: number = 4): number {
        const fullNote = ensureOctave(noteName, octave);
        return noteToFreq(fullNote);
    }

    /**
     * Prepares expanded note sets for complex voicing (e.g., Astral Arpeggios).
     * Creates a 3-octave spread.
     */
    public prepareExpandedVoicing(notes: string[]) {
        const expanded: string[] = [];
        notes.forEach(note => {
            const n = ensureOctave(note, 4);
            expanded.push(transposeOctave(n, -1));
            expanded.push(n);
            expanded.push(transposeOctave(n, 1));
        });
        return sortNotesByPitch(expanded);
    }

    /**
     * Ensures correct octave for a given performer type.
     */
    public conformOctave(note: string, octave: number): string {
        return ensureOctave(note, octave);
    }
}
