'use client';

import React, { useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getTone } from '../../../../../lib/tonnetz';
import {
    getWorldToGrid,
    getNodeWorldPosition,
    CAMERA_HEIGHT,
} from '../utils/tonnetzMath';

const LABEL_RANGE = 25;
const MAX_LABELS = 15;

interface NodeLabelData {
    u: number;
    v: number;
    pos: THREE.Vector3;
    name: string;
    distance: number;
}

/**
 * Floating text labels above nodes showing note names
 */
export function NodeLabels() {
    const { camera } = useThree();
    const labelsRef = useRef<NodeLabelData[]>([]);
    const lastUpdateRef = useRef(0);

    useFrame(() => {
        const now = performance.now();
        // Update at most every 100ms to reduce React re-renders
        if (now - lastUpdateRef.current < 100) return;
        lastUpdateRef.current = now;

        const playerPos = camera.position;
        const { u: centerU, v: centerV } = getWorldToGrid(playerPos.x, playerPos.z);

        const candidates: NodeLabelData[] = [];

        // Gather nearby nodes
        for (let dv = -4; dv <= 4; dv++) {
            for (let du = -4; du <= 4; du++) {
                const u = centerU + du;
                const v = centerV + dv;
                const pos = getNodeWorldPosition(u, v);
                const distance = pos.distanceTo(playerPos);

                if (distance < LABEL_RANGE) {
                    const tone = getTone(u, v);
                    candidates.push({ u, v, pos, name: tone.name, distance });
                }
            }
        }

        // Sort by distance and limit
        candidates.sort((a, b) => a.distance - b.distance);
        labelsRef.current = candidates.slice(0, MAX_LABELS);
    });

    // Note: We use labelsRef to avoid re-rendering every frame
    // The actual labels update based on the ref
    return <LabelsRenderer labelsRef={labelsRef} />;
}

interface LabelsRendererProps {
    labelsRef: React.MutableRefObject<NodeLabelData[]>;
}

function LabelsRenderer({ labelsRef }: LabelsRendererProps) {
    const [labels, setLabels] = React.useState<NodeLabelData[]>([]);
    const updateIntervalRef = useRef<number | null>(null);

    React.useEffect(() => {
        // Update labels periodically instead of every frame
        updateIntervalRef.current = window.setInterval(() => {
            setLabels([...labelsRef.current]);
        }, 100);

        return () => {
            if (updateIntervalRef.current) {
                clearInterval(updateIntervalRef.current);
            }
        };
    }, [labelsRef]);

    return (
        <group>
            {labels.map((node) => {
                const alpha = Math.pow(1.0 - (node.distance / LABEL_RANGE), 1.2);

                return (
                    <Html
                        key={`label-${node.u}-${node.v}`}
                        position={[node.pos.x, CAMERA_HEIGHT, node.pos.z]}
                        center
                        style={{
                            pointerEvents: 'none',
                            transform: 'translate3d(-50%, -50%, 0)',
                        }}
                        zIndexRange={[100, 0]}
                    >
                        <div
                            style={{
                                color: '#ffffff',
                                opacity: alpha,
                                fontSize: '40px',
                                fontFamily: '"Times New Roman", "Times", serif',
                                fontWeight: 'bold',
                                textShadow: '0 0 10px rgba(255, 255, 255, 0.79), 0 0 20px black',
                                whiteSpace: 'nowrap',
                                userSelect: 'none',
                            }}
                        >
                            {node.name}
                        </div>
                    </Html>
                );
            })}
        </group>
    );
}
