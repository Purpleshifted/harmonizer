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
    detection: DetectionResult | null;
    onLocationUpdate: (info: string, type: string) => void;
    handleDetectionUpdate: (res: DetectionResult | null) => void;
}

/**
 * VisualElements
 * Encapsulates the visual environment (fog, lights) and the visual component stack.
 * Does NOT contain camera logic or player controls.
 */
export function VisualElements({ detection, onLocationUpdate, handleDetectionUpdate }: VisualElementsProps) {
    return (
        <>
            {/* Environment Settings */}
            <fog attach="fog" args={['#030303', 5, 200]} />
            <ambientLight intensity={0.1} />

            {/* Visual Components */}
            <Persistence />
            <Stars />
            <GridDots
                setLocationInfo={onLocationUpdate}
                onDetectionUpdate={handleDetectionUpdate}
                isMajor={detection?.isMajor ?? null}
            />
            <GridLines isMajor={detection?.isMajor ?? null} />
            <AmbienceParticles isMajor={detection?.isMajor ?? null} />
            {detection && (
                <ActiveHighlight
                    mode={detection.mode}
                    activeNodes={detection.activeNodes}
                    isMajor={detection.isMajor ?? null}
                />
            )}
            <NodeLabels />
            <PostProcessing />
        </>
    );
}
