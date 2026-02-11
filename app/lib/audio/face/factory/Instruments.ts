export type InstrumentName = 'contrabass' | 'cello' | 'french-horn';

export const SAMPLE_MAPS: Record<InstrumentName, Record<string, string>> = {
    contrabass: {
        'A2': 'A2.mp3',
        'A#1': 'As1.mp3',
        'B3': 'B3.mp3',
        'C2': 'C2.mp3',
        'C#3': 'Cs3.mp3',
        'D2': 'D2.mp3',
        'E2': 'E2.mp3',
        'E3': 'E3.mp3',
        'F#1': 'Fs1.mp3',
        'F#2': 'Fs2.mp3',
        'G1': 'G1.mp3',
        'G#2': 'Gs2.mp3',
        'G#3': 'Gs3.mp3',
    },
    cello: {
        'A2': 'A2.mp3', 'A3': 'A3.mp3', 'A4': 'A4.mp3',
        'A#2': 'As2.mp3', 'A#3': 'As3.mp3',
        'B2': 'B2.mp3', 'B3': 'B3.mp3', 'B4': 'B4.mp3',
        'C2': 'C2.mp3', 'C3': 'C3.mp3', 'C4': 'C4.mp3', 'C5': 'C5.mp3',
        'C#3': 'Cs3.mp3', 'C#4': 'Cs4.mp3',
        'D2': 'D2.mp3', 'D3': 'D3.mp3', 'D4': 'D4.mp3',
        'D#2': 'Ds2.mp3', 'D#3': 'Ds3.mp3', 'D#4': 'Ds4.mp3',
        'E2': 'E2.mp3', 'E3': 'E3.mp3', 'E4': 'E4.mp3',
        'F2': 'F2.mp3', 'F3': 'F3.mp3', 'F4': 'F4.mp3',
        'F#3': 'Fs3.mp3', 'F#4': 'Fs4.mp3',
        'G2': 'G2.mp3', 'G3': 'G3.mp3', 'G4': 'G4.mp3',
        'G#2': 'Gs2.mp3', 'G#3': 'Gs3.mp3', 'G#4': 'Gs4.mp3',
    },
    'french-horn': {
        'A1': 'A1.mp3', 'A3': 'A3.mp3',
        'C2': 'C2.mp3', 'C4': 'C4.mp3',
        'D3': 'D3.mp3', 'D5': 'D5.mp3',
        'D#2': 'Ds2.mp3',
        'F3': 'F3.mp3', 'F5': 'F5.mp3',
        'G2': 'G2.mp3',
    }
};

export const INSTRUMENT_RANGES: Record<InstrumentName, { min: number, max: number }> = {
    contrabass: { min: 1, max: 3 },
    cello: { min: 2, max: 5 },
    'french-horn': { min: 2, max: 5 },
};
