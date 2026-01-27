'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { getTone } from '../lib/tonnetz';

// --- CONFIG ---
const SPACING = 6.0;
const VIEW_RADIUS = 12;
const GRID_SIZE = VIEW_RADIUS * 2 + 1; // 25x25 grid
const TOTAL_INSTANCES = GRID_SIZE * GRID_SIZE;
const CAMERA_HEIGHT = 2.0;

// --- UTILS ---
function getNodeWorldPosition(u: number, v: number): THREE.Vector3 {
    const x = (u - 0.5 * v) * SPACING;
    const z = (v * (Math.sqrt(3) / 2)) * SPACING;
    return new THREE.Vector3(x, 0, z);
}

function getWorldToGrid(x: number, z: number): { u: number, v: number } {
    const vRaw = z / (SPACING * (Math.sqrt(3) / 2));
    const v = Math.round(vRaw);
    const uRaw = (x / SPACING) + 0.5 * vRaw;
    const u = Math.round(uRaw);
    return { u, v };
}

// --- GLOWING LINES COMPONENT ---
function GlowingGrid({ playerPos }: { playerPos: THREE.Vector3 }) {
    const linesRef = useRef<THREE.LineSegments>(null);
    const positionsRef = useRef<Float32Array | null>(null);
    const colorsRef = useRef<Float32Array | null>(null);
    const lastGridPos = useRef({ u: 99999, v: 99999 });

    // Total edges: each node has 3 edges, total nodes = GRID_SIZE^2
    const TOTAL_EDGES = TOTAL_INSTANCES * 3;

    useEffect(() => {
        if (!linesRef.current) return;

        // Initialize buffers
        const positions = new Float32Array(TOTAL_EDGES * 6); // 2 vertices * 3 coords per edge
        const colors = new Float32Array(TOTAL_EDGES * 6); // 2 vertices * 3 color components

        positionsRef.current = positions;
        colorsRef.current = colors;

        const geometry = linesRef.current.geometry as THREE.BufferGeometry;
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    }, []);

    useFrame(() => {
        if (!linesRef.current || !positionsRef.current || !colorsRef.current) return;

        const { u: centerU, v: centerV } = getWorldToGrid(playerPos.x, playerPos.z);

        // Only update when grid position changes
        if (centerU !== lastGridPos.current.u || centerV !== lastGridPos.current.v) {
            lastGridPos.current = { u: centerU, v: centerV };

            const positions = positionsRef.current;
            const colors = colorsRef.current;
            let ei = 0;

            const startU = centerU - VIEW_RADIUS;
            const startV = centerV - VIEW_RADIUS;

            for (let dv = 0; dv < GRID_SIZE; dv++) {
                for (let du = 0; du < GRID_SIZE; du++) {
                    const u = startU + du;
                    const v = startV + dv;
                    const pos = getNodeWorldPosition(u, v);

                    // Edge 1: Right (u+1, v)
                    const pRight = getNodeWorldPosition(u + 1, v);
                    setEdge(positions, colors, ei, pos, pRight, playerPos);
                    ei++;

                    // Edge 2: Down-Left (u, v+1)
                    const pDL = getNodeWorldPosition(u, v + 1);
                    setEdge(positions, colors, ei, pos, pDL, playerPos);
                    ei++;

                    // Edge 3: Down-Right (u+1, v+1)
                    const pDR = getNodeWorldPosition(u + 1, v + 1);
                    setEdge(positions, colors, ei, pos, pDR, playerPos);
                    ei++;
                }
            }

            const geometry = linesRef.current.geometry as THREE.BufferGeometry;
            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.color.needsUpdate = true;
        }
    });

    const setEdge = (
        positions: Float32Array,
        colors: Float32Array,
        idx: number,
        p1: THREE.Vector3,
        p2: THREE.Vector3,
        playerPos: THREE.Vector3
    ) => {
        const base = idx * 6;

        // Positions
        positions[base] = p1.x;
        positions[base + 1] = p1.y;
        positions[base + 2] = p1.z;
        positions[base + 3] = p2.x;
        positions[base + 4] = p2.y;
        positions[base + 5] = p2.z;

        // Color based on distance (glow effect)
        const center = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        const dist = center.distanceTo(playerPos);
        // Boosted intensity: min 0.3, max 1.5
        const intensity = Math.max(0.3, 1.5 - (dist / 40));

        // Vertex colors (both vertices same color)
        colors[base] = intensity;
        colors[base + 1] = intensity;
        colors[base + 2] = intensity;
        colors[base + 3] = intensity;
        colors[base + 4] = intensity;
        colors[base + 5] = intensity;
    };

    return (
        <lineSegments ref={linesRef} frustumCulled={false}>
            <bufferGeometry />
            <lineBasicMaterial
                vertexColors
                transparent
                opacity={0.8} // Increased from 0.6
                blending={THREE.AdditiveBlending}
                linewidth={2} // Try to request thick lines (browser dependent)
            />
        </lineSegments>
    );
}

