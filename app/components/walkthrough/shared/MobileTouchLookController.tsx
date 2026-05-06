'use client';

import { useMobileTouchLook } from './hooks/useMobileTouchLook';
import { useWaveControlContext } from '../visual/core/WaveSystem';
import { useMobileDetect } from './hooks/useMobileDetect';

/**
 * R3F component that enables touch-drag camera look on mobile.
 * Also bridges the WaveControl context for eye level adjustments.
 * Must be inside <Canvas> and <WaveSystem>.
 */
export function MobileTouchLookController() {
    const isMobile = useMobileDetect();
    useMobileTouchLook(isMobile);
    return null;
}
