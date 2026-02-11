
import * as Tone from 'tone';
import { ReverbPreset } from './ReverbFactory';

export type BusName = 'master' | 'reverb-ambient' | 'reverb-spatial' | 'reverb-deep' | 'delay';

export interface MixerBus {
    name: BusName;
    input: Tone.Gain;
}

export interface ChannelOptions {
    name: string;
    volume?: number; // dB, default 0
    pan?: number; // -1 to 1, default 0
    panned?: boolean; // If true, uses Panner3D. If false, uses StereoPanner (or just Gain)
    spatialOptions?: {
        useHRTF?: boolean;
        refDistance?: number;
        maxDistance?: number;
        rolloffFactor?: number;
    };
    sends?: Partial<Record<BusName, number>>; // BusName -> Gain amount (0-1)
}