// --- MAIN GRID SYSTEM ---
function InfiniteGridSystem({ setLocationInfo }: { setLocationInfo: (info: string, type: string) => void }) {
    const { camera } = useThree();
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const lastGridPos = useRef({ u: 99999, v: 99999 });

    // Labels state
    const [nearbyLabels, setNearbyLabels] = useState<React.JSX.Element[]>([]);

    // Emissive data
    const nodeEmissiveArray = useMemo(() => new Float32Array(TOTAL_INSTANCES).fill(0.3), []);
    const prevActiveIndices = useRef<number[]>([]);

    // Sphere geometry
    const sphereGeo = useMemo(() => new THREE.SphereGeometry(0.15, 16, 16), []);

    // Initial setup
    useEffect(() => {
        if (!meshRef.current) return;

        const nodeEmissiveAttr = new THREE.InstancedBufferAttribute(nodeEmissiveArray, 1);
        meshRef.current.geometry.setAttribute('instanceEmissive', nodeEmissiveAttr);

        for (let i = 0; i < TOTAL_INSTANCES; i++) {
            dummy.position.set(0, -100, 0);
            dummy.updateMatrix();
            meshRef.current.setMatrixAt(i, dummy.matrix);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [dummy, nodeEmissiveArray]);

    useFrame(() => {
        if (!meshRef.current || !materialRef.current) return;
        const playerPos = camera.position;

        // Update shader uniforms
        if (materialRef.current.userData.shader) {
            materialRef.current.userData.shader.uniforms.uPlayerPos.value.copy(playerPos);
        }

        // Teleport logic
        const { u: centerU, v: centerV } = getWorldToGrid(playerPos.x, playerPos.z);

        if (centerU !== lastGridPos.current.u || centerV !== lastGridPos.current.v) {
            lastGridPos.current = { u: centerU, v: centerV };

            let i = 0;
            const startU = centerU - VIEW_RADIUS;
            const startV = centerV - VIEW_RADIUS;

            for (let dv = 0; dv < GRID_SIZE; dv++) {
                for (let du = 0; du < GRID_SIZE; du++) {
                    const u = startU + du;
                    const v = startV + dv;
                    const pos = getNodeWorldPosition(u, v);

                    dummy.position.copy(pos);
                    dummy.scale.set(1, 1, 1);
                    dummy.rotation.set(0, 0, 0);
                    dummy.updateMatrix();
                    meshRef.current.setMatrixAt(i, dummy.matrix);
                    nodeEmissiveArray[i] = 0.3;
                    i++;
                }
            }
            meshRef.current.instanceMatrix.needsUpdate = true;
        }

        // Spatial detection
        const candidates = [];
        for (let dv = -2; dv <= 2; dv++) {
            for (let du = -2; du <= 2; du++) {
                const u = centerU + du;
                const v = centerV + dv;
                const pos = getNodeWorldPosition(u, v);
                const d = pos.distanceTo(playerPos);
                candidates.push({ u, v, d, pos, node: getTone(u, v) });
            }
        }
        candidates.sort((a, b) => a.d - b.d);
        const c1 = candidates[0];
        const c2 = candidates[1];
        const c3 = candidates[2];

        const getNodeIndex = (u: number, v: number): number => {
            const startU = lastGridPos.current.u - VIEW_RADIUS;
            const startV = lastGridPos.current.v - VIEW_RADIUS;
            const du = u - startU;
            const dv = v - startV;
            if (du < 0 || du >= GRID_SIZE || dv < 0 || dv >= GRID_SIZE) return -1;
            return dv * GRID_SIZE + du;
        };

        // Lowered thresholds for larger Face area
        const NODE_THRESHOLD = 0.5 * SPACING;
        const EDGE_THRESHOLD = 0.08 * SPACING;

        let infoStr = "";
        let typeStr = "";
        const activeNodeIndices: number[] = [];

        if (c1.d < NODE_THRESHOLD) {
            infoStr = c1.node.name;
            typeStr = "Node";
            const idx = getNodeIndex(c1.u, c1.v);
            if (idx >= 0) activeNodeIndices.push(idx);
        } else if (Math.abs(c1.d - c2.d) < EDGE_THRESHOLD) {
            infoStr = `${c1.node.name} – ${c2.node.name}`;
            typeStr = "Interval";
            const idx1 = getNodeIndex(c1.u, c1.v);
            const idx2 = getNodeIndex(c2.u, c2.v);
            if (idx1 >= 0) activeNodeIndices.push(idx1);
            if (idx2 >= 0) activeNodeIndices.push(idx2);
        } else {
            const v1 = new THREE.Vector3().subVectors(c2.pos, c1.pos);
            const v2 = new THREE.Vector3().subVectors(c3.pos, c1.pos);
            const cross = v1.cross(v2).y;
            const isMajor = cross > 0;

            infoStr = `${c1.node.name} ${c2.node.name} ${c3.node.name}`;
            typeStr = isMajor ? "Major" : "Minor";

            const idx1 = getNodeIndex(c1.u, c1.v);
            const idx2 = getNodeIndex(c2.u, c2.v);
            const idx3 = getNodeIndex(c3.u, c3.v);
            if (idx1 >= 0) activeNodeIndices.push(idx1);
            if (idx2 >= 0) activeNodeIndices.push(idx2);
            if (idx3 >= 0) activeNodeIndices.push(idx3);
        }

        // Update emissive
        for (const idx of prevActiveIndices.current) {
            if (idx < nodeEmissiveArray.length) nodeEmissiveArray[idx] = 0.3;
        }
        for (const idx of activeNodeIndices) {
            if (idx >= 0 && idx < nodeEmissiveArray.length) {
                nodeEmissiveArray[idx] = 2.5;
            }
        }
        prevActiveIndices.current = activeNodeIndices;

        const nodeEmissiveAttr = meshRef.current.geometry.getAttribute('instanceEmissive') as THREE.InstancedBufferAttribute;
        if (nodeEmissiveAttr) nodeEmissiveAttr.needsUpdate = true;

        setLocationInfo(infoStr, typeStr);

        // Generate floating labels at EYE LEVEL with Times font
        const LABEL_RANGE = 25;
        const MAX_LABELS = 15;
        const labelElements: React.JSX.Element[] = [];

        const nodesInRange = candidates
            .filter(c => c.d < LABEL_RANGE)
            .slice(0, MAX_LABELS);

        // 3. FLOAT HTML LABELS (Source of "floating text")
        // This generates the 2D floating labels above the nodes
        for (const node of nodesInRange) {
            const alpha = Math.pow(1.0 - (node.d / LABEL_RANGE), 1.2);
            labelElements.push(
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
                    <div style={{
                        color: '#ffffffff',
                        opacity: alpha,
                        fontSize: '40px', // Large text
                        fontFamily: '"Times New Roman", "Times", serif',
                        fontWeight: 'bold',
                        textShadow: '0 0 10px rgba(255, 255, 255, 0.79), 0 0 20px black',
                        whiteSpace: 'nowrap',
                        userSelect: 'none'
                    }}>
                        {node.node.name}
                    </div>
                </Html>
            );
        }
        setNearbyLabels(labelElements);
    });

    // Shader patch for per-instance emissive
    const patchEmissiveMaterial = (shader: any) => {
        shader.uniforms.uPlayerPos = { value: new THREE.Vector3() };

        shader.vertexShader = `
            attribute float instanceEmissive;
            varying float vInstanceEmissive;
            varying float vDist;
            uniform vec3 uPlayerPos;
            ${shader.vertexShader}
        `.replace(
            '#include <begin_vertex>',
            `
            #include <begin_vertex>
            vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
            float dist = distance(worldPosition.xyz, uPlayerPos);
            vDist = dist;
            vInstanceEmissive = instanceEmissive;
            
            float normDist = clamp(dist / 50.0, 0.0, 1.0);
            float scale = mix(1.5, 0.5, normDist);
            transformed *= scale;
            `
        );

        shader.fragmentShader = `
            varying float vInstanceEmissive;
            varying float vDist;
            ${shader.fragmentShader}
        `.replace(
            '#include <emissivemap_fragment>',
            `
            #include <emissivemap_fragment>
            // Apply per-instance emissive intensity
            // This enables "Selective Bloom" by pushing intensity > threshold (1.0)
            totalEmissiveRadiance *= vInstanceEmissive;
            `
        );
    };

    return (
        <group>
            {/* NODES */}
            <instancedMesh ref={meshRef} args={[sphereGeo, undefined, TOTAL_INSTANCES]} frustumCulled={false}>
                <meshStandardMaterial
                    ref={materialRef}
                    color="white"
                    emissive="white"
                    emissiveIntensity={1}
                    toneMapped={false} // Crucial for Bloom: allows colors to exceed 1.0
                    onBeforeCompile={(shader) => {
                        materialRef.current!.userData.shader = shader;
                        patchEmissiveMaterial(shader);
                    }}
                />
            </instancedMesh>

            {/* GLOWING LINES */}
            <GlowingGrid playerPos={camera.position} />

            {/* LABELS */}
            {nearbyLabels}
        </group>
    );
}

import { EffectComposer, Bloom } from '@react-three/postprocessing';

// --- MAIN WRAPPER ---
export default function TonnetzWalkthrough() {
    const [locationInfo, setLocationInfo] = useState("...");
    const [locationType, setLocationType] = useState("Initializing");
    const { forward, backward, left, right } = usePlayerControls();

    return (
        <div className="w-full h-screen bg-black">
            <Canvas camera={{ position: [0, CAMERA_HEIGHT, 5], fov: 60 }} onCreated={({ gl }) => {
                gl.setClearColor('#030303');
                gl.toneMapping = THREE.ReinhardToneMapping;
            }}>
                <fog attach="fog" args={['#030303', 5, 70]} />
                <ambientLight intensity={0.1} />

                <InfiniteGridSystem setLocationInfo={(info, type) => {
                    setLocationInfo(info);
                    setLocationType(type);
                }} />

                {/* SELECTIVE BLOOM OPTIMIZATION */}
                {/* We use thresholding: Objects with brightness > 1.2 will glow. */}
                {/* Active nodes are set to intensity 3.0, inactive to 0.2. */}
                <EffectComposer enableNormalPass={false}>
                    <Bloom
                        luminanceThreshold={1.2}
                        mipmapBlur
                        intensity={1.5}
                        radius={0.6}
                    />
                </EffectComposer>

                <CameraController forward={forward} backward={backward} left={left} right={right} />
                <PointerLockControls selector="#play-button" />
            </Canvas>

            {/* HUD TEXT (Source of "fixed text") */}
            <div className="absolute top-4 left-4 z-10 text-white pointer-events-none">
                <div className="bg-black/60 p-4 rounded-lg border border-white/10 backdrop-blur-md min-w-[180px]">
                    <p className="text-xs text-blue-300 font-medium uppercase tracking-wider mb-1">{locationType}</p>
                    <p className="text-2xl font-serif text-white">{locationInfo}</p>
                </div>
            </div>

            <div className="absolute top-4 left-4 z-20" style={{ transform: 'translateY(120px)' }}>
                <a href="/tonnetz" className="pointer-events-auto inline-block text-white/40 hover:text-white px-4 py-2 text-sm">
                    ← Exit
                </a>
            </div>

            <div className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20">
                <div id="play-button" className="cursor-pointer bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-full backdrop-blur border border-white/20 transition">
                    Click to Enter
                </div>
            </div>
        </div>
    );
}

function CameraController({ forward, backward, left, right }: any) {
    const { camera } = useThree();
    useFrame((_, delta) => {
        const speed = 8.0 * delta;
        if (forward) camera.translateZ(-speed);
        if (backward) camera.translateZ(speed);
        if (left) camera.translateX(-speed);
        if (right) camera.translateX(speed);
        camera.position.y = CAMERA_HEIGHT;
    });
    return null;
}

function usePlayerControls() {
    const [movement, setMovement] = useState({ forward: false, backward: false, left: false, right: false });

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'KeyW': setMovement((m) => ({ ...m, forward: true })); break;
                case 'KeyS': setMovement((m) => ({ ...m, backward: true })); break;
                case 'KeyA': setMovement((m) => ({ ...m, left: true })); break;
                case 'KeyD': setMovement((m) => ({ ...m, right: true })); break;
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            switch (e.code) {
                case 'KeyW': setMovement((m) => ({ ...m, forward: false })); break;
                case 'KeyS': setMovement((m) => ({ ...m, backward: false })); break;
                case 'KeyA': setMovement((m) => ({ ...m, left: false })); break;
                case 'KeyD': setMovement((m) => ({ ...m, right: false })); break;
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keyup', handleKeyUp);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.removeEventListener('keyup', handleKeyUp);
        };
    }, []);
    return movement;
}
