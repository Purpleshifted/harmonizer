'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { type NodeCandidate } from '../../../../app/components/walkthrough/shared/hooks/useSpatialDetection';
import { getAdjacentNodes, getNodeWorldPosition } from '../../../../app/lib/tonnetz/tonnetz-grid';

interface ActiveHighlightProps {
    mode: 'node' | 'edge' | 'face';
    activeNodes: NodeCandidate[];
    isMajor: boolean | null;
}

/**
 * Highlights for active nodes/edges/faces based on interaction mode
 * - Face: Triangle fill mesh with bloom
 * - Edge: Glowing line segment
 * - Node: Circular pulse on neighbors
 */
export function ActiveHighlight({ mode, activeNodes, isMajor }: ActiveHighlightProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const pulseRefs = useRef<THREE.Mesh[]>([]);
    const timeRef = useRef(0);

    // Materials
    const faceMaterial = useMemo(() =>
        new THREE.MeshStandardMaterial({
            color: '#ffffff',
            emissive: '#ffffff',
            emissiveIntensity: 2.5, // High for bloom
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            toneMapped: false,
        }), []);

    const edgeMaterial = useMemo(() =>
        new THREE.LineBasicMaterial({
            color: '#ffffff',
            transparent: true,
            opacity: 0.9,
            linewidth: 3,
        }), []);

    const pulseMaterial = useMemo(() =>
        new THREE.MeshStandardMaterial({
            color: '#ffffff',
            emissive: '#ffffff',
            emissiveIntensity: 2.0,
            transparent: true,
            opacity: 0.6,
            toneMapped: false,
        }), []);

    // Face geometry (triangle)
    const faceGeometry = useMemo(() => {
        if (mode !== 'face' || activeNodes.length < 3) return null;

        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array([
            activeNodes[0].pos.x, 0.01, activeNodes[0].pos.z,
            activeNodes[1].pos.x, 0.01, activeNodes[1].pos.z,
            activeNodes[2].pos.x, 0.01, activeNodes[2].pos.z,
        ]);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.computeVertexNormals();
        return geo;
    }, [mode, activeNodes]);

    // Edge geometry
    const edgeGeometry = useMemo(() => {
        if (mode !== 'edge' || activeNodes.length < 2) return null;

        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array([
            activeNodes[0].pos.x, 0.05, activeNodes[0].pos.z,
            activeNodes[1].pos.x, 0.05, activeNodes[1].pos.z,
        ]);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        return geo;
    }, [mode, activeNodes]);

    // Node pulse - adjacent nodes for circular animation
    const adjacentNodesData = useMemo(() => {
        if (mode !== 'node' || activeNodes.length < 1) return [];

        const centerNode = activeNodes[0];
        const adjacent = getAdjacentNodes(centerNode.u, centerNode.v);
        return adjacent.map(({ u, v }) => ({
            u, v,
            pos: getNodeWorldPosition(u, v),
        }));
    }, [mode, activeNodes]);

    useFrame((_, delta) => {
        timeRef.current += delta;
        const time = timeRef.current;

        if (mode === 'face' && meshRef.current) {
            // Pulsing intensity for face
            const intensity = 2.0 + Math.sin(time * 3) * 0.5;
            faceMaterial.emissiveIntensity = intensity;
        }

        if (mode === 'node' && pulseRefs.current.length > 0) {
            // Circular pulse animation on adjacent nodes
            const cycleTime = 2; // seconds per cycle
            const phase = (time / cycleTime) % 1;

            pulseRefs.current.forEach((mesh, i) => {
                if (!mesh) return;

                const nodePhase = i / 6;
                const phaseDiff = Math.abs(phase - nodePhase);
                const wrappedDiff = Math.min(phaseDiff, 1 - phaseDiff);

                // Intensity peaks when phase matches node position
                const intensity = Math.max(0, 1 - wrappedDiff * 6);
                const scale = 0.15 + intensity * 0.15;

                mesh.scale.setScalar(scale);
                (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + intensity * 3;
                (mesh.material as THREE.MeshStandardMaterial).opacity = 0.3 + intensity * 0.5;
            });
        }
    });

    return (
        <group>
            {/* Face highlight - triangle fill */}
            {mode === 'face' && faceGeometry && (
                <mesh ref={meshRef} geometry={faceGeometry} material={faceMaterial} />
            )}

            {/* Edge highlight - glowing line */}
            {mode === 'edge' && edgeGeometry && (
                <primitive object={new THREE.Line(edgeGeometry, edgeMaterial)} />
            )}

            {/* Node highlight - pulsing rings on adjacent nodes */}
            {mode === 'node' && adjacentNodesData.map((node, i) => (
                <mesh
                    key={`pulse-${i}`}
                    ref={(ref) => {
                        if (ref) pulseRefs.current[i] = ref;
                    }}
                    position={[node.pos.x, 0.02, node.pos.z]}
                    rotation={[-Math.PI / 2, 0, 0]}
                >
                    <ringGeometry args={[0.3, 0.5, 32]} />
                    <meshStandardMaterial
                        color="#ffffff"
                        emissive="#ffffff"
                        emissiveIntensity={1}
                        transparent
                        opacity={0.5}
                        toneMapped={false}
                        side={THREE.DoubleSide}
                    />
                </mesh>
            ))}
        </group>
    );
}
