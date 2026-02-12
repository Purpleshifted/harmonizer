'use client';

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as Tone from 'tone';
import { useControls, folder } from 'leva';
import { Orchestrator } from '../../../../lib/audio/core/Orchestrator';
import { DetectionResult } from '../hooks/useSpatialDetection';

interface AudioControllerProps {
    isAudioReady: boolean;
    detectionRef: React.MutableRefObject<DetectionResult | null>;
}

/**
 * AudioController - React Bridge for the Audio Orchestrator
 * 
 * This component handles the lifecycle of the Orchestrator and bridges
 * UI state (Leva sliders, Camera) to the core audio engine.
 */
export function AudioController({ isAudioReady, detectionRef }: AudioControllerProps) {
    const { camera } = useThree();
    const orchestratorRef = useRef<Orchestrator | null>(null);

    // === Debug Controls (Mixer) ===
    const mixerControls = useControls('Audio Mixer', {
        Master: folder({
            masterVol: { value: 1.0, min: 0, max: 1, label: 'Master Volume' },
        }),
        Layers: folder({
            ambientVol: { value: 0.5, min: 0, max: 1, label: 'Ambient Drone' },
            orchestraVol: { value: 0.8, min: 0, max: 1, label: 'Orchestra' },
            arpVol: { value: 1.0, min: 0, max: 1, label: 'Arpeggiator' },
            padVol: { value: 1.0, min: 0, max: 1, label: 'Focus Pad' },
            waveVol: { value: 0.2, min: 0, max: 1, label: 'Wave Effect' },
        })
    });

    // 1. Initialize/Dispose Orchestrator instance
    useEffect(() => {
        if (!isAudioReady) return;

        console.log('[AudioController] Attaching Orchestrator...');
        orchestratorRef.current = new Orchestrator();

        return () => {
            console.log('[AudioController] Detaching Orchestrator...');
            orchestratorRef.current?.dispose();
            orchestratorRef.current = null;
        };
    }, [isAudioReady]);

    // 2. Bridge Mix Controls to Orchestrator
    useEffect(() => {
        if (orchestratorRef.current) {
            orchestratorRef.current.setLayerVolumes(mixerControls);
        }
    }, [mixerControls]);

    // 3. Apply Master Volume directly to Tone Destination
    useEffect(() => {
        if (Tone.Destination) {
            Tone.Destination.volume.rampTo(Tone.gainToDb(mixerControls.masterVol), 0.1);
        }
    }, [mixerControls.masterVol]);

    // 4. Main Audio Pulse Hook (Drives Orchestrator)
    useFrame((_, delta) => {
        const detection = detectionRef.current;
        if (!isAudioReady || !detection || !orchestratorRef.current) return;

        // Delegate all coordination and spatial processing to Orchestrator
        orchestratorRef.current.update(detection, camera, delta);
    });

    return null;
}
