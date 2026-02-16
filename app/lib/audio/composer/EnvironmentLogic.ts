/**
 * EnvironmentLogic - Physical & Spatial Simulation.
 * Logic for how sound behaves in the 3D environment.
 */
import * as THREE from 'three';

export class EnvironmentLogic {
    /**
     * Calculates gain based on distance for ambient/drone sounds.
     */
    public calculateDistanceGain(distance: number, maxRange: number = 25, intensity: number = 0.1): number {
        const factor = Math.max(0, 1 - distance / maxRange);
        return factor * intensity;
    }

    /**
     * Calculates the rotation and intensity parameters for the environmental wave simulation.
     */
    public calculateWaveParams(waveCycle: number, centerPos: THREE.Vector3, config: any) {
        const cyclePos = waveCycle % config.period;
        const cycleIndex = Math.floor(waveCycle / config.period);
        const isStrong = cycleIndex % 10 === 0; // Only 1 in 10 waves is strong

        let intensity = config.baseVolume;
        let radius = 36;
        let filterFreq = 1000;
        const targetPos = new THREE.Vector3();

        const angle = (waveCycle / config.period) * Math.PI * 2;

        if (cyclePos < config.duration) {
            const progress = cyclePos / config.duration;
            const curve = Math.pow(Math.sin(progress * Math.PI), 1.5);

            // Calibrated multipliers for subtle vs occasional strong (more distant/ethereal)
            let peakMultiplier = isStrong ? 0.4 : 0.12;
            let radiusApproach = isStrong ? 18 : 8;
            let brightnessPeak = isStrong ? 1800 : 500;

            radius = 36 - (curve * radiusApproach);
            intensity = config.baseVolume + (curve * peakMultiplier);
            filterFreq = 1000 + (curve * brightnessPeak);

            targetPos.set(
                centerPos.x + Math.cos(angle) * radius,
                centerPos.y + 1.2,
                centerPos.z + Math.sin(angle) * radius
            );
        } else {
            targetPos.set(
                centerPos.x + Math.cos(angle) * 36,
                centerPos.y + 1.2,
                centerPos.z + Math.sin(angle) * 36
            );
            intensity = config.baseVolume * 0.8;
            filterFreq = 800;
        }

        return { intensity, filterFreq, targetPos };
    }
}
