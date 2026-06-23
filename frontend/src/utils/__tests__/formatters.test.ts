/**
 * Unit tests for display formatting utilities in formatters.ts
 *
 * Validates Requirements 8.1 (CIS explanation text) and 8.4 (station filtering).
 */

import { describe, it, expect } from 'vitest';
import { formatCisExplanation, formatAddress, filterStations } from '../formatters';
import type { Hotspot, Station } from '../../types/index';

// ---------------------------------------------------------------------------
// Minimal mock factories
// ---------------------------------------------------------------------------

function makeHotspot(overrides: Partial<Hotspot> = {}): Hotspot {
  return {
    h3_index: '8a2a1072b59ffff',
    latitude: 13.0607,
    longitude: 80.2785,
    violation_count: 10,
    dominant_violation_types: [{ type: 'parking', count: 10 }],
    peak_hour_label: '8–9 AM',
    cis: 26.0,
    cis_normalized: 0.75,
    global_cis_normalized: 0.5,
    est_delay_minutes: 42.0,
    junction_flag: false,
    sample_address: null,
    ai_cluster_validated: true,
    ai_anomaly_score: 0.05,
    ai_risk_flag: false,
    ...overrides,
  };
}

function makeStation(name: string): Station {
  return {
    name,
    filename: `${name.toLowerCase().replace(/\s/g, '_')}.csv`,
    bbox: { min_lat: 12.9, max_lat: 13.1, min_lon: 80.1, max_lon: 80.4 },
  };
}

// ---------------------------------------------------------------------------
// formatCisExplanation — Requirement 8.1
// ---------------------------------------------------------------------------

describe('formatCisExplanation', () => {
  it('contains the violation_count in the output string', () => {
    const hotspot = makeHotspot({ violation_count: 10, cis: 26.0, junction_flag: true });
    const result = formatCisExplanation(hotspot);
    expect(result).toContain('10');
  });

  it('contains a severity weight approximation (2 decimal places)', () => {
    // junction_flag=true => junctionFactor=1.3; severityMean = 26 / (10 * 1.3) = 2.00
    const hotspot = makeHotspot({ violation_count: 10, cis: 26.0, junction_flag: true });
    const result = formatCisExplanation(hotspot);
    expect(result).toContain('2.00');
  });

  it('contains the junction label when junction_flag is true', () => {
    const hotspot = makeHotspot({ junction_flag: true });
    const result = formatCisExplanation(hotspot);
    expect(result).toContain('junction proximity');
  });

  it('contains "no junction" label when junction_flag is false', () => {
    const hotspot = makeHotspot({ junction_flag: false });
    const result = formatCisExplanation(hotspot);
    expect(result).toContain('no junction');
  });

  it('contains the peak_hour_label in the output string', () => {
    const hotspot = makeHotspot({ peak_hour_label: '8–9 AM' });
    const result = formatCisExplanation(hotspot);
    expect(result).toContain('8–9 AM');
  });
});

// ---------------------------------------------------------------------------
// formatAddress — Requirements 8.1 / 6.2
// ---------------------------------------------------------------------------

describe('formatAddress', () => {
  it('returns sample_address when it is present', () => {
    const hotspot = makeHotspot({ sample_address: 'Test Road' });
    expect(formatAddress(hotspot)).toBe('Test Road');
  });

  it('falls back to coordinates (4 decimal places) when sample_address is null', () => {
    const hotspot = makeHotspot({
      sample_address: null,
      latitude: 13.0607,
      longitude: 80.2785,
    });
    expect(formatAddress(hotspot)).toBe('13.0607, 80.2785');
  });
});

// ---------------------------------------------------------------------------
// filterStations — Requirement 8.4
// ---------------------------------------------------------------------------

describe('filterStations', () => {
  const stations = [
    makeStation('Chennai Central'),
    makeStation('Tambaram'),
    makeStation('Guindy'),
  ];

  it('returns all stations for an empty query', () => {
    expect(filterStations(stations, '')).toHaveLength(3);
  });

  it('returns all stations for a whitespace-only query', () => {
    expect(filterStations(stations, '   ')).toHaveLength(3);
  });

  it('filters stations by exact name substring (case-insensitive, lowercase query)', () => {
    const result = filterStations(stations, 'central');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Chennai Central');
  });

  it('filters stations case-insensitively (uppercase query)', () => {
    const result = filterStations(stations, 'TAMBARAM');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Tambaram');
  });

  it('returns empty array when no station matches the query', () => {
    expect(filterStations(stations, 'Mumbai')).toHaveLength(0);
  });
});
