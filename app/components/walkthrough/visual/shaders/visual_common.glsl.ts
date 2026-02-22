import * as THREE from 'three';

// Factory functions - each call creates NEW instances to prevent shared mutation
export const COMMON_UNIFORMS = () => ({
    uTime: { value: 0 },
    uPlayerPos: { value: new THREE.Vector3() },
    uGridOffset: { value: new THREE.Vector3() },
});

export const COLOR_UNIFORMS = () => ({
    uMajorColor: { value: new THREE.Color() },
    uMinorColor: { value: new THREE.Color() },
    uNeutralColor: { value: new THREE.Color() },
    uSmoothMajor: { value: 0 },
    uSmoothNeutral: { value: 0 },
});

export const BLOOM_UNIFORMS = () => ({
    uBloomStartRadius: { value: 0 },
    uBloomFadeLength: { value: 0 },
    uBloomIntensity: { value: 0 },
    uColorStartRadius: { value: 0 },
    uColorFadeLength: { value: 0 },
    uFogFar: { value: 200.0 },
});

export const FRAGMENT_CHUNK = `
    uniform vec3 uMajorColor;
    uniform vec3 uMinorColor;
    uniform vec3 uNeutralColor;
    uniform float uSmoothMajor;
    uniform float uSmoothNeutral;

    uniform float uBloomStartRadius;
    uniform float uBloomFadeLength;
    uniform float uBloomIntensity;
    uniform float uColorStartRadius;
    uniform float uColorFadeLength;
    uniform float uFogFar;

    // Layer 1: Bloom (HDR intensity gradient)
    float getBloomFactor(float dist) {
        float bloomEnd = uBloomStartRadius + uBloomFadeLength;
        float raw = smoothstep(uBloomStartRadius, bloomEnd, dist);
        return pow(raw, 0.7); // steeper curve for more visible gradient
    }

    float getBloomMultiplier(float bloomFactor) {
        return mix(1.0, uBloomIntensity, bloomFactor);
    }

    // Layer 2: Color (tint gradient, independent radius)
    float getColorFactor(float dist) {
        float colorEnd = uColorStartRadius + uColorFadeLength;
        float raw = smoothstep(uColorStartRadius, colorEnd, dist);
        return pow(raw, 0.7);
    }

    vec3 getFinalColor(float colorFactor) {
        vec3 modeColor = mix(uMinorColor, uMajorColor, uSmoothMajor);
        vec3 activeColor = mix(modeColor, uNeutralColor, uSmoothNeutral);
        return mix(uNeutralColor, activeColor, colorFactor);
    }

    float getFogAlpha(float dist) {
        return 1.0 - smoothstep(uFogFar - 50.0, uFogFar, dist);
    }
`;
