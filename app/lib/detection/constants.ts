/**
 * Detection constants - thresholds for spatial detection.
 * Uses SPACING from tonnetz-grid for consistency.
 */
import { SPACING } from '../tonnetz/tonnetz-grid';

/** Squared movement threshold - skip detection when camera moved less than this */
export const MOVEMENT_THRESHOLD_SQ = 0.04;
/** Motion threshold Δ (sqrt of above) - used for WhichTriangle/IsEdge debounce in ThresholdLogic */
export const MOTION_THRESHOLD = 0.2;

/** Node detection: enter threshold (tighter so face/major-minor is seen more; neutral only when very close to node) */
export const NODE_ENTER = 0.09 * SPACING;
/** Node detection: exit threshold (wider, hysteresis to prevent flicker) */
export const NODE_EXIT = 0.2 * SPACING;
/** Edge detection: enter threshold (tighter so face/major-minor dominates; neutral only when clearly on edge) */
export const EDGE_ENTER = 0.06 * SPACING;
/** Edge detection: exit threshold */
export const EDGE_EXIT = 0.2 * SPACING;
/** Exit threshold multiplier when moving (stickier mode to reduce flap at boundaries) */
export const MOVEMENT_EXIT_MULTIPLIER = 1.5;
