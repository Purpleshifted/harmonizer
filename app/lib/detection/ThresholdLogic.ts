/**
 * ThresholdLogic - Control and motion thresholds for mode confirmation.
 * Replaces/extends ModeLogic with key-hold (α) and movement (Δ) thresholds,
 * plus cruising detection (IsEdge여도 Face volume 유지).
 */
import type { InteractionMode } from './types';

export interface ThresholdLogicOptions {
    /** Control threshold α (sec): key-hold duration for debounce vs throttle */
    alpha?: number;
    /** Motion threshold Δ (world units): move distance for which-triangle debounce */
    delta?: number;
    /** Cruising threshold (sec): key-hold beyond this → Face volume not reduced on IsEdge */
    cruisingThreshold?: number;
}

export interface ThresholdFilterInput {
    mode: InteractionMode;
    isEdge: boolean;
    keyHoldSec: number;
    distMoved: number;
    /** When true, enforce debounce strictly (no keyHoldSec bypass) to avoid mode flap while cruising */
    isMoving?: boolean;
}

export interface ThresholdFilterOutput {
    mode: InteractionMode;
    changed: boolean;
    cruising: boolean;
}

export class ThresholdLogic {
    private lastMode: InteractionMode | null = null;
    private pendingMode: InteractionMode | null = null;
    private modeTimestamp = 0;

    private readonly alpha: number;
    private readonly delta: number;
    private readonly cruisingThreshold: number;

    constructor(options: ThresholdLogicOptions = {}) {
        this.alpha = options.alpha ?? 0.25; // 250ms, matches legacy ModeLogic DEBOUNCE_MS
        this.delta = options.delta ?? 0.2; // sqrt(0.04), matches MOVEMENT_THRESHOLD_SQ
        this.cruisingThreshold = options.cruisingThreshold ?? 3;
    }

    /**
     * Filter raw mode with debounce/throttle and determine cruising.
     * t < α: debounce mode confirmation
     * t ≥ α: throttle (allow mode change)
     * cruising: keyHoldSec > cruisingThreshold → even IsEdge, don't reduce Face volume
     */
    filter(input: ThresholdFilterInput): ThresholdFilterOutput {
        const { mode, isEdge, keyHoldSec, distMoved, isMoving = false } = input;
        const nowMs = performance.now();

        let confirmedMode: InteractionMode = this.lastMode ?? mode;

        if (mode !== this.lastMode) {
            if (mode !== this.pendingMode) {
                this.pendingMode = mode;
                this.modeTimestamp = nowMs;
            }

            // t < α: debounce (wait before confirming mode change)
            // When isMoving: always require temporal stability (no keyHoldSec bypass) to avoid flap at edge/node crossings
            // When idle: keyHoldSec >= α lets deliberate hold confirm change
            const elapsedSincePending = (nowMs - this.modeTimestamp) / 1000;
            const mayConfirm = isMoving ? elapsedSincePending >= this.alpha : (keyHoldSec >= this.alpha || elapsedSincePending >= this.alpha);
            if (mayConfirm) {
                confirmedMode = mode;
            }
        } else {
            this.pendingMode = null;
        }

        const changed = this.lastMode !== confirmedMode;
        this.lastMode = confirmedMode;

        // Cruising: sustained movement → IsEdge여도 Face 볼륨 줄이지 않음
        const cruising = keyHoldSec >= this.cruisingThreshold;

        return {
            mode: confirmedMode,
            changed,
            cruising,
        };
    }
}
