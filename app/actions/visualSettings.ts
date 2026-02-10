'use server';

import { promises as fs } from 'fs';
import path from 'path';

const SETTINGS_FILE_PATH = path.join(process.cwd(), 'app', 'components', 'walkthrough', 'modes', 'visual', 'visual-config.json');

export interface VisualSettings {
    [key: string]: unknown;
}

export async function getVisualSettings(): Promise<VisualSettings | null> {
    try {
        const content = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        // File doesn't exist or is invalid
        return null;
    }
}

export async function saveVisualSettings(settings: VisualSettings): Promise<boolean> {
    try {
        await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(settings, null, 2), 'utf-8');
        return true;
    } catch (error) {
        console.error('Failed to save visual settings:', error);
        return false;
    }
}
