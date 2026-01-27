'use client';

import React, { useMemo, useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
// We use Html from drei for crisp, non-WebGL text that doesn't crash the context
import { Html, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { generateGridChunk, GridNode } from '../lib/tonnetz';

// Spacing between nodes
const SPACING = 2.0;

// Reusable geometry/material
const sphereGeo = new THREE.SphereGeometry(0.2, 8, 8);
const mat = new THREE.MeshStandardMaterial({ color: 'orange' });
const tempObject = new THREE.Object3D();

function getPos(u: number, v: number) {
    const x = (u - 0.5 * v) * SPACING;
    const y = (-(Math.sqrt(3) / 2) * v) * SPACING;
    return new THREE.Vector3(x, y, 0);
}

function GridInstancedMesh({ nodes }: { nodes: GridNode[] }) {
    const meshRef = useRef<THREE.InstancedMesh>(null);

    useEffect(() => {
        if (!meshRef.current) return;

        nodes.forEach((node, i) => {
            const pos = getPos(node.u, node.v);
            tempObject.position.copy(pos);
            tempObject.updateMatrix();
            meshRef.current!.setMatrixAt(i, tempObject.matrix);
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [nodes]);

    return (
        <instancedMesh ref={meshRef} args={[sphereGeo, mat, nodes.length]} count={nodes.length}>
        </instancedMesh>
    );
}

// Separate component for HTML labels to keep the scene clean
function GridLabels({ nodes }: { nodes: GridNode[] }) {
    return (
        <group>
            {nodes.map((node, i) => {
                const pos = getPos(node.u, node.v);
                // Offset slightly for text
                return (
                    <Html
                        key={i}
                        position={[pos.x, pos.y + 0.3, 0]}
                        center
                        zIndexRange={[100, 0]}
                        style={{ pointerEvents: 'none' }}
                    >
                        <div className="text-white text-xs font-bold whitespace-nowrap select-none flex flex-col items-center">
                            <span>{node.name}</span>
                            <span className="text-[10px] text-gray-400 font-normal">{node.value}</span>
                        </div>
                    </Html>
                );
            })}
        </group>
    );
}

function GridLines({ width, height }: { width: number, height: number }) {
    const points: THREE.Vector3[] = [];

    for (let v = 0; v < height; v++) {
        for (let u = 0; u < width; u++) {
            const currentPos = getPos(u, v);

            // Connect Right (u+1, v)
            if (u + 1 < width) {
                points.push(currentPos);
                points.push(getPos(u + 1, v));
            }

            // Connect Down-Left (u, v+1)
            if (v + 1 < height) {
                points.push(currentPos);
                points.push(getPos(u, v + 1));
            }

            // Connect Down-Right (u+1, v+1)
            if (u + 1 < width && v + 1 < height) {
                points.push(currentPos);
                points.push(getPos(u + 1, v + 1));
            }
        }
    }

    const geometry = useMemo(() => {
        return new THREE.BufferGeometry().setFromPoints(points);
    }, [points]);

    return (
        <lineSegments geometry={geometry}>
            <lineBasicMaterial color="#555" />
        </lineSegments>
    );
}

export default function TonnetzGrid() {
    const width = 24;
    const height = 12;

    const nodes = useMemo(() => generateGridChunk(width, height), [width, height]);

    return (
        <div className="w-full h-screen bg-black">
            <Canvas camera={{ position: [0, 0, 20], fov: 60 }}>
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} />

                <group position={[-width * SPACING / 2, height * SPACING / 3, 0]}>
                    <GridLines width={width} height={height} />
                    <GridInstancedMesh nodes={nodes} />
                    {/* Use HTML overlay for labels to avoid WebGL Text overhead/crashes */}
                    <GridLabels nodes={nodes} />
                </group>

                <OrbitControls
                    makeDefault
                    enableRotate={false}
                    enableZoom={true}
                    enablePan={true}
                    mouseButtons={{
                        LEFT: THREE.MOUSE.PAN,
                        MIDDLE: THREE.MOUSE.DOLLY,
                        RIGHT: THREE.MOUSE.PAN
                    }}
                    touches={{
                        ONE: THREE.TOUCH.PAN,
                        TWO: THREE.TOUCH.DOLLY_PAN
                    }}
                />
            </Canvas>
        </div>
    );
}
