'use client';

import React, { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, Stars, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { generateGridChunk, GridNode } from '../lib/tonnetz';

// Torus Dimensions
const MAJOR_RADIUS = 10; // Distance from center to tube center
const MINOR_RADIUS = 4;  // Radius of the tube

interface NodeProps {
    node: GridNode;
}

function getTorusPos(u: number, v: number) {
    // Map u -> Theta (Major Angle) 0..2PI
    // Map v -> Phi (Minor Angle) 0..2PI
    // Grid size: 24 x 12
    const theta = (u / 24) * Math.PI * 2;
    const phi = (v / 12) * Math.PI * 2;

    // Torus parametric equation
    const x = (MAJOR_RADIUS + MINOR_RADIUS * Math.cos(phi)) * Math.cos(theta);
    const z = (MAJOR_RADIUS + MINOR_RADIUS * Math.cos(phi)) * Math.sin(theta); // Y is up usually, but let's use Z as horizontal plane for torus ring
    // Wait, standard:
    // x = (R + r cos phi) cos theta
    // y = (R + r cos phi) sin theta
    // z = r sin phi
    // This makes the Torus lie in XY plane, tube height in Z.
    // Let's rotate it to "Stand up"? Or lie flat?
    // Let's make it lie flat in XZ plane (so Y is height).

    const y = MINOR_RADIUS * Math.sin(phi);

    return new THREE.Vector3(x, y, z);
}

function TorusNodeMesh({ node }: NodeProps) {
    const position = getTorusPos(node.u, node.v);

    return (
        <group position={position}>
            <mesh>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial color="#4ade80" emissive="#4ade80" emissiveIntensity={0.5} />
            </mesh>

            {/* Label - billboarded */}
            <Billboard
                position={[0, 0.5, 0]}
                follow={true}
            >
                <Text
                    fontSize={0.4}
                    color="white"
                    anchorX="center"
                    anchorY="middle"
                    outlineWidth={0.02}
                    outlineColor="black"
                >
                    {node.name}
                </Text>
            </Billboard>
        </group>
    );
}

function TorusConnections({ nodes }: { nodes: GridNode[] }) {
    // Connect each node to its neighbors.
    // Neighbors: Right (u+1), Down-Left (v+1)
    // IMPORTANT: We must modulo 24 and 12 to wrap around!

    // We can't reuse the simplified GridLines logic because we need to handle wrapping manually
    // by looking up the neighbor node or calculating pos for (u+1)%24.

    // Actually, getTorusPos logic handles wrapping naturally via cos/sin!
    // getTorusPos(24, 0) == getTorusPos(0, 0).
    // So we just iterate u=0..23, v=0..11 and draw lines to u+1, v+1.
    // And for the last edges (u=23), u+1=24 -> Wraps perfectly visually.

    const points: THREE.Vector3[] = [];

    for (let v = 0; v < 12; v++) {
        for (let u = 0; u < 24; u++) {
            const p1 = getTorusPos(u, v);

            // Right (u+1)
            const pRight = getTorusPos(u + 1, v);
            points.push(p1);
            points.push(pRight);

            // Down-Left (v+1) (which is our vertical axis in the data)
            const pDown = getTorusPos(u, v + 1);
            points.push(p1);
            points.push(pDown);

            // Diagonal (u+1, v+1) to complete triangles
            const pDiag = getTorusPos(u + 1, v + 1);
            points.push(p1);
            points.push(pDiag);
        }
    }

    const geometry = useMemo(() => {
        return new THREE.BufferGeometry().setFromPoints(points);
    }, [points]);

    return (
        <lineSegments geometry={geometry}>
            <lineBasicMaterial color="#333" opacity={0.5} transparent />
        </lineSegments>
    );
}

export default function TonnetzTorus() {
    const width = 24;
    const height = 12;

    // We generate the standard chunk. The coordinates u, v map to torus angles.
    const nodes = useMemo(() => generateGridChunk(width, height), [width, height]);

    return (
        <div className="w-full h-screen bg-black">
            <Canvas camera={{ position: [0, 20, 25], fov: 45 }}>
                <ambientLight intensity={0.2} />
                <pointLight position={[20, 20, 20]} intensity={1} />
                <pointLight position={[-20, -10, -20]} intensity={0.5} />

                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

                <group>
                    <TorusConnections nodes={nodes} />
                    {nodes.map((node, i) => (
                        <TorusNodeMesh key={i} node={node} />
                    ))}
                </group>

                <OrbitControls makeDefault enablePan={true} minDistance={5} maxDistance={100} />
            </Canvas>

            <div className="absolute top-4 left-4 z-10">
                <a href="/tonnetz" className="text-white/80 hover:text-white bg-black/50 backdrop-blur px-4 py-2 rounded border border-white/10">
                    &larr; Back
                </a>
            </div>

            <div className="absolute bottom-8 left-0 w-full text-center pointer-events-none">
                <p className="text-white/30 text-sm">Global Torus Topology (24x12 Seamless Wrap)</p>
            </div>
        </div>
    );
}
