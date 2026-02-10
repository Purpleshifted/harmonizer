export interface GridNode {
    value: number; // 0-11
    name: string; // "C", "C#", "Db", etc.
    u: number;
    v: number;
}

// Map from Fifth Index to Note Name
// The index corresponds to the number of sharps/flats (approx).
// 0 = C, 1 = G, -1 = F, etc.
const FIFTH_CIRCLE = [
    "F", "C", "G", "D", "A", "E", "B"
];
// Extended for sharps/flats based on specific offsets
// Index 0 in this array is "F" which corresponds to Fifth Index -1
// So an offset is needed.
// Let's rely on a helper to calculate based on the index.

// We use a "Fifth Index" to determine spelling found in Neo-Riemannian theory.
// Index 0 = C
// Index 1 = G (+1 sharp)
// Index -1 = F (+1 flat)
// Index 2 = D
// ...
// The grid logic:
// Moving RIGHT (+u): +7 semitones (Perfect 5th). Increases Fifth Index by 1.
// Moving BOTTOM-LEFT (+v): -4 semitones (Major 3rd down).
// Major 3rd down = -4 semitones. 
// In terms of fifths: Ab -> C is 4 fifths. So C -> Ab (down M3) is -4 fifths.
// Wait, C (0) -> Ab (-4). Ab is 4 flats.
// So +v (Down-Left) decreases Fifth Index by 4.
//
// Formula: Index = StartIndex + 1*u - 4*v
//
// StartIndex depends on the origin. If Origin (0,0) is Middle C (0), StartIndex = 0.
// Let's assume (0,0) is numeric 0 (C) for simplicity.

const NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const NOTE_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/**
 * Calculates the Fifth Index for a given node.
 * @param u The horizontal axis index (increases index by 1 -> +7 semitones)
 * @param v The vertical/diagonal axis index (increases index by 3 -> -3 semitones)
 * @param startOffset The starting fifth index offset (default 0 for C)
 * 
 * Grid Logic (Target):
 * - Right (+u): +7 semitones (Perfect 5th)
 * - Bottom-Right (+u, +v): +4 semitones (Major 3rd) -> 1 + 3 = 4 Fifths -> 4*7=28=4. Correct.
 * - Bottom-Left (+v): -3 semitones (Minor 3rd down) -> +3 Fifths -> 3*7=21=9=-3. Correct.
 */
function getFifthIndex(u: number, v: number, startOffset: number = 0): number {
    return startOffset + u + 3 * v;
}

/**
 * Converts a Fifth Index to a Note Name.
 * Logic:
 * - Center around 0 (C natural)
 * - Positive -> Sharps or Naturals
 * - Negative -> Flats or Naturals
 */
function getNoteName(fifthIndex: number): string {
    // Normalize index to a "base" range to find the pitch class,
    // but for NAMING, we need the raw index to know if it's broad sharp or flat territory.

    // Note Value (0-11) calculation from Fifth Index:
    // Mulitply by 7 (since a 5th is 7 semitones)
    const semitones = (fifthIndex * 7) % 12;
    const normalizedValue = (semitones + 1200) % 12; // Ensure positive 0-11

    // Naming logic:
    // We want to avoid double sharps/flats for this basic implementation if possible,
    // but strictly following the fifth index is the most accurate for Tonnetz.
    //
    // Simple heuristic based on user request:
    // "Parallel Minor (below) -> Flat", "Parallel Major (above) -> Sharp"
    // This implies position-based, which correlates with Fifth Index.
    //
    // Index > 6 often implies Enharmonic Shift needed (e.g. F# vs Gb),
    // but let's stick to standard 0-5 sharps, -1 to -6 flats boundaries.
    // 
    // Standard Fifths:
    // 0: C
    // 1: G
    // 2: D
    // 3: A
    // 4: E
    // 5: B
    // 6: F#
    // 7: C#
    //
    // -1: F
    // -2: Bb
    // -3: Eb
    // -4: Ab
    // -5: Db
    // -6: Gb
    // -7: Cb

    const SHARPS = ["F", "C", "G", "D", "A", "E", "B"]; // Order of sharps addition
    const FLATS = ["B", "E", "A", "D", "G", "C", "F"]; // Order of flats addition

    // This lookup table is simpler:
    // If we map specific Fifth Indices to names directly.
    // 
    // Let's use the explicit map for the central range, and extrapolate if needed.
    // 
    // Or, use the simple "Sharps vs Flats" toggle based on the sign of the index?
    // User said: "Horizontal line below -> parallel minor -> flat".
    // Moving "down" (-v) reduces the index (-4). So negative/lower indices -> Flat.
    // Moving "up" (inverse of down) -> Increases index. Positive/higher indices -> Sharp.
    // This aligns perfectly with Fifth Index.

    if (normalizedValue === 0) return "C";
    if (normalizedValue === 2) return "D";
    if (normalizedValue === 4) return "E";
    if (normalizedValue === 5) return "F";
    if (normalizedValue === 7) return "G";
    if (normalizedValue === 9) return "A";
    if (normalizedValue === 11) return "B";

    // Chromatic notes:
    // If the Fifth Index is "high" (positive direction), prefer Sharp.
    // If the Fifth Index is "low" (negative direction), prefer Flat.
    //
    // Cutoff? 
    // F# is Index 6. Gb is Index -6.
    // The User's "Start Row" includes F# and C# and G# and D# and A#.
    // F#=6, C#=7, G#=8, D#=9, A#=10.
    // So positive indices >= 6 are clearly Sharps.

    return fifthIndex >= 0 ? NOTE_NAMES_SHARP[normalizedValue] : NOTE_NAMES_FLAT[normalizedValue];
}

