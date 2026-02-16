/**
 * NotePicker - Derives note materials for Edge/Node arpeggiators.
 * Which Line {l1,l2}, Nearest Dot {d}, Which Hex {h1..h6}.
 * Conditionally computed based on IsEdge, IsNode.
 */
import { getTone } from '../tonnetz/tonnetz';
import { getAdjacentNodes } from '../tonnetz/tonnetz-grid';
import type { NodeCandidate, NotePickerOutput } from './types';

export interface NotePickerInput {
    isEdge: boolean;
    isNode: boolean;
    activeEdge?: {
        note1: { name: string };
        note2: { name: string };
        pos1: { x: number; z: number };
        pos2: { x: number; z: number };
    };
    activeNodes: NodeCandidate[];
    nearestNeighbors: NodeCandidate[];
    adjacentNodeNotes?: NodeCandidate[];
}

/**
 * Compute note materials for Edge Arp and Node Arp.
 * - Which Line: IsEdge && !IsNode → {l1, l2} (edge endpoints)
 * - Nearest Dot: c1 (nearest node) → {d}
 * - Which Hex: IsEdge or IsNode → {h1..h6} (6 adjacent notes)
 */
export function runNotePicker(input: NotePickerInput): NotePickerOutput {
    const { isEdge, isNode, activeEdge, activeNodes, adjacentNodeNotes } = input;

    let lineNotes: [string, string] | null = null;
    let dotNote: string | null = null;
    let hexNotes: string[] | null = null;

    const c1 = activeNodes[0];
    if (c1) {
        dotNote = c1.note.name;
    }

    // Which Line: IsEdge && !IsNode
    if (isEdge && !isNode && activeEdge) {
        lineNotes = [activeEdge.note1.name, activeEdge.note2.name];
    }

    // Which Hex: IsEdge or IsNode
    if (isNode && adjacentNodeNotes && adjacentNodeNotes.length > 0) {
        hexNotes = adjacentNodeNotes.map((n) => n.note.name).slice(0, 6);
    } else if (isEdge && activeNodes.length >= 2) {
        // Edge: combine adjacent nodes from both endpoints, dedupe by note name
        const n1 = activeNodes[0];
        const n2 = activeNodes[1];
        const adj1 = getAdjacentNodes(n1.u, n1.v);
        const adj2 = getAdjacentNodes(n2.u, n2.v);
        const seen = new Set<string>();
        const hex: string[] = [];
        for (const { u, v } of [...adj1, ...adj2]) {
            const name = getTone(u, v).name;
            if (!seen.has(name) && hex.length < 6) {
                seen.add(name);
                hex.push(name);
            }
        }
        hexNotes = hex.length > 0 ? hex : null;
    }

    return {
        lineNotes,
        dotNote,
        hexNotes,
    };
}
