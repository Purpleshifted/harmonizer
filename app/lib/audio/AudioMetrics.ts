/**
 * AudioMetrics - A simple global state object to share realtime audio levels with visual components.
 * Written by the audio engine, read by the React components in useFrame.
 */
export const AudioMetrics = {
    edgeLevel: 0,
    nodeLevel: 0,
    faceLevel: 0,
    lastNodeTrigger: {
        time: 0,
        pos: { x: 0, y: 0, z: 0 }
    },
    defaultEyeLevel: 5.0,
    globalTime: 0.0,
    audioWaveProgress: -1.0,
    waveState: {
        active: false,
        progress: -1.0,
        angle: 0.0,
        isStrong: false,
    },
    waveParams: {
        amplitude: 1.2,
        frequency: 0.05,
        speed: 0.6
    }
};
