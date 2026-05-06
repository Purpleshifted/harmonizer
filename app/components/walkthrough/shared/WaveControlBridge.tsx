'use client';

import { useEffect, useRef } from 'react';
import { useWaveControlContext } from '../visual/core/WaveSystem';

/**
 * Bridge component that connects a ref-based callback (from the DOM layer)
 * to the WaveControlContext (inside Canvas/R3F).
 * 
 * Must be placed inside <Canvas> → <WaveSystem>.
 */
export function WaveControlBridge({
    adjustEyeLevelRef,
}: {
    adjustEyeLevelRef: React.MutableRefObject<((delta: number) => void) | null>;
}) {
    const waveControl = useWaveControlContext();

    useEffect(() => {
        adjustEyeLevelRef.current = (delta: number) => {
            waveControl.adjustDefaultEyeLevel(delta);
        };
        return () => {
            adjustEyeLevelRef.current = null;
        };
    }, [waveControl, adjustEyeLevelRef]);

    return null;
}
