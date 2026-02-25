export const WAVE_UNIFORMS = {
    uTime: { value: 0 },
    uWaveAmplitude: { value: 0 },
    uWaveFrequency: { value: 0 },
    uWaveSpeed: { value: 0 },
    uAudioWaveProgress: { value: -1.0 }
};

export const WAVE_VERTEX_CHUNK = `
    uniform float uTime;
    uniform float uWaveAmplitude;
    uniform float uWaveFrequency;
    uniform float uWaveSpeed;
    uniform float uAudioWaveProgress;

    struct WaveInfo {
        float height;
        float crest;
        vec3 sweepForce;
    };

    WaveInfo getWaveInfo(vec3 pos) {
        float phase1 = pos.x * uWaveFrequency + uTime * uWaveSpeed;
        float phase2 = pos.z * uWaveFrequency * 0.7 + uTime * uWaveSpeed * 0.8;
        float phase3 = (pos.x + pos.z) * uWaveFrequency * 1.3 + uTime * uWaveSpeed * 1.2;
        
        float wave1 = sin(phase1) * uWaveAmplitude;
        float wave2 = sin(phase2) * uWaveAmplitude * 0.5;
        float wave3 = sin(phase3) * uWaveAmplitude * 0.25;
        
        // Crest dynamically maps exactly to the math driving the new audio cycle and the camera physics
        // Wave peaks strictly when phase % 2PI approaches PI/2 (normCrest -> 1.0)
        float normCrest = (sin(phase1) + 1.0) * 0.5;
        
        float sharpCrest = 0.0;
        if (normCrest > 0.8) {
            float presence = (normCrest - 0.8) * 5.0; // 0.0 to 1.0
            sharpCrest = pow(presence, 1.5);
        }
        
        WaveInfo info;
        // Crest visually pushes the terrain an extra amount, giving it physical height
        info.height = wave1 + wave2 + wave3 + (sharpCrest * uWaveAmplitude * 1.5);
        info.crest = sharpCrest;
        
        // Horizontal push force toward negative X
        info.sweepForce = vec3(-1.0, 0.4, 0.0) * sharpCrest * uWaveAmplitude * 2.5;
        
        return info;
    }

    vec3 applyWave(vec3 pos) {
        pos.y += getWaveInfo(pos).height;
        return pos;
    }
`;
