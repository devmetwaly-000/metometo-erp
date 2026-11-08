

// Function to set a CSS variable on the root element
export function setCssVariable(variableName: string, value: string | null) {
  if (typeof window !== 'undefined' && value) {
    document.documentElement.style.setProperty(variableName, value);
  }
}

// Converts a hex color string to an HSL string 'h s% l%'
export function hexToHsl(hex: string, lightnessAdjustment: number = 1): string {
    if (!hex || typeof hex !== 'string') return '0 0% 0%';
    
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt(hex[1] + hex[1], 16);
        g = parseInt(hex[2] + hex[2], 16);
        b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
        r = parseInt(hex[1] + hex[2], 16);
        g = parseInt(hex[3] + hex[4], 16);
        b = parseInt(hex[5] + hex[6], 16);
    }
    
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    h = Math.round(h * 360);
    s = Math.round(s * 100);
    l = Math.round(l * 100 * lightnessAdjustment);
    l = Math.max(0, Math.min(100, l)); // Clamp lightness between 0 and 100

    return `${h} ${s}% ${l}%`;
}


// Converts an HSL string like "h s% l%" or "hsl(h, s%, l%)" to a hex color string
export function hslStringToHex(hslStr: string): string {
    if (!hslStr) return '#000000';
    
    const parsed = parseHsl(hslStr);
    if (!parsed) return '#000000';

    let { h, s, l } = parsed;
    s /= 100;
    l /= 100;

    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) =>
        l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    
    const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
    
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

// Parses HSL string into an object, supports "h s% l%" and "hsl(h, s%, l%)"
export function parseHsl(hslStr: string): { h: number; s: number; l: number } | null {
  if (!hslStr) return null;
  const match = hslStr.match(/^(?:hsl\()?(\d+\.?\d*)[,\s]+(\d+\.?\d*)%?[,\s]+(\d+\.?\d*)%?\)?$/);
  if (match) {
    return {
      h: parseFloat(match[1]),
      s: parseFloat(match[2]),
      l: parseFloat(match[3]),
    };
  }
  return null;
}
