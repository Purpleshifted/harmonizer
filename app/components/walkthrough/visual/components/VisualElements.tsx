'use client';

import React from 'react';
import { Persistence } from '../core/Persistence';
import { PostProcessing } from '../core/PostProcessing';
import { GridDots } from './GridDots';
import { GridLines } from './GridLines';
import { AmbienceParticles } from './AmbienceParticles';
import { ActiveHighlight } from './ActiveHighlight';
import { NodeLabels } from './NodeLabels';
import { Stars } from './Stars';
import { DetectionResult } from '../../shared/hooks/useSpatialDetection';

interface VisualElementsProps {
    detectionRef: React.MutableRefObject<DetectionResult | null>;
}

/**
 * VisualElements
 * Encapsulates the visual environment (fog, lights) and the visual component stack.
 * Does NOT contain camera logic or player controls.
 */
export function VisualElements({ detectionRef }: VisualElementsProps) {
    return (
        <>
            {/* Environment Settings */}
            <fog attach="fog" args={['#030303', 5, 200]} />
            <ambientLight intensity={0.1} />

            {/* Visual Components */}
            <Persistence />
            <Stars />
            <GridDots detectionRef={detectionRef} />
            <GridLines detectionRef={detectionRef} />
            <AmbienceParticles detectionRef={detectionRef} />
            <ActiveHighlight detectionRef={detectionRef} />
            <NodeLabels />
            <PostProcessing />
        </>
    );
}
