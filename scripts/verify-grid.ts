import { getTone, generateGridChunk } from '../app/lib/tonnetz';

console.log("Verifying Tonnetz Grid Logic (app/lib/tonnetz: Fifth Index = startOffset + u + 3*v)...");

// 1. Check Start Row
// Origin (0,0) = F (Fifth Index -1). Right (+u) = +7 semitones (Perfect 5th).
// Expected: F(5), C(0), G(7), D(2), A(9), E(4), B(11), F#(6)...
console.log("\n1. Start Row (v=0):");
let rowStr = "";
for (let u = 0; u < 12; u++) {
    const node = getTone(u, 0);
    rowStr += `${node.name}(${node.value}) -> `;
}
console.log(rowStr);

const fNode = getTone(0, 0);
if (fNode.name !== "F") console.error(`ERROR: (0,0) should be F, got ${fNode.name}`);

const cNode = getTone(1, 0);
if (cNode.name !== "C") console.error(`ERROR: (1,0) should be C, got ${cNode.name}`);

// 2. Neighbor Logic
// Right (+u): +7 semitones (Perfect 5th).
// Bottom-Left (+v only): +3 fifths -> +3*7=21 ≡ 9 semitones (Minor 3rd up from F = A).
// Bottom-Right (+u,+v): +1+3=4 fifths -> +4*7=28 ≡ 4 semitones (Major 3rd).
console.log("\n2. Neighbor Check from (0,0) [F]:");
const right = getTone(1, 0);
console.log(`Right (1,0): ${right.name} (${right.value}) [Expected: C (0)]`);

const downLeft = getTone(0, 1);
// Fifth Index (0,1) = -1 + 0 + 3 = 2 → D (2)
console.log(`Down-Left (0,1): ${downLeft.name} (${downLeft.value}) [Expected: D (2)]`);
if (downLeft.value !== 2) console.error(`ERROR: (0,1) should be D (2), got value ${downLeft.value}`);

// 3. Periodicity
// +u: 12 steps → +12 fifths → 12*7=84 ≡ 0 mod 12. Same pitch every 12 columns.
// +v: 4 steps → +12 fifths → same pitch every 4 rows.
console.log("\n3. Periodicity Check:");
const t0 = getTone(0, 0);
const t12 = getTone(12, 0);
console.log(`(0,0): ${t0.name} vs (12,0): ${t12.name}`);
if (t0.value !== t12.value) console.error("ERROR: Values should match every 12 columns.");

const t04 = getTone(0, 4);
console.log(`(0,0): ${t0.name} vs (0,4): ${t04.name}`);
if (t0.value !== t04.value) console.error("ERROR: Values should match every 4 rows.");

console.log("\nDone.");