export function getTone(u: number, v: number): GridNode {
    // Start at -1 (F) for the "Start Row" logic check? 
    // User said: "First row is F-C-G..."
    // If u=0, v=0 is the first item.
    // If (0,0) is F (Index -1, Value 5):
    //   (1,0) should be C (Index 0, Value 0). Right is +7 semitones (Index+1).
    //   F(5) + 7 = 12 -> 0 (C). Correct.
    //
    // Let's set Origin (0,0) to F (Value 5, Index -1).
    const startValue = 5;
    const startIndex = -1;

    const fifthIndex = getFifthIndex(u, v, startIndex);

    // Calculate value: Start + 7*u - 4*v
    // We use the fifthIndex simply: Value = (fifthIndex * 7) mod 12
    // Because each index step is a Perfect 5th (+7 semitones).
    const val = (fifthIndex * 7) % 12;
    const positiveVal = (val + 120000) % 12; // robust mod

    const name = getNoteName(fifthIndex);

    return {
        value: positiveVal,
        name,
        u,
        v
    };
}

export function generateGridChunk(width: number, height: number, startU: number = 0, startV: number = 0): GridNode[] {
    const nodes: GridNode[] = [];
    for (let v = 0; v < height; v++) {
        for (let u = 0; u < width; u++) {
            nodes.push(getTone(startU + u, startV + v));
        }
    }
    return nodes;
}

// --- Chord Analysis ---

export const TRIAD_SHAPES = {
    MAJOR: [0, 4, 7],     // Major Root
    MINOR: [0, 3, 7],     // Minor Root
    DIM: [0, 3, 6],       // Diminished
    AUG: [0, 4, 8],       // Augmented
    SUS2: [0, 2, 7],      // Sus2
    SUS4: [0, 5, 7],      // Sus4
};

export type TriadType = 'major' | 'minor' | 'dim' | 'aug' | 'other';

/**
 * Robustly classifies a triad formed by 3 pitch classes (0-11).
 * Used simplified interval logic: Sort -> Normalize -> Match Pattern.
 */
export function classifyTriad(n1: number, n2: number, n3: number): { type: TriadType; isMajor: boolean } {
    // 1. Sort pitch classes (a < b < c)
    const sorted = [n1, n2, n3].sort((a, b) => a - b);
    const a = sorted[0];
    const b = sorted[1];
    const c = sorted[2];

    // 2. Calculate intervals relative to lowest note
    // X = (0, b-a, c-a)
    const i1 = b - a;
    const i2 = c - a;

    // 3. Match against known shapes
    // Major shapes: (0,4,7), (0,3,8), (0,5,9)
    if (
        (i1 === 4 && i2 === 7) || // Root (C-E-G)
        (i1 === 3 && i2 === 8) || // 1st Inv (E-G-C -> 4,7,0 -> 0,4,7 sorted? No. B-D#-F# -> 11,3,6 -> 3,6,11 -> 0,3,8)
        (i1 === 5 && i2 === 9)    // 2nd Inv (A-C#-E -> 9,1,4 -> 1,4,9 -> 0,3,8. Wait. F#-A#-C# -> 6,10,1 -> 1,6,10 -> 0,5,9)
    ) {
        return { type: 'major', isMajor: true };
    }

    // Minor shapes: (0,3,7), (0,5,8), (0,4,9)
    if (
        (i1 === 3 && i2 === 7) || // Root (C-Eb-G)
        (i1 === 5 && i2 === 8) || // 1st Inv (F-Ab-C -> 5,8,0 -> 0,5,8)
        (i1 === 4 && i2 === 9)    // 2nd Inv (B-D-F# -> 11,2,6 -> 2,6,11 -> 0,4,9)
    ) {
        return { type: 'minor', isMajor: false };
    }

    // Handle Dim/Aug/Other
    if (i1 === 3 && i2 === 6) return { type: 'dim', isMajor: false };
    if (i1 === 4 && i2 === 8) return { type: 'aug', isMajor: true }; // Aug is generally major-ish

    // Fallback
    return { type: 'other', isMajor: false };
}
