'use client';

import React, { useEffect, useRef, useState, createContext, useContext } from 'react';
import * as Tone from 'tone';

interface AudioContextValue {
    isReady: boolean;
    startAudio: () => Promise<void>;
}

const AudioContext = createContext<AudioContextValue>({
    isReady: false,
    startAudio: async () => { },
});

export const useAudioContext = () => useContext(AudioContext);

interface AudioManagerProps {
    children: React.ReactNode;
}

/**
 * Audio manager component that handles Tone.js context initialization
 * Must wrap all audio-using components
 */
export function AudioManager({ children }: AudioManagerProps) {
    const [isReady, setIsReady] = useState(false);
    const initRef = useRef(false);

    const startAudio = async () => {
        if (initRef.current) return;
        initRef.current = true;

        try {
            await Tone.start();
            console.log('Audio context started');
            setIsReady(true);
        } catch (err) {
            console.error('Failed to start audio context:', err);
            initRef.current = false;
        }
    };

    // Clean up on unmount
    useEffect(() => {
        return () => {
            if (isReady) {
                // Dispose of all Tone.js resources
                Tone.getTransport().stop();
                Tone.getTransport().cancel();
            }
        };
    }, [isReady]);

    return (
        <AudioContext.Provider value={{ isReady, startAudio }}>
            {children}
        </AudioContext.Provider>
    );
}

/**
 * Component to trigger audio start on user interaction
 */
export function AudioStartButton({ onStart }: { onStart?: () => void }) {
    const { isReady, startAudio } = useAudioContext();

    const handleClick = async () => {
        await startAudio();
        onStart?.();
    };

    if (isReady) return null;

    return (
        <div
            onClick={handleClick}
            className="absolute bottom-10 left-1/2 transform -translate-x-1/2 z-20 
                       cursor-pointer bg-white/10 hover:bg-white/20 text-white 
                       px-6 py-3 rounded-full backdrop-blur border border-white/20 transition"
        >
            Click to Enter
        </div>
    );
}
