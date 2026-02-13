/**
 * ModeLogic - Decision making for mode transitions.
 * Handles debouncing and confirmations.
 */

export class ModeLogic {
    private lastMode: string | null = null;
    private pendingMode: string | null = null;
    private modeTimestamp: number = 0;
    private readonly DEBOUNCE_MS = 250;

    /**
     * Confirms if a mode change should actually happen.
     */
    public filterMode(targetMode: string): { mode: string, changed: boolean } {
        const now = performance.now();
        let confirmedMode = this.lastMode || targetMode;

        if (targetMode !== this.lastMode) {
            if (targetMode !== this.pendingMode) {
                this.pendingMode = targetMode;
                this.modeTimestamp = now;
            }

            if (now - this.modeTimestamp >= this.DEBOUNCE_MS) {
                confirmedMode = targetMode;
            }
        } else {
            this.pendingMode = null;
        }

        const changed = this.lastMode !== confirmedMode;
        this.lastMode = confirmedMode;

        return { mode: confirmedMode, changed };
    }
}
