'use client';

import React from 'react';
import { EffectComposer, Bloom, Noise, ToneMapping } from '@react-three/postprocessing';
import { useControls } from 'leva';
import { getInitialValue } from './Persistence';

export function PostProcessing() {
    const {
        bloomEnabled,
        bloomThreshold,
        bloomIntensity,
        bloomRadius,
        noiseOpacity,
        exposure
    } = useControls('Environment.PostProcessing', {
        bloomEnabled: { value: true },
        bloomThreshold: { value: getInitialValue('bloomThreshold', 1.0), min: 0, max: 2, step: 0.05 },
        bloomIntensity: { value: getInitialValue('bloomIntensity', 1.5), min: 0, max: 5, step: 0.1 },
        bloomRadius: { value: getInitialValue('bloomRadius', 0.6), min: 0, max: 1, step: 0.05 },
        noiseOpacity: { value: getInitialValue('noiseOpacity', 0.00), min: 0, max: 0.2, step: 0.01 },
        exposure: { value: getInitialValue('exposure', 1.0), min: 0.1, max: 5, step: 0.1, label: '📷 Exposure' },
    });

    return (
        <EffectComposer enableNormalPass={false} multisampling={0}>
            <Bloom
                intensity={bloomEnabled ? bloomIntensity : 0}
                luminanceThreshold={bloomThreshold}
                mipmapBlur
                radius={bloomRadius}
            />
            <Noise opacity={noiseOpacity} />
            <ToneMapping exposure={exposure} />
        </EffectComposer>
    );
}
