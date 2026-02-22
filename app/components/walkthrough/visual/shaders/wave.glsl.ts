export const WAVE_UNIFORMS = {
    uTime: { value: 0 },
    uWaveAmplitude: { value: 0 },
    uWaveFrequency: { value: 0 },
    uWaveSpeed: { value: 0 },
};

export const WAVE_VERTEX_CHUNK = `
    uniform float uTime;
    uniform float uWaveAmplitude;
    uniform float uWaveFrequency;
    uniform float uWaveSpeed;

    vec3 applyWave(vec3 pos) {
        float wave1 = sin(pos.x * uWaveFrequency + uTime * uWaveSpeed) * uWaveAmplitude;
        float wave2 = sin(pos.z * uWaveFrequency * 0.7 + uTime * uWaveSpeed * 0.8) * uWaveAmplitude * 0.5;
        float wave3 = sin((pos.x + pos.z) * uWaveFrequency * 1.3 + uTime * uWaveSpeed * 1.2) * uWaveAmplitude * 0.25;
        
        pos.y += wave1 + wave2 + wave3;
        return pos;
    }
`;
