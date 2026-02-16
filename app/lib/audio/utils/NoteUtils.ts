/**
 * Note utility functions for audio processing
 */

import * as Tone from 'tone';

/**
 * Convert note name to frequency, with safe fallback
 */
export function noteToFreq(noteName: string, defaultOctave = 4): number {
    const withOctave = /[0-9]/.test(noteName) ? noteName : `${noteName}${defaultOctave}`;
    try {
        const freq = Tone.Frequency(withOctave).toFrequency();
        if (isNaN(freq) || freq <= 0 || !isFinite(freq)) {
            return 440;
        }
        return freq;
    } catch {
        return 440;
    }
}

/**
 * Ensure note has an octave number
 */
export function ensureOctave(note: string, defaultOctave = 4): string {
    return /[0-9]/.test(note) ? note : `${note}${defaultOctave}`;
}

/**
 * Transpose a note by octaves
 */
export function transposeOctave(note: string, octaves: number): string {
    try {
        const midi = Tone.Frequency(note).toMidi();
        return Tone.Frequency(midi + octaves * 12, "midi").toNote();
    } catch {
        return note;
    }
}

/**
 * Transpose a note by semitones
 */
export function transposeSemitones(note: string, semitones: number): string {
    try {
        const midi = Tone.Frequency(note).toMidi();
        return Tone.Frequency(midi + semitones, "midi").toNote();
    } catch {
        return note;
    }
}

/**
 * Get MIDI value from note, with safe fallback
 */
export function noteToMidi(note: string): number {
    try {
        return Tone.Frequency(note).toMidi();
    } catch {
        return 60; // Middle C
    }
}

/**
 * Sort notes by pitch (low to high) - uses MIDI number for accurate ordering
 */
export function sortNotesByPitch(notes: string[]): string[] {
    return [...notes].sort((a, b) => noteToMidi(a) - noteToMidi(b));
}

/**
 * Sort notes by MIDI descending (high to low)
 */
export function sortNotesByPitchDesc(notes: string[]): string[] {
    return [...notes].sort((a, b) => noteToMidi(b) - noteToMidi(a));
}

/**
 * Clamp note to a specific octave range
 * Keeps the note name (pitch class) but forces the octave to be within min/max
 * @param note Note string (e.g. "C4", "Db", "G#2")
 * @param minOctave Minimum allowed octave (inclusive)
 * @param maxOctave Maximum allowed octave (inclusive)
 */
export function clampOctave(note: string, minOctave: number, maxOctave: number): string {
    const noteObj = Tone.Frequency(note); // Use Tone to parse "C#", "Db" etc correctly
    // However, Tone.Frequency doesn't easily expose octave without .toNote() parsing
    // Let's do simple regex parsing as it's faster and robust enough for standard names

    // Extract base note name and octave
    const match = note.match(/^([A-Ga-g#]+)(-?[0-9]+)?$/);
    if (!match) return `${note}${Math.floor((minOctave + maxOctave) / 2)}`;

    const name = match[1];
    let octave = match[2] ? parseInt(match[2]) : 4; // Default to 4 if missing

    if (octave < minOctave) octave = minOctave;
    if (octave > maxOctave) octave = maxOctave;

    return `${name}${octave}`;
}
