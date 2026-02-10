import { useEffect, useCallback } from 'react';
import { button, useStoreContext } from 'leva';
import { getVisualSettings, saveVisualSettings, VisualSettings } from '../../../../../actions/visualSettings';

/**
 * Leva Persistence Utility (Server-Side File Based)
 */

export function getInitialValue<T>(key: string, defaultValue: T): T {
    // Initial render always uses default value.
    // Client-side hydration will update this from server file.
    return defaultValue;
}

export function useLevaPersistence() {
    const store = useStoreContext();

    // Load settings from server file on mount
    useEffect(() => {
        if (!store) return;

        const loadSettings = async () => {
            try {
                const savedSettings = await getVisualSettings();
                if (savedSettings) {
                    console.log('[Persistence] Loaded settings from server:', savedSettings);

                    // Update Leva store with saved values
                    // store.set(values, emit)
                    // We iterate and set each value to ensure type safety and trigger updates
                    Object.entries(savedSettings).forEach(([key, value]) => {
                        // @ts-ignore - Leva store internal type
                        try {
                            store.setValueAtPath(key, value, false);
                        } catch { /* key not found in store */ }
                    });
                }
            } catch (error) {
                console.error('[Persistence] Failed to load settings:', error);
            }
        };

        loadSettings();
    }, [store]);

    const handleSaveDefaults = useCallback(async () => {
        if (!store) return;

        const data = store.getData();
        const settings: VisualSettings = {};

        Object.entries(data).forEach(([key, value]) => {
            if (key !== 'Save as Default' && key !== 'Reset to Default') {
                const cleanKey = key.split('.').pop() || key;

                // @ts-ignore - access internal value structure
                if (value && typeof value === 'object' && 'value' in value) {
                    // @ts-ignore
                    settings[cleanKey] = value.value;
                } else {
                    settings[cleanKey] = value;
                }
            }
        });

        const success = await saveVisualSettings(settings);
        if (success) {
            console.log('[Persistence] Settings saved to file');
            alert('Settings saved to server file (visual-config.json)!');
        } else {
            alert('Failed to save settings.');
        }
    }, [store]);

    return {
        'Save as Default': button(async () => {
            console.log('[Persistence] Save button clicked');
            await handleSaveDefaults();
        }),
        'Reset to Default': button(() => {
            if (confirm('Reset to defaults? (Reloads page)')) {
                // To reset, we just reload without saving. 
                // Alternatively we could delete the file, but for now just reload.
                // Or we can set defaults manually.
                window.location.reload();
            }
        }),
    };
}
