import { getTone, generateGridChunk } from '../app/lib/tonnetz/tonnetz';

console.log("Verifying Tonnetz Grid Logic...");

// 1. Check Start Row
// Expected: F(5), C(0), G(7), D(2), A(9), E(4), B(11), F#(6)...
console.log("\n1. Start Row (v=0):");
let rowStr = "";
for (let u = 0; u < 12; u++) {
    const node = getTone(u, 0);
    rowStr += `${node.name}(${node.value}) -> `;
}
console.log(rowStr);

// Verify specific values
const fNode = getTone(0, 0);
if (fNode.name !== "F") console.error(`ERROR: (0,0) should be F, got ${fNode.name}`);

const cNode = getTone(1, 0);
if (cNode.name !== "C") console.error(`ERROR: (1,0) should be C, got ${cNode.name}`);

// 2. Check Neighbor Logic
// (0,0) is F.
// Right (+u) -> Should be +7 semitones (C).
// Bottom-Left (+v) -> Should be -4 semitones (Db/C#).
//   F (5) - 4 = 1 (C#/Db).
//   Let's check getTone(0, 1).
//   Index Logic:
//     F index = -1.
//     (0,1) index = -1 + 0 - 4(1) = -5.
//     -5 * 7 = -35. -35 mod 12 = 1.
//     Name for Index -5?
//     0=C, -1=F, -2=Bb, -3=Eb, -4=Ab, -5=Db.
//     So it should be Db.
//
// User Rule: "Bottom left (-4 semitones)"
// User Context: "Parallel to Minor -> Flat".
// If F Major (Parallel D Minor) -> D is minor.
// Wait, user example: "3 is D# or Eb".
// Let's rely on my Fifth Index derivation which aligns with "Negative -> Flats".

console.log("\n2. Neighbor Check from (0,0) [F]:");
const right = getTone(1, 0);
console.log(`Right (1,0): ${right.name} (${right.value}) [Expected: C (0)]`);

const downLeft = getTone(0, 1);
console.log(`Down-Left (0,1): ${downLeft.name} (${downLeft.value}) [Expected: Db/C# (1)]`);
// Note: My logic might produce Db. Let's see if that matches "Parallel Minor".
// F Major -> Parallel is F Minor (Ab, Bb, C, Db...).
// Down-Left from F is A (Major 3rd)? No, -4 semitones is Major 3rd DOWN.
// F down M3 is Db. Correct.

// 3. Periodicity Check
console.log("\n3. Periodicity Check (24x12):");
// Check if (u, v) == (u+12, v) ? Not necessarily?
// Fifth Index increases by 1 for u. 12 steps = +12 index.
// Value changes by 12*7 = 84 = 0 mod 12. So Value is SAME.
// Name might change (enharmonically), e.g. F# vs Gb.
// 24x12 tile repeating unit?
// Let's check (0,0) vs (12,0).
const t0 = getTone(0, 0);
const t12 = getTone(12, 0);
console.log(`(0,0): ${t0.name} vs (12,0): ${t12.name}`);
if (t0.value === t12.value) console.log("Values match every 12 columns.");

// Check vertical periodicity
// v increases -> Index -4.
// To repeat value: -4 * v = 0 mod 12 -> 4v = 12k -> v=3.
// So every 3 rows, the values repeat?
// Check (0,0) vs (0,3).
const t3 = getTone(0, 3);
console.log(`(0,0): ${t0.name} vs (0,3): ${t3.name}`);
if (t0.value === t3.value) console.log("Values match every 3 rows.");

console.log("\nDone.");
