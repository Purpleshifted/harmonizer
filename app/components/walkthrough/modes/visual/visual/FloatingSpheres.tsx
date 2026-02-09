'use client';

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useControls } from 'leva';
import { InteractionMode } from '../hooks/useSpatialDetection';
import { TriangleInfo } from '../utils/tonnetzMath';

interface FloatingSpheresProps {
    triangles: TriangleInfo[];
    currentMode: InteractionMode;
    activeIsMajor: boolean | null;
}

export function FloatingSpheres({
    triangles = [],
    currentMode,
    activeIsMajor,
}: FloatingSpheresProps) {
    const groupRef = useRef<THREE.Group>(null);

    // Leva Controls
    const {
        warmHex,
        coolHex,
        baseSize,
        activeScale,
        opacity,
        pulseSpeed
    } = useControls('Floating Spheres', {
        warmHex: { value: '#ffaa00', label: 'Major Color' }, // Warm Orange
        coolHex: { value: '#00aaff', label: 'Minor Color' }, // Cool Blue
        baseSize: { value: 0.15, min: 0.05, max: 0.5 },
        activeScale: { value: 2.0, min: 1.0, max: 5.0 },
        opacity: { value: 0.8, min: 0.1, max: 1.0 },
        pulseSpeed: { value: 3.0, min: 0.1, max: 10.0 }
    });

    useFrame(({ clock }) => {
        if (!groupRef.current) return;
        const time = clock.getElapsedTime();

        for (let i = 0; i < groupRef.current.children.length; i++) {
            const mesh = groupRef.current.children[i] as THREE.Mesh;
            const triangle = triangles[i];

            if (!triangle) {
                mesh.visible = false;
                continue;
            }
            mesh.visible = true;

            // Simple floating animation
            const yOffset = Math.sin(time * 1.5 + i * 100) * 0.1;

            mesh.position.set(
                triangle.centroid.x,
                triangle.centroid.y + 0.5 + yOffset,
                triangle.centroid.z
            );

            // Is this triangle the active one?
            // "face" is the mode name in older logic, but let's support "triangle" too if type changed.
            // InteractionMode in useSpatialDetection is typically 'node' | 'edge' | 'face'.
            const isTarget = i === 0 && (currentMode === 'face' || currentMode === 'triangle' as any);

            const material = mesh.material as THREE.MeshStandardMaterial;

            // Color logic
            const colorHex = triangle.isMajor ? warmHex : coolHex;
            const color = new THREE.Color(colorHex);

            material.color.copy(color);
            material.emissive.copy(color);
            material.opacity = opacity;

            if (isTarget) {
                // Pulse effect
                const pulse = Math.sin(time * pulseSpeed) * 0.1 + 1.0;
                mesh.scale.setScalar(baseSize * activeScale * pulse);
                material.emissiveIntensity = 2.0;
            } else {
                mesh.scale.setScalar(baseSize);
                material.emissiveIntensity = 1.0;
            }
        }
    });

    if (!triangles || triangles.length === 0) return null;

    return (
        <group ref={groupRef}>
            {triangles.map((t, i) => (
                <mesh key={i}>
                    <sphereGeometry args={[1, 32, 32]} />
                    <meshStandardMaterial
                        transparent
                        toneMapped={false}
                        roughness={0.1}
                        metalness={0.1}
                    />
                </mesh>
            ))}
        </group>
    );
}
