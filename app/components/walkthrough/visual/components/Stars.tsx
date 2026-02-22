'use client';

import React from 'react';
import { Stars as DreiStars } from '@react-three/drei';
import { useControls } from 'leva';
import { getInitialValue } from '../core/Persistence';

export function Stars() {
    const { count, radius, depth, factor, saturation, fade, speed } = useControls('Environment.Stars', {
        count: { value: getInitialValue('starCount', 16000), min: 500, max: 20000, step: 100 },
        radius: { value: getInitialValue('starRadius', 50), min: 50, max: 500 },
        depth: { value: getInitialValue('starDepth', 200), min: 10, max: 200 },
        factor: { value: getInitialValue('starFactor', 4.99), min: 1, max: 10 },
        saturation: { value: getInitialValue('starSaturation', 0.95), min: 0, max: 1 },
        fade: { value: getInitialValue('starFade', true) },
        speed: { value: getInitialValue('starSpeed', 1.1), min: 0, max: 5 },
    });

    return (
        <DreiStars
            radius={radius}
            depth={depth}
            count={count}
            factor={factor}
            saturation={saturation}
            fade={fade}
            speed={speed}
        />
    );
}
