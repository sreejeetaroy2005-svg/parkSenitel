/**
 * Color and sizing utilities for Hotspot map markers.
 *
 * Implements Requirements 7.3 and 7.4:
 *  - 7.3: Marker radius scales linearly 8–24 px based on cis_normalized (0→8, 100→24)
 *  - 7.4: Marker color ramps from amber (#F5A623) at 0 to signal red (#C0392B) at 100
 */

// Amber (#F5A623) — low CIS
const COLOR_LOW = { r: 0xf5, g: 0xa6, b: 0x23 };
// Signal red (#C0392B) — high CIS
const COLOR_HIGH = { r: 0xc0, g: 0x39, b: 0x2b };

/**
 * Maps a normalised CIS value (0–100) to a hex colour string by linearly
 * interpolating each RGB channel between amber and signal red.
 *
 * @param cisNormalized - value in [0, 100] (clamped if outside range)
 * @returns 6-digit hex colour string, e.g. `"#E85F25"`
 */
export function cisToColor(cisNormalized: number): string {
  const t = Math.max(0, Math.min(100, cisNormalized)) / 100;

  const r = Math.round(COLOR_LOW.r + t * (COLOR_HIGH.r - COLOR_LOW.r));
  const g = Math.round(COLOR_LOW.g + t * (COLOR_HIGH.g - COLOR_LOW.g));
  const b = Math.round(COLOR_LOW.b + t * (COLOR_HIGH.b - COLOR_LOW.b));

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Maps a normalised CIS value (0–100) to a marker radius in pixels.
 * Formula: 8 + (cisNormalized / 100) * 16
 *  - 0  → 8 px
 *  - 100 → 24 px
 *
 * @param cisNormalized - value in [0, 100] (clamped if outside range)
 * @returns radius in pixels
 */
export function cisToRadius(cisNormalized: number): number {
  const clamped = Math.max(0, Math.min(100, cisNormalized));
  return 8 + (clamped / 100) * 16;
}
