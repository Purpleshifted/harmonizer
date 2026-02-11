
import * as Tone from 'tone';
import * as THREE from 'three';
import { AudioMixer } from './AudioMixer';
import { ChannelOptions, BusName } from './MixerTypes';
import { createSpatialPanner, updatePannerPosition } from './SpatialAudio';

/**
 * ChannelStrip - Standardized Audio Routing Module
 * 
 * Structure:
 * Input -> [Panner] -> Fader (Volume) -> Output (Master)
 *                   -> Send Gains -> Aux Buses
 */
export class ChannelStrip {
    public readonly input: Tone.Gain;

    // Processing Nodes
    public panner?: Tone.Panner3D;
    public fader: Tone.Gain;

    // Sends
    private sendGains: Map<BusName, Tone.Gain> = new Map();

    constructor(
        private mixer: AudioMixer,
        options: ChannelOptions
    ) {
        this.input = new Tone.Gain(1.0);
        this.fader = new Tone.Gain(options.volume !== undefined ? Tone.dbToGain(options.volume) : 1.0);

        let signalHead: Tone.ToneAudioNode = this.input;

        // 1. Spatial Panning (Optional)
        if (options.panned) {
            this.panner = createSpatialPanner(options.spatialOptions);
            signalHead.connect(this.panner);
            signalHead = this.panner;
        }

        // 2. Fader (Volume)
        signalHead.connect(this.fader);

        // 3. Output to Master
        this.fader.connect(mixer.masterBus);

        // 4. Setup Ends
        // Sends are usually Post-Fader or Pre-Fader. 
        // Let's implement POST-Fader for Reverbs (so reverb fades with volume).
        // 
        // Route: Fader -> SendGain -> AuxBus
        if (options.sends) {
            Object.entries(options.sends).forEach(([busName, amount]) => {
                this.addSend(busName as BusName, amount);
            });
        }
    }

    /**
     * Add or Update a Send
     * @param busName Name of the destination bus
     * @param amount Send amount (0-1)
     */
    public addSend(busName: BusName, amount: number) {
        if (!this.sendGains.has(busName)) {
            const sendGain = new Tone.Gain(amount);
            // Connect Post-Fader
            this.fader.connect(sendGain);

            const busInput = this.mixer.getBus(busName);
            sendGain.connect(busInput);

            this.sendGains.set(busName, sendGain);
        } else {
            this.sendGains.get(busName)!.gain.value = amount;
        }
    }

    /**
     * Update 3D Position
     */
    public setPosition(pos: THREE.Vector3, rampTime = 0.1) {
        if (this.panner) {
            updatePannerPosition(this.panner, pos, rampTime);
        }
    }

    /**
     * Set Volume (Linear 0-1)
     */
    public setVolume(volume: number, rampTime = 0.1) {
        const now = Tone.now();
        this.fader.gain.rampTo(volume, rampTime, now);
    }

    /**
     * Set Volume (Decibels)
     */
    public setVolumeDb(db: number, rampTime = 0.1) {
        const now = Tone.now();
        this.fader.gain.rampTo(Tone.dbToGain(db), rampTime, now);
    }

    public dispose() {
        this.input.dispose();
        this.panner?.dispose();
        this.fader.dispose();
        this.sendGains.forEach(g => g.dispose());
        this.sendGains.clear();
    }
}
