'use client';

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA_HEIGHT, type TriangleInfo } from '../../../../lib/tonnetz-grid';
import {
    getTemperatureColor,
    NEUTRAL_COLOR,
    MAJOR_COLOR,
    MINOR_COLOR,
} from '../utils/colorTemperature';

interface FloatingSpheresProps {
    triangles: TriangleInfo[];
    currentMode: 'node' | 'edge' | 'face';
    activeIsMajor: boolean | null;
}

/**
 * Floating spheres at triangle centroids
 * Soft bobbing animation, semi-transparent matte white
 */
export function FloatingSpheres({ triangles, currentMode, activeIsMajor }: FloatingSpheresProps) {
    const groupRef = useRef<THREE.Group>(null);
    const sphereRefs = useRef<THREE.Mesh[]>([]);
    const timeRef = useRef(0);

    // Sphere geometry (shared)
    const sphereGeo = useMemo(() => new THREE.SphereGeometry(0.25, 24, 24), []);

    // Material for each sphere (we'll update colors dynamically)
    const materials = useMemo(() => {
        return Array(6).fill(null).map(() =>
            new THREE.MeshStandardMaterial({
                color: NEUTRAL_COLOR,
                emissive: NEUTRAL_COLOR,
                emissiveIntensity: 0.5,
                transparent: true,
                opacity: 0.7,
                roughness: 0.8,
                metalness: 0.1,
            })
        );
    }, []);

    useFrame((_, delta) => {
        timeRef.current += delta;
        const time = timeRef.current;

        triangles.forEach((tri, i) => {
            if (i >= 6 || !sphereRefs.current[i]) return;

            const mesh = sphereRefs.current[i];
            const material = materials[i];

            // Base position at centroid
            const baseY = CAMERA_HEIGHT * 0.8;

            // Bobbing animation - water-like gentle motion
            const bobOffset = Math.sin(time * 0.8 + i * 1.2) * 0.08;
            const swayX = Math.sin(time * 0.5 + i * 0.7) * 0.05;
            const swayZ = Math.cos(time * 0.6 + i * 0.9) * 0.05;

            mesh.position.set(
                tri.centroid.x + swayX,
                baseY + bobOffset,
                tri.centroid.z + swayZ
            );

            // Color temperature based on mode and major/minor
            if (currentMode === 'edge') {
                // Edge mode: temperature shift based on triangle's major/minor
                const targetColor = tri.isMajor ? MAJOR_COLOR : MINOR_COLOR;
                material.color.lerp(targetColor, 0.1);
                material.emissive.lerp(targetColor, 0.1);
            } else if (currentMode === 'node') {
                // Node mode: fluctuating color with major/minor base
                const fluctuate = (Math.sin(time * 2 + i) + 1) / 2;
                const baseColor = tri.isMajor ? MAJOR_COLOR : MINOR_COLOR;
                const accentColor = tri.isMajor ? MINOR_COLOR : MAJOR_COLOR;
                const targetColor = new THREE.Color().lerpColors(baseColor, accentColor, fluctuate * 0.3);
                material.color.lerp(targetColor, 0.1);
                material.emissive.lerp(targetColor, 0.1);
            } else {
                // Face mode or default: neutral
                material.color.lerp(NEUTRAL_COLOR, 0.1);
                material.emissive.lerp(NEUTRAL_COLOR, 0.1);
            }
        });
    });

    return (
        <group ref={groupRef}>
            {triangles.slice(0, 6).map((tri, i) => (
                <mesh
                    key={`sphere-${i}`}
                    ref={(ref) => {
                        if (ref) sphereRefs.current[i] = ref;
                    }}
                    geometry={sphereGeo}
                    material={materials[i]}
                    position={[tri.centroid.x, CAMERA_HEIGHT * 0.8, tri.centroid.z]}
                />
            ))}
        </group>
    );
}
