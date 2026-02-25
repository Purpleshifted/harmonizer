import * as THREE from 'three';

export const WAVE_UNIFORMS = {
    uTime: { value: 0 },
    uWaveAmplitude: { value: 0 },
    uWaveFrequency: { value: 0 },
    uWaveSpeed: { value: 0 },
    uWaveActive: { value: 0 },
    uWaveProgress: { value: -1.0 },
    uWaveAngle: { value: 0.0 },
    uWaveIsStrong: { value: 0 },
    uPlayerWorldPos: { value: new THREE.Vector3() }
};

export const WAVE_VERTEX_CHUNK = `
    uniform float uTime;
    uniform float uWaveAmplitude;
    uniform float uWaveFrequency;
    uniform float uWaveSpeed;
    uniform int uWaveActive;
    uniform float uWaveProgress;
    uniform float uWaveAngle;
    uniform int uWaveIsStrong;
    uniform vec3 uPlayerWorldPos;

    struct WaveInfo {
        float height;
        float crest; // The visual bloom intensity (bloom band)
        vec3 sweepForce;
    };

    WaveInfo getWaveInfo(vec3 pos) {
        float phase1 = pos.x * uWaveFrequency + uTime * uWaveSpeed;
        float phase2 = pos.z * uWaveFrequency * 0.7 + uTime * uWaveSpeed * 0.8;
        float phase3 = (pos.x + pos.z) * uWaveFrequency * 1.3 + uTime * uWaveSpeed * 1.2;
        
        float wave1 = sin(phase1) * uWaveAmplitude;
        float wave2 = sin(phase2) * uWaveAmplitude * 0.5;
        float wave3 = sin(phase3) * uWaveAmplitude * 0.25;
        
        float sharpCrest = 0.0;
        
        if (uWaveActive > 0) {
            // Distance targeting:
            // The hill starts at 120 units away, arriving precisely when volume peaks (progress 0.5)
            // and washes away to -120 units over 6 seconds.
            float targetDist = 0.0;
            if (uWaveProgress <= 0.5) {
                targetDist = mix(120.0, 0.0, uWaveProgress / 0.5);
            } else {
                targetDist = mix(0.0, -120.0, (uWaveProgress - 0.5) / 0.5);
            }
            
            // Calculate distance of 'pos' along the wave travel direction relative to the player
            // The wave moves from +direction towards -direction, exactly like the audio
            vec2 dir = vec2(cos(uWaveAngle), sin(uWaveAngle));
            float distAlongWave = dot(vec2(pos.x, pos.z) - vec2(uPlayerWorldPos.x, uPlayerWorldPos.z), dir);
            
            // The hill is located at 'targetDist' along the wave vector
            float distToHill = abs(distAlongWave - targetDist);
            
            // Limit the physical width of the wave (widened for a broader hill)
            float hillShape = 1.0 - smoothstep(0.0, 50.0, distToHill);
            
            // Audio fade mapping: matches exact volume crash
            float audioCurve = pow(sin(uWaveProgress * 3.14159), 1.5);
            
            sharpCrest = hillShape * audioCurve;
        }
        
        WaveInfo info;
        // Physical visual hill (strong waves peak much higher)
        float heightMultiplier = uWaveIsStrong > 0 ? 3.0 : 1.5;
        info.height = wave1 + wave2 + wave3 + (sharpCrest * uWaveAmplitude * heightMultiplier);
        
        // Bloom band effect always present (soft), but explosively bright on Strong (1 in 3 waves)
        info.crest = uWaveIsStrong > 0 ? sharpCrest : sharpCrest * 0.15;
        
        // Sweep force physically pushes items toward the wave vector's negative direction
        info.sweepForce = vec3(-cos(uWaveAngle), 0.4, -sin(uWaveAngle)) * sharpCrest * uWaveAmplitude * 2.5;
        
        return info;
    }

    vec3 applyWave(vec3 pos) {
        pos.y += getWaveInfo(pos).height;
        return pos;
    }
`;
