/**
 * PatternScore - Musical pattern generator for arpeggios.
 * Pure logic for determining rhythm and notes.
 */

export class PatternScore {
    /**
     * Generates arpeggio patterns with distance-based dynamics.
     * @param distance Distance from player to the node. 
     */
    public genArpPattern(note: string, isEdge: boolean, distance: number = 10) {
        const length = isEdge ? 8 : 16;

        // Intensity factor: Inverse relationship with distance (closer = 1, far = 0)
        const intensity = Math.max(0, 1 - distance / 25);

        // Probability: Frequency of notes (Closer = more notes)
        const baseProb = isEdge ? 0.4 : 0.2;
        const probability = baseProb * (0.3 + 0.7 * intensity);

        const p = [];
        for (let i = 0; i < length; i++) {
            if (Math.random() < probability) {
                // Velocity: Loudness of notes (Closer = louder)
                const baseVel = isEdge ? 0.4 : 0.25;
                const velocity = (baseVel + 0.5 * intensity) + Math.random() * 0.2;

                // For Edge notes, we occasionally jump octaves
                let finalNote = note;
                if (isEdge && Math.random() < 0.3) {
                    const octaveVar = Math.random() > 0.5 ? 1 : -1;
                    const match = note.match(/(\d+)$/);
                    if (match) {
                        const currentOctave = parseInt(match[0]);
                        finalNote = note.replace(/\d+$/, (currentOctave + octaveVar).toString());
                    }
                }

                p.push({ note: finalNote, velocity });
            } else {
                p.push(null);
            }
        }
        return p;
    }

    /**
     * Astral Arpeggio Pattern (For Face mode)
     * Creates a structured sweep pattern.
     */
    public genAstralPattern(sortedNotes: string[], isMajor: boolean) {
        const patternEvents = [];
        const length = 16;

        // Direction based on tonality
        const notes = isMajor ? [...sortedNotes].reverse() : sortedNotes;

        for (let i = 0; i < length; i++) {
            if (Math.random() < 0.35) {
                const idx = Math.floor((i / length) * notes.length);
                patternEvents.push(notes[Math.min(idx, notes.length - 1)]);
            } else {
                patternEvents.push(null);
            }
        }
        return patternEvents;
    }
}
