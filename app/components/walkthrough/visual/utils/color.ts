/**
 * THREE.Color accepts only 6-digit hex (#RRGGBB). Leva/UI often use 8-digit (#RRGGBBAA).
 * Strip alpha so we don't trigger "Invalid hex color" warnings every frame.
 */
export function hexToThreeColor(hex: string): string {
    if (typeof hex !== 'string' || !hex.startsWith('#')) return hex;
    const digits = hex.slice(1);
    if (digits.length === 8) return '#' + digits.slice(0, 6);
    return hex;
}
